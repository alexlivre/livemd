import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import chokidar, { type FSWatcher } from 'chokidar';
import { mapOsLocale, t, type AppLanguage } from '@shared/i18n';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const watched = new Map<string, FSWatcher>();
let mainWindow: BrowserWindow | null = null;
let pendingOpenPath: string | null = null;
let currentLang: AppLanguage = mapOsLocale(app.getLocale());

const SUPPORTED_EXTS = /\.(md|markdown|mdown|mkd|mdx)$/i;

function isMarkdown(filePath: string): boolean {
  return SUPPORTED_EXTS.test(filePath);
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
  const content = await fs.readFile(filePath, 'utf-8');
  return { content, modifiedAt: stat.mtimeMs };
}

function watchFile(filePath: string, win: BrowserWindow): void {
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
  if (!mainWindow || mainWindow.webContents.isLoading()) {
    pendingOpenPath = filePath;
    return;
  }
  mainWindow.webContents.send('app:open-path', filePath);
  focusMainWindow();
}

function registerIpc(win: BrowserWindow): void {
  ipcMain.handle('file:open-dialog', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: t(currentLang, 'openDialogTitle'),
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: t(currentLang, 'filterMarkdown'), extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] },
        { name: t(currentLang, 'filterAll'), extensions: ['*'] }
      ]
    });

    if (result.canceled) return [];

    const files: { filePath: string; fileName: string; content: string; modifiedAt: number }[] = [];
    for (const filePath of result.filePaths) {
      if (!isMarkdown(filePath)) continue;
      try {
        const { content, modifiedAt } = await readMarkdownFile(filePath);
        files.push({
          filePath,
          fileName: path.basename(filePath),
          content,
          modifiedAt
        });
        watchFile(filePath, win);
      } catch (err) {
        dialog.showErrorBox(
          t(currentLang, 'errorOpening'),
          `${filePath}\n${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return files;
  });

  ipcMain.handle('file:read', async (_evt, filePath: string) => {
    if (!isMarkdown(filePath)) throw new Error(t(currentLang, 'markdownOnly'));
    const { content, modifiedAt } = await readMarkdownFile(filePath);
    watchFile(filePath, win);
    return {
      filePath,
      fileName: path.basename(filePath),
      content,
      modifiedAt
    };
  });

  ipcMain.handle('tab:close', (_evt, filePath: string): void => {
    unwatchFile(filePath);
  });

  ipcMain.handle('shell:reveal', (_evt, filePath: string): void => {
    shell.showItemInFolder(filePath);
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
    }
  });
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#1a1d23',
    title: 'LiveMD',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
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
    if (!url.startsWith('file://')) return;
    event.preventDefault();
    const filePath = filePathFromFileUrl(url);
    if (filePath && isMarkdown(filePath)) {
      deliverOpenPath(filePath);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (!mainWindow) throw new Error('Falha ao criar janela');

  registerIpc(mainWindow);

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

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

  app.whenReady().then(createWindow);

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
