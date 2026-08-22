import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import type { FSWatcher } from 'chokidar';
import { mapOsLocale, t, type AppLanguage } from '@shared/i18n';
import { MARKDOWN_EXT_RE, MARKDOWN_EXTENSIONS, MAX_FILE_BYTES } from '@shared/constants';
import { suggestBackupPath } from '@shared/backupName';
import { versionsNewer } from '@shared/version';
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
let pendingOpenPaths: string[] = [];

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const HIGHLIGHTS_FILE = path.join(app.getPath('userData'), 'highlights.json');
const CUSTOM_CSS_FILE = path.join(app.getPath('userData'), 'custom.css');
const CUSTOM_THEMES_FILE = path.join(app.getPath('userData'), 'custom-themes.json');

let customCssWatcher: FSWatcher | null = null;
const folderWatchers = new Map<string, FSWatcher>();

interface Highlight {
  id: string;
  text: string;
  color: 'accent' | 'warning' | 'success';
  createdAt: number;
}

async function readHighlightsStore(): Promise<Record<string, Highlight[]>> {
  try {
    const raw = await fs.readFile(HIGHLIGHTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, Highlight[]> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (Array.isArray(v)) out[k] = v as Highlight[];
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

async function writeHighlightsStore(store: Record<string, Highlight[]>): Promise<void> {
  await fs.mkdir(path.dirname(HIGHLIGHTS_FILE), { recursive: true });
  const tmp = `${HIGHLIGHTS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8');
  await fs.rename(tmp, HIGHLIGHTS_FILE);
}

interface CustomTheme {
  id: string;
  name: string;
  css: string;
  createdAt: number;
  updatedAt: number;
}

async function readCustomThemesStore(): Promise<CustomTheme[]> {
  try {
    const raw = await fs.readFile(CUSTOM_THEMES_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as CustomTheme[];
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { themes?: unknown }).themes)) {
      return (parsed as { themes: CustomTheme[] }).themes;
    }
    return [];
  } catch {
    // Migrate legacy single custom.css if exists
    try {
      const legacy = await fs.readFile(CUSTOM_CSS_FILE, 'utf-8');
      if (legacy && legacy.trim()) {
        const migrated: CustomTheme = {
          id: `ct-${Date.now()}`,
          name: 'Custom',
          css: legacy,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await writeCustomThemesStore([migrated]);
        return [migrated];
      }
    } catch { /* ignore */ }
    return [];
  }
}

async function writeCustomThemesStore(themes: CustomTheme[]): Promise<void> {
  await fs.mkdir(path.dirname(CUSTOM_THEMES_FILE), { recursive: true });
  const tmp = `${CUSTOM_THEMES_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(themes, null, 2), 'utf-8');
  await fs.rename(tmp, CUSTOM_THEMES_FILE);
}

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

async function readCustomCssFile(): Promise<string> {
  try {
    return await fs.readFile(CUSTOM_CSS_FILE, 'utf-8');
  } catch {
    return '';
  }
}

async function watchCustomCss(win: BrowserWindow): Promise<void> {
  if (customCssWatcher) return;
  const chokidar = await getChokidar();
  if (customCssWatcher) return;
  // ensure file exists so chokidar can watch it
  try {
    await fs.mkdir(path.dirname(CUSTOM_CSS_FILE), { recursive: true });
  } catch {
    /* ignore */
  }
  const watcher = chokidar.watch(CUSTOM_CSS_FILE, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 30 }
  });
  const push = (css: string): void => {
    if (!win.isDestroyed()) win.webContents.send('custom-css:changed', css);
  };
  watcher.on('change', async () => push(await readCustomCssFile()));
  watcher.on('add', async () => push(await readCustomCssFile()));
  watcher.on('unlink', () => push(''));
  customCssWatcher = watcher;
}

async function watchFolder(folderPath: string, win: BrowserWindow): Promise<void> {
  // Sidebar shows a single folder at a time: release every other folder
  // watcher instead of accumulating directory watchers until quit.
  for (const [other, watcher] of [...folderWatchers]) {
    if (other === folderPath) continue;
    void watcher.close();
    folderWatchers.delete(other);
  }
  if (folderWatchers.has(folderPath)) return;
  const chokidar = await getChokidar();
  if (folderWatchers.has(folderPath)) return;
  const watcher = chokidar.watch(folderPath, {
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 30 }
  });
  const notify = () => {
    if (win.isDestroyed()) return;
    win.webContents.send('folder:event', folderPath);
  };
  watcher.on('add', notify);
  watcher.on('unlink', notify);
  watcher.on('change', notify);
  watcher.on('addDir', notify);
  watcher.on('unlinkDir', notify);
  folderWatchers.set(folderPath, watcher);
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

function extractMarkdownPaths(argv: string[]): string[] {
  // Skip the executable; collect every arg ending with a Markdown extension.
  // Exclude flags (starting with "-") and the "." used in dev.
  const found: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || arg.startsWith('-')) continue;
    if (arg === '.') continue;
    if (isMarkdown(arg)) {
      try {
        found.push(path.resolve(arg));
      } catch {
        found.push(arg);
      }
    }
  }
  return found;
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
  for (const watcher of folderWatchers.values()) {
    void watcher.close();
  }
  folderWatchers.clear();
  if (customCssWatcher) {
    void customCssWatcher.close();
    customCssWatcher = null;
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
    if (!pendingOpenPaths.includes(filePath)) pendingOpenPaths.push(filePath);
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

  // The renderer registers one watch per newly created tab. Guarded by the
  // same trust set as file:read so a compromised renderer cannot spy on
  // arbitrary paths via change events.
  ipcMain.handle('file:watch', (_evt, filePath: unknown) => {
    if (typeof filePath !== 'string') return;
    const resolved = path.resolve(filePath);
    if (!readablePaths.has(resolved)) return;
    if (!isMarkdown(resolved)) return;
    startWatch(resolved, win);
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

  ipcMain.handle('file:export-pdf', async (_evt, payload: unknown): Promise<{ savedPath: string } | null> => {
    const { html, suggestedName } = payload as { html?: unknown; suggestedName?: unknown };
    if (typeof html !== 'string' || typeof suggestedName !== 'string') return null;
    if (!win || win.isDestroyed()) return null;
    // Suggest PDF name derived from markdown file name
    const pdfDefault = (() => {
      const base = path.basename(suggestedName || 'document.md');
      const withoutExt = base.replace(/\.(md|markdown|mdown|mkd|mdx)$/i, '');
      return `${withoutExt || 'document'}.pdf`;
    })();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: t(currentLang, 'exportPdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: pdfDefault
    });
    if (canceled || !filePath) return null;
    // Convert HTML → PDF via hidden window so only the markdown content is printed,
    // not the app UI (titlebar/tabs/sidebar). The HTML is standalone with inline CSS.
    const tmpHtml = path.join(app.getPath('temp'), `livemd-export-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.html`);
    let pdfWin: BrowserWindow | null = null;
    try {
      await fs.mkdir(path.dirname(tmpHtml), { recursive: true });
      await fs.writeFile(tmpHtml, html, 'utf-8');
      pdfWin = new BrowserWindow({
        show: false,
        width: 900,
        height: 1200,
        backgroundColor: '#ffffff',
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          spellcheck: false
        }
      });
      pdfWin.setMenuBarVisibility(false);
      Menu.setApplicationMenu(null);
      await pdfWin.loadFile(tmpHtml);
      // Give images and fonts a moment to settle before printing
      await new Promise<void>((res) => setTimeout(res, 250));
      const pdf = await pdfWin.webContents.printToPDF({
        printBackground: true,
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } as Electron.PrintToPDFOptions['margins'],
        pageSize: 'A4'
      } as Electron.PrintToPDFOptions);
      await fs.writeFile(filePath, pdf);
      return { savedPath: filePath };
    } finally {
      try {
        if (pdfWin && !pdfWin.isDestroyed()) pdfWin.close();
      } catch { /* ignore */ }
      try {
        await fs.unlink(tmpHtml);
      } catch { /* ignore */ }
    }
  });

  ipcMain.handle('file:export-html', async (_evt, payload: unknown): Promise<{ savedPath: string } | null> => {
    const { html, suggestedName } = payload as { html?: unknown; suggestedName?: unknown };
    if (typeof html !== 'string' || typeof suggestedName !== 'string') return null;
    if (!win || win.isDestroyed()) return null;
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: t(currentLang, 'exportHtml'),
      defaultPath: suggestedName.replace(/\.md$/i, '.html'),
      filters: [
        { name: 'HTML', extensions: ['html', 'htm'] },
        { name: t(currentLang, 'filterAll'), extensions: ['*'] }
      ]
    });
    if (canceled || !filePath) return null;
    await fs.writeFile(filePath, html, 'utf-8');
    return { savedPath: filePath };
  });

  ipcMain.handle('app:consume-pending', (): string[] => pendingOpenPaths.splice(0));

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
      return { latestVersion: latest, hasUpdate: versionsNewer(latest, app.getVersion()) };
    } catch {
      return null;
    }
  });

  ipcMain.handle('highlights:load', async (_evt, filePath: unknown) => {
    if (typeof filePath !== 'string') return [];
    const store = await readHighlightsStore();
    return store[filePath] ?? [];
  });

  ipcMain.handle('highlights:save', async (_evt, filePath: unknown, list: unknown) => {
    if (typeof filePath !== 'string' || !Array.isArray(list)) return;
    const store = await readHighlightsStore();
    const capped = (list as Highlight[]).slice(0, 100);
    store[filePath] = capped;
    let total = Object.values(store).reduce((n, arr) => n + arr.length, 0);
    if (total > 1000) {
      const all: Array<{ key: string; hl: Highlight; idx: number }> = [];
      for (const [k, arr] of Object.entries(store)) {
        arr.forEach((hl, idx) => all.push({ key: k, hl, idx }));
      }
      all.sort((a, b) => (a.hl.createdAt ?? 0) - (b.hl.createdAt ?? 0));
      const toRemove = total - 1000;
      const removeSet = new Set(all.slice(0, toRemove).map((e) => `${e.key}::${e.hl.id}`));
      for (const [k, arr] of Object.entries(store)) {
        store[k] = arr.filter((hl) => !removeSet.has(`${k}::${hl.id}`));
        if (store[k]!.length === 0) delete store[k];
      }
    }
    await writeHighlightsStore(store);
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

  ipcMain.handle('folder:list', async (_evt, folderPath: unknown) => {
    if (typeof folderPath !== 'string') return [];
    try {
      const entries = await fs.readdir(folderPath);
      const files = entries.filter(isMarkdown).map((e) => path.join(folderPath, e)).slice(0, 100);
      void watchFolder(folderPath, win).catch(() => {});
      return files;
    } catch {
      return [];
    }
  });

  const handleCustomCssLoad = async (): Promise<string> => readCustomCssFile();
  const handleCustomCssSave = async (_evt: unknown, css: unknown): Promise<void> => {
    if (typeof css !== 'string') throw new Error('invalid css');
    await fs.mkdir(path.dirname(CUSTOM_CSS_FILE), { recursive: true });
    await fs.writeFile(CUSTOM_CSS_FILE, css, 'utf-8');
    if (!win.isDestroyed()) win.webContents.send('custom-css:changed', css);
  };

  ipcMain.handle('customCss:load', handleCustomCssLoad);
  ipcMain.handle('custom-css:load', handleCustomCssLoad);
  ipcMain.handle('customCss:save', handleCustomCssSave);
  ipcMain.handle('custom-css:save', handleCustomCssSave);

  ipcMain.handle('customThemes:list', async (): Promise<CustomTheme[]> => {
    const list = await readCustomThemesStore();
    return list;
  });

  ipcMain.handle('customThemes:save', async (_evt, payload: unknown): Promise<CustomTheme> => {
    const { id, name, css } = payload as { id?: unknown; name?: unknown; css?: unknown };
    if (typeof name !== 'string' || typeof css !== 'string') throw new Error('invalid payload');
    const cleanName = name.trim().slice(0, 50);
    if (!cleanName) throw new Error('name required');
    if (css.length > 50 * 1024) throw new Error('css too large');
    const themes = await readCustomThemesStore();
    if (themes.length >= 20 && !id) throw new Error('too many themes');
    // duplicate name check (case-insensitive) for new themes
    if (!id && themes.some((t) => t.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error('duplicate name');
    }
    let theme: CustomTheme;
    if (typeof id === 'string' && id) {
      const idx = themes.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error('not found');
      themes[idx].name = cleanName;
      themes[idx].css = css;
      themes[idx].updatedAt = Date.now();
      theme = themes[idx];
    } else {
      theme = { id: `ct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: cleanName, css, createdAt: Date.now(), updatedAt: Date.now() };
      themes.push(theme);
    }
    await writeCustomThemesStore(themes);
    return theme;
  });

  ipcMain.handle('customThemes:delete', async (_evt, id: unknown): Promise<void> => {
    if (typeof id !== 'string') throw new Error('invalid id');
    const themes = await readCustomThemesStore();
    const filtered = themes.filter((t) => t.id !== id);
    if (filtered.length === themes.length) throw new Error('not found');
    await writeCustomThemesStore(filtered);
  });

  ipcMain.handle('customThemes:rename', async (_evt, payload: unknown): Promise<CustomTheme> => {
    const { id, newName } = payload as { id?: unknown; newName?: unknown };
    if (typeof id !== 'string' || typeof newName !== 'string') throw new Error('invalid payload');
    const cleanName = (newName as string).trim().slice(0, 50);
    if (!cleanName) throw new Error('name required');
    const themes = await readCustomThemesStore();
    if (themes.some((t) => t.id !== id && t.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error('duplicate name');
    }
    const theme = themes.find((t) => t.id === id);
    if (!theme) throw new Error('not found');
    theme.name = cleanName;
    theme.updatedAt = Date.now();
    await writeCustomThemesStore(themes);
    return theme;
  });

  // start watchers; renderer injects existing custom.css via style tag
  void watchCustomCss(win).catch(() => {});
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

  // Native context menu — enables Copy/Cut/Paste/Select All on text selection
  // and Copy Link Address on links. Without this, right-click on selectable
  // content shows nothing (Electron 32+ with Menu.setApplicationMenu(null)).
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (params.linkURL) {
      template.push({
        label: t(currentLang, 'copyLink'),
        click: () => clipboard.writeText(params.linkURL)
      });
      // Separate link action from text actions when both exist
      if (params.editFlags.canCopy || params.editFlags.canSelectAll) {
        template.push({ type: 'separator' });
      }
    }

    if (params.isEditable) {
      if (params.editFlags.canCut) {
        template.push({ label: t(currentLang, 'cut'), role: 'cut' });
      }
      if (params.editFlags.canCopy) {
        template.push({ label: t(currentLang, 'copy'), role: 'copy' });
      }
      if (params.editFlags.canPaste) {
        template.push({ label: t(currentLang, 'paste'), role: 'paste' });
      }
      if (params.editFlags.canSelectAll) {
        if (template.length > 0) template.push({ type: 'separator' });
        template.push({ label: t(currentLang, 'selectAll'), role: 'selectAll' });
      }
    } else {
      if (params.editFlags.canCopy) {
        template.push({ label: t(currentLang, 'copy'), role: 'copy' });
      }
      if (params.editFlags.canSelectAll) {
        if (template.length > 0) template.push({ type: 'separator' });
        template.push({ label: t(currentLang, 'selectAll'), role: 'selectAll' });
      }
    }

    if (params.selectionText) {
      const sel = params.selectionText.trim();
      if (sel.length >= 2 && sel.length <= 300) {
        if (template.length > 0) template.push({ type: 'separator' });
        template.push({
          label: t(currentLang, 'highlight'),
          click: () => mainWindow?.webContents.send('highlight:add', params.selectionText)
        });
      }
    }

    if (template.length === 0) return;
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow! });
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
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // Renderer reload rebuilds its TabManager: restart per-path counting so
    // counts match the fresh session's tabs.
    watchCounts.clear();
    const queued = pendingOpenPaths.splice(0);
    for (const filePath of queued) {
      mainWindow.webContents.send('app:open-path', filePath);
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
    for (const filePath of extractMarkdownPaths(argv)) {
      deliverOpenPath(filePath);
    }
  });

  // Capture initial argv at startup (Windows "Open with" may pass several files)
  const initialFromArgs = extractMarkdownPaths(process.argv);
  for (const filePath of initialFromArgs) {
    pendingOpenPaths.push(filePath);
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
    app.quit();
  });

  app.on('before-quit', () => {
    unwatchAll();
  });
}
