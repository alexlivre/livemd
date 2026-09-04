import { basename, escapeHtml } from './util';
import { t } from './i18n';

const STORAGE_KEY = 'md-reader.sidebar';

let currentFolder: string | null = null;
let currentActive: string | null = null;
let listElRef: HTMLElement | null = null;
let openPathRef: ((p: string) => Promise<void>) | null = null;
let folderUnsub: (() => void) | null = null;

function getBasename(filePath: string): string {
  try {
    return basename(filePath);
  } catch {
    const parts = filePath.split(/[\\/]/);
    return parts[parts.length - 1] ?? filePath;
  }
}

function ensureFolderWatcher(): void {
  if (folderUnsub) return;
  const api = (window as unknown as { mdApi?: unknown }).mdApi as
    | {
        onFolderChanged?: (h: (p: string) => void) => () => void;
        onFolderEvent?: (h: (p: string) => void) => () => void;
      }
    | undefined;
  if (!api) return;
  const handler = (changed: string) => {
    if (changed === currentFolder && currentFolder) {
      void refreshSidebar(currentFolder, currentActive);
    }
  };
  if (api.onFolderChanged) {
    folderUnsub = api.onFolderChanged(handler);
  } else if (api.onFolderEvent) {
    folderUnsub = api.onFolderEvent(handler);
  }
}

export function isSidebarVisible(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;
  } catch {
    /* ignore */
  }
  return false;
}

export function toggleSidebar(sidebar: HTMLElement): void {
  sidebar.hidden = !sidebar.hidden;
  try {
    localStorage.setItem(STORAGE_KEY, sidebar.hidden ? '0' : '1');
  } catch {
    /* ignore */
  }
}

export function bindSidebar(
  btn: HTMLElement,
  sidebar: HTMLElement,
  listEl?: HTMLElement,
  openPath?: (p: string) => Promise<void>
): void {
  if (listEl) listElRef = listEl;
  if (openPath) openPathRef = openPath;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '1' || stored === 'true') sidebar.hidden = false;
    else if (stored === '0' || stored === 'false') sidebar.hidden = true;
  } catch {
    /* ignore */
  }

  btn.addEventListener('click', () => toggleSidebar(sidebar));
  ensureFolderWatcher();
}

export async function refreshSidebar(
  folderPath: string | null | undefined,
  activePath: string | null = null,
  explicitListEl?: HTMLElement,
  explicitOpenPath?: (p: string) => Promise<void>
): Promise<void> {
  const listEl = explicitListEl ?? listElRef;
  const openPath = explicitOpenPath ?? openPathRef;

  // support overload where second arg is HTMLElement (caller passed listEl as second)
  // This handles refreshSidebar(folder, listEl) legacy calls defensively
  if (activePath !== null && typeof activePath === 'object') {
    // activePath is actually HTMLElement
    return refreshSidebar(folderPath, null, activePath as unknown as HTMLElement, explicitListEl as unknown as (p: string) => Promise<void>);
  }

  if (!listEl) return;

  currentFolder = folderPath ?? null;
  currentActive = activePath ?? null;

  // allow caller to update refs
  if (explicitListEl) listElRef = explicitListEl;
  if (explicitOpenPath) openPathRef = explicitOpenPath;

  ensureFolderWatcher();

  if (!folderPath) {
    listEl.innerHTML = `<div class="recent-empty">${escapeHtml(t('sidebarNoFolder'))}</div>`;
    return;
  }

  try {
    const api = (window as unknown as { mdApi: { listFolder: (p: string) => Promise<string[]> } }).mdApi;
    const files = await api.listFolder(folderPath);
    // guard against stale refresh
    if (currentFolder !== folderPath) return;

    files.sort((a, b) => getBasename(a).localeCompare(getBasename(b)));

    if (files.length === 0) {
      listEl.innerHTML = `<div class="recent-empty">${escapeHtml(t('sidebarEmptyFolder'))}</div>`;
      return;
    }

    listEl.replaceChildren();
    for (const fp of files) {
      const btn = document.createElement('button');
      btn.className = 'sidebar-item';
      if (fp === activePath) btn.classList.add('is-active');
      btn.textContent = getBasename(fp);
      btn.title = fp;
      if (openPath) {
        btn.addEventListener('click', () => void openPath(fp));
      } else {
        // fallback: try to use window openPath if available via mdApi read
        btn.addEventListener('click', () => {
          const w = window as unknown as { mdApi?: { readFile?: unknown } };
          void w;
        });
      }
      listEl.appendChild(btn);
    }
  } catch {
    if (currentFolder !== folderPath) return;
    listEl.innerHTML = `<div class="recent-empty">${escapeHtml(t('sidebarFailedLoad'))}</div>`;
  }
}

// allow main.ts to set refs without calling bindSidebar
export function setSidebarContext(
  listEl: HTMLElement,
  openPath: (p: string) => Promise<void>
): void {
  listElRef = listEl;
  openPathRef = openPath;
  ensureFolderWatcher();
}
