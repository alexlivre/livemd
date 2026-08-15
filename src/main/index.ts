import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import type { FSWatcher } from 'chokidar';
import { mapOsLocale, t, type AppLanguage } from '@shared/i18n';
import { MARKDOWN_EXT_RE, MARKDOWN_EXTENSIONS, MAX_FILE_BYTES } from '@shared/constants';
import { suggestBackupPath } from '@shared/backupName';
import { parseVersion, versionsDiffer } from '@shared/version';
import { enablePerf, perfMark } from '@shared/perf';

const PERF_ENABLED = process.env.LIVEMD_PERF === '1';

enablePerf(PERF_ENABLED);
perfMark('main:module-loaded');

// Chromium switches proven in production by VS Code (src/main.ts): disable
// the native window occlusion tracker and establish the GPU channel
// asynchronously so the first paint is not blocked on it.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('enable-features', 'EarlyEstablishGpuChannel,EstablishGpuChannelAsync');
app.commandLine.appendSwitch('disable-blink-features', 'StandardizedBrowserZoom');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const watched = new Map<string, FSWatcher>();
const watchCounts = new Map<string, number>();
const readablePaths = new Set<string>();

let chokidarPromise: Promise<typeof import('chokidar')> | null = null;

function getChokidar(): Promise<typeof import('chokidar')> {
  chokidarPromise ??= import('chokidar');
  return chokidarPromise;
}
let mainWindow: BrowserWindow | null = null;
let pendingOpenPath: string | null = null;

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

interface Settings {
  language?: AppLanguage;
}

function readSettings(): Settings {
  try {
    return JSON.parse(fsSync.readFileSync(SETTINGS_FILE, 'utf-8')) as Settings;
  } catch {
    return {};
  }
}

function writeSettings(partial: Settings): void {
  const merged = { ...readSettings(), ...partial };
  try {
    fsSync.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fsSync.writeFileSync(SETTINGS_FILE, JSON.stringify(merged), 'utf-8');
  } catch {
    /* ignore */
  }
}

let currentLang: AppLanguage = readSettings().language ?? mapOsLocale(app.getLocale());
const REPO_API = 'alexlivre/livemd';
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function isMarkdown(filePath: string): boolean {
  return MARKDOWN_EXT_RE.test(filePath);
}

function trustPath(filePath: string): void {
  readablePaths.add(path.resolve(filePath));
}

// Converts a file:// URL (as produced by a browser-initiated navigation to a
// dropped file) into an OS path, e.g. file:///C:/a%20b/x.md -> C:/a b/x.md.
function filePathFromFileUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') return null;
    let filePath = decodeURIComponent(parsed.pathname);
    if (/^[a-z]$/i.test(parsed.hostname)) {
      filePath = `${parsed.hostname}:${filePath}`;
    } else {
      filePath = filePath.replace(/^\/([A-Za-z]:)/, '$1');
    }
    return filePath || null;
  } catch {
    return null;
  }
}

function extractMarkdownFromArgs(argv: string[]): string | null {
  // Skip the executable; look for the first arg ending with a Markdown extension.
  // Exclude flags (starting with "-") and the "." used in dev.
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || arg.startsWith('-')) continue;
    if (arg === '.') continue;
    if (isMarkdown(arg)) {
      try {
        const resolved = path.resolve(arg);
        return resolved;
      } catch {
        return arg;
      }
    }
  }
  return null;
}

async function readMarkdownFile(filePath: string) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error(t(currentLang, 'notAFile'));
  if (stat.size > MAX_FILE_BYTES) throw new Error(t(currentLang, 'fileTooLarge'));
  const content = await fs.readFile(filePath, 'utf-8');
  return { content, modifiedAt: stat.mtimeMs };
}

async function watchFile(filePath: string, win: BrowserWindow): Promise<void> {
  const nextCount = (watchCounts.get(filePath) ?? 0) + 1;
  watchCounts.set(filePath, nextCount);
  if (watched.has(filePath)) return;

  const chokidar = await getChokidar();
  if (watched.has(filePath)) return;

  const watcher = chokidar.watch(filePath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 30 }
  });

  watcher.on('change', async () => {
    try {
      const { content, modifiedAt } = await readMarkdownFile(filePath);
      win.webContents.send('file:event', {
        kind: 'changed',
        filePath,
        content,
        modifiedAt
      });
    } catch (err) {
      win.webContents.send('file:event', {
        kind: 'error',
        filePath,
        message: err instanceof Error ? err.message : String(err)
      });
    }
  });

  watcher.on('unlink', () => {
    win.webContents.send('file:event', { kind: 'removed', filePath });
  });

  watcher.on('add', () => {
    win.webContents.send('file:event', { kind: 'recreated', filePath });
  });

  watcher.on('error', (err) => {
    win.webContents.send('file:event', {
      kind: 'error',
      filePath,
      message: err.message
    });
  });

  watched.set(filePath, watcher);
}

function unwatchFile(filePath: string): void {
  const remaining = (watchCounts.get(filePath) ?? 1) - 1;
  if (remaining > 0) {
    watchCounts.set(filePath, remaining);
    return;
  }
  watchCounts.delete(filePath);
  const watcher = watched.get(filePath);
  if (!watcher) return;
  void watcher.close();
  watched.delete(filePath);
}

function unwatchAll(): void {
  for (const filePath of [...watched.keys()]) {
    unwatchFile(filePath);
  }
}

function focusMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function deliverOpenPath(filePath: string): void {
  trustPath(filePath);
  if (!mainWindow || mainWindow.webContents.isLoading()) {
    pendingOpenPath = filePath;
    return;
  }
  mainWindow.webContents.send('app:open-path', filePath);
  focusMainWindow();
}

function startWatch(filePath: string, win: BrowserWindow): void {
  void watchFile(filePath, win).catch((err) => {
    console.warn(`watch setup failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  });
}

function registerIpc(win: BrowserWindow): void {
  ipcMain.handle('file:open-dialog', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: t(currentLang, 'openDialogTitle'),
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: t(currentLang, 'filterMarkdown'), extensions: [...MARKDOWN_EXTENSIONS] },
        { name: t(currentLang, 'filterAll'), extensions: ['*'] }
      ]
    });

    if (result.canceled) return [];

    const candidates = result.filePaths.filter(isMarkdown);
    const settled = await Promise.allSettled(
      candidates.map(async (filePath) => {
        const { content, modifiedAt } = await readMarkdownFile(filePath);
        return { filePath, fileName: path.basename(filePath), content, modifiedAt };
      })
    );

    const files: { filePath: string; fileName: string; content: string; modifiedAt: number }[] = [];
    for (const filePath of candidates) {
      trustPath(filePath);
      startWatch(filePath, win);
    }
    for (const resultItem of settled) {
      if (resultItem.status === 'fulfilled') {
        files.push(resultItem.value);
      } else {
        const err = resultItem.reason;
        dialog.showErrorBox(
          t(currentLang, 'errorOpening'),
          `${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return files;
  });

  ipcMain.handle('file:read', async (_evt, filePath: unknown) => {
    if (typeof filePath !== 'string') throw new Error(t(currentLang, 'markdownOnly'));
    const resolved = path.resolve(filePath);
    if (!readablePaths.has(resolved)) throw new Error(t(currentLang, 'markdownOnly'));
    if (!isMarkdown(resolved)) throw new Error(t(currentLang, 'markdownOnly'));
    const { content, modifiedAt } = await readMarkdownFile(resolved);
    startWatch(resolved, win);
    return {
      filePath: resolved,
      fileName: path.basename(resolved),
      content,
      modifiedAt
    };
  });

  ipcMain.handle('file:allow-read', (_evt, filePath: unknown) => {
    if (typeof filePath === 'string' && isMarkdown(filePath)) {
      trustPath(filePath);
    }
  });

  ipcMain.handle('file:save-as', async (_evt, payload: unknown) => {
    if (typeof payload !== 'object' || payload === null) throw new Error('invalid payload');
    const { filePath, content } = payload as { filePath?: unknown; content?: unknown };
    if (typeof filePath !== 'string' || typeof content !== 'string') {
      throw new Error(t(currentLang, 'markdownOnly'));
    }
    if (content.length > MAX_FILE_BYTES) throw new Error(t(currentLang, 'fileTooLarge'));

    // The frozen version is a safety copy: default to a backup name so it
    // never collides with a file the deleting application may recreate.
    const defaultPath = suggestBackupPath(filePath, (candidate) => fsSync.existsSync(candidate));

    const result = await dialog.showSaveDialog(win, {
      title: t(currentLang, 'actSaveAs'),
      defaultPath,
      filters: [
        { name: t(currentLang, 'filterMarkdown'), extensions: [...MARKDOWN_EXTENSIONS] },
        { name: t(currentLang, 'filterAll'), extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePath) return null;

    await fs.writeFile(result.filePath, content, 'utf-8');
    return { savedPath: result.filePath };
  });

  ipcMain.handle('tab:close', (_evt, filePath: string): void => {
    unwatchFile(filePath);
  });

  ipcMain.handle('shell:reveal', (_evt, filePath: string): void => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('clipboard:write-text', (_evt, text: unknown): void => {
    clipboard.writeText(typeof text === 'string' ? text : String(text));
  });

  ipcMain.handle('app:consume-pending', (): string | null => {
    const p = pendingOpenPath;
    pendingOpenPath = null;
    return p;
  });

  ipcMain.handle('app:get-locale', () => app.getLocale());

  ipcMain.handle('app:set-language', (_evt, lang: unknown) => {
    if (lang === 'pt' || lang === 'en' || lang === 'es') {
      currentLang = lang;
      writeSettings({ language: lang });
    }
  });

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:open-external', async (_evt, url: unknown) => {
    if (typeof url !== 'string') return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return;
    await shell.openExternal(url);
  });

  ipcMain.handle('app:check-update', async () => {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO_API}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LiveMD' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { tag_name?: string };
      const latest = data.tag_name ?? '';
      if (!latest) return null;
      return { latestVersion: latest, hasUpdate: versionsDiffer(latest, app.getVersion()) };
    } catch {
      return null;
    }
  });

  ipcMain.handle('search:find', (_evt, text: unknown, options: unknown) => {
    if (typeof text !== 'string' || text.length === 0) {
      mainWindow?.webContents.stopFindInPage('clearSelection');
      return;
    }
    const opts = (options ?? {}) as { findNext?: boolean; forward?: boolean };
    mainWindow?.webContents.findInPage(text, {
      findNext: opts.findNext !== false,
      forward: opts.forward !== false
    });
  });

  ipcMain.handle('search:stop', () => {
    mainWindow?.webContents.stopFindInPage('clearSelection');
  });
}

async function createWindow(): Promise<void> {
  perfMark('main:create-window');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#f5f5f5',
    title: 'LiveMD',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  // Hide the default menu bar (File / Edit / View / etc.). All actions live
  // as in-window controls — OpenKeyVault-style custom UI.
  mainWindow.setMenuBarVisibility(false);
  Menu.setApplicationMenu(null);

  // When a file is dropped and the renderer's drag handlers don't take it
  // (e.g. the drop is rejected on file:// pages), Chromium attempts to
  // navigate to the file. Block the navigation and open the file instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (!url.startsWith('file://')) return;
    const filePath = filePathFromFileUrl(url);
    if (filePath && isMarkdown(filePath)) {
      deliverOpenPath(filePath);
    }
  });

  mainWindow.webContents.on('found-in-page', (_event, result) => {
    mainWindow?.webContents.send('search:found', {
      matches: result.matches,
      activeMatchOrdinal: result.activeMatchOrdinal
    });
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (!mainWindow) throw new Error('Falha ao criar janela');

  registerIpc(mainWindow);

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  const query = { lang: currentLang, ...(PERF_ENABLED ? { perf: '1' } : {}) };
  if (devUrl) {
    const url = new URL(devUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    await mainWindow.loadURL(url.toString());
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'), { query });
  }
  perfMark('main:did-finish-load');

  mainWindow.once('ready-to-show', () => {
    perfMark('main:ready-to-show');
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpenPath && mainWindow) {
      mainWindow.webContents.send('app:open-path', pendingOpenPath);
      pendingOpenPath = null;
    }
  });
}

// ---- Single instance lock ----
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_evt, argv) => {
    focusMainWindow();
    const filePath = extractMarkdownFromArgs(argv);
    if (filePath) {
      deliverOpenPath(filePath);
    }
  });

  // macOS file open events
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (app.isReady() && mainWindow) {
      deliverOpenPath(filePath);
    } else {
      pendingOpenPath = filePath;
    }
  });

  // Capture initial argv at startup (Windows "Open with" passes file here)
  const initialFromArgs = extractMarkdownFromArgs(process.argv);
  if (initialFromArgs) {
    pendingOpenPath = initialFromArgs;
  }

  app.whenReady().then(() => {
    perfMark('app:ready');
    if (PERF_ENABLED) {
      setTimeout(() => app.exit(0), 30_000);
    }
    return createWindow();
  });

  app.on('window-all-closed', () => {
    unwatchAll();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });

  app.on('before-quit', () => {
    unwatchAll();
  });
}
