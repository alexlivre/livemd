import type { FileEvent } from '@shared/types';
import type { MdApi } from '@shared/api';
import { MESSAGES, type MsgKey } from '@shared/i18n';
import { TabManager, type TabData } from './tabs';
import { initTheme, toggleTheme } from './theme';
import { initCustomCss, loadCustomCss, saveCustomCss, applyCustomCss, getCustomCssPathHint } from './customCss';
import { RenderCache } from './renderCache';
import { getRecentFiles, recordRecentFile, removeRecentFile } from './recent';
import { getEffectiveLang, initI18n, subscribe as subscribeLang, t } from './i18n';
import { basename, errorMessage, escapeAttr, escapeHtml } from './util';
import { bindDragAndDrop } from './drop';
import { bindShortcuts } from './shortcuts';
import { bindRecentMenu, bindLangMenu, createPopover, type Popover } from './menus';
import { bindOutline, refreshOutline } from './outline';
import { buildStandaloneHtml, fetchCssText } from './export';
import { searchAll } from './globalSearch';
import { checkForUpdate } from './update';
import { saveSession, loadSession } from './session';
import { splitMarkdown, SEGMENT_BYTES } from './segment';
import { Toast, type ToastAction } from './toast';
import { RemovalGrace } from './pending';
import { debounce } from '@shared/util';
import { enablePerf, perfMark } from '@shared/perf';
import { addHighlight, loadHighlights, saveHighlights, renderHighlights } from './highlights';
import { registerCommands, openPalette, closePalette, type PaletteCmd } from './palette';
import { renderMermaid, renderMath } from './mermaidMath';
import { bindSidebar, refreshSidebar, toggleSidebar, setSidebarContext } from './sidebar';

declare global {
  interface Window {
    mdApi: MdApi;
  }
}

enablePerf(new URLSearchParams(location.search).has('perf'));
perfMark('renderer:start');

const api = window.mdApi;

initTheme();

const tabsEl = document.getElementById('tabs') as HTMLDivElement;
const contentEl = document.getElementById('content') as HTMLElement;
const btnOutline = document.getElementById('btn-outline') as HTMLButtonElement;
const outlineMenu = document.getElementById('outline-menu') as HTMLElement;
const statusLeft = document.getElementById('status-left') as HTMLSpanElement;
const statusRight = document.getElementById('status-right') as HTMLSpanElement;
const btnNew = document.getElementById('btn-new') as HTMLButtonElement;
const btnTheme = document.getElementById('btn-theme') as HTMLButtonElement;
const btnRecent = document.getElementById('btn-recent') as HTMLButtonElement;
const recentMenu = document.getElementById('recent-menu') as HTMLDivElement;
const btnLang = document.getElementById('btn-lang') as HTMLButtonElement;
const langMenu = document.getElementById('lang-menu') as HTMLDivElement;
const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
const exportMenu = document.getElementById('export-menu') as HTMLElement;
const btnAbout = document.getElementById('btn-about') as HTMLButtonElement;
const aboutModal = document.getElementById('about-modal') as HTMLDivElement;
const aboutCloseBtn = document.getElementById('about-close') as HTMLButtonElement;
const aboutVersion = document.getElementById('about-version') as HTMLDivElement;
const aboutDesc = document.getElementById('about-desc') as HTMLParagraphElement;
const aboutRepoLink = document.getElementById('about-repo-link') as HTMLButtonElement;
const aboutUpdate = document.getElementById('about-update') as HTMLDivElement;
const aboutUpdateText = document.getElementById('about-update-text') as HTMLParagraphElement;
const aboutUpdateBtn = document.getElementById('about-update-btn') as HTMLButtonElement;
const btnCustomCss = document.getElementById('btn-custom-css') as HTMLButtonElement | null;
const customCssModal = document.getElementById('custom-css-modal') as HTMLDivElement | null;
const customCssClose = document.getElementById('custom-css-close') as HTMLButtonElement | null;
const customCssInput = document.getElementById('custom-css-input') as HTMLTextAreaElement | null;
const customCssSaveBtn = document.getElementById('custom-css-save') as HTMLButtonElement | null;
const customCssClearBtn = document.getElementById('custom-css-clear') as HTMLButtonElement | null;
const customCssPathEl = document.getElementById('custom-css-path') as HTMLDivElement | null;
const searchbar = document.getElementById('searchbar') as HTMLDivElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchCount = document.getElementById('search-count') as HTMLSpanElement;
const searchPrev = document.getElementById('search-prev') as HTMLButtonElement;
const searchNext = document.getElementById('search-next') as HTMLButtonElement;
const searchClose = document.getElementById('search-close') as HTMLButtonElement;
const globalBar = document.getElementById('global-searchbar') as HTMLElement;
const globalInput = document.getElementById('global-search-input') as HTMLInputElement;
const globalCount = document.getElementById('global-search-count') as HTMLElement;
const globalResults = document.getElementById('global-results') as HTMLElement;

const REPO_URL = 'https://github.com/alexlivre/livemd';
const REPO_RELEASES_URL = `${REPO_URL}/releases`;

let updateVersion: string | null = null;
const fabOpen = document.getElementById('fab-open') as HTMLButtonElement;
const btnSidebar = document.getElementById('btn-sidebar') as HTMLButtonElement | null;
const sidebarEl = document.getElementById('sidebar') as HTMLElement | null;
const sidebarListEl = document.getElementById('sidebar-list') as HTMLElement | null;

let zoomFactor = 1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;

const manager = new TabManager();
const renderCache = new RenderCache();
const scrollByPath = new Map<string, number>();
let pendingScrollTop: number | null = null;
let lastFocused: HTMLElement | null = null;
let recentPopover: Popover;
let langPopover: Popover;
let exportPopover: Popover;
let outlinePopover: Popover;

const PAUSE_KEY = 'md-reader.pause';
const toastEl = document.getElementById('toast') as HTMLDivElement;
const toast = new Toast(toastEl);
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const grace = new RemovalGrace();
const pendingByPath = new Map<string, { content: string; modifiedAt: number }>();
const recentlySaved = new Map<string, number>();
let paused = readStoredPause();
let pendingClickConsumed = false;

function getFolderFromPath(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx > 0 ? filePath.slice(0, idx) : '';
}

function doRefreshSidebar(activePath: string | null): void {
  if (!sidebarListEl || !activePath) return;
  const folder = getFolderFromPath(activePath);
  if (!folder) return;
  void refreshSidebar(folder, activePath, sidebarListEl, openPath);
}

function highlightPreview(text: string, query: string): string {
  const escText = escapeHtml(text);
  if (!query) return escText;
  const escQuery = escapeHtml(query);
  const safe = escQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return escText.replace(new RegExp(safe, 'gi'), (m) => `<mark>${m}</mark>`);
  } catch {
    return escText;
  }
}

const globalDebounced = debounce(() => {
  void (async () => {
    const q = globalInput.value.trim();
    if (!q) {
      globalResults.hidden = true;
      globalCount.textContent = '';
      return;
    }
    const tabs = manager.getState().tabs.map((t) => ({ filePath: t.filePath, fileName: t.fileName, content: t.content ?? '' }));
    const recents = getRecentFiles()
      .filter((p) => !tabs.some((t) => t.filePath === p))
      .slice(0, 10);
    const recentContents = new Map<string, string>();
    for (const p of recents) {
      try {
        await api.allowRead(p);
        const f = await api.readFile(p);
        recentContents.set(p, f.content.slice(0, 256 * 1024));
      } catch {
        /* ignore missing recent file */
      }
    }
    const groups = searchAll(q, tabs, recentContents);
    const total = groups.reduce((n, g) => n + g.matches.length, 0);
    globalCount.textContent = total ? t('globalSearchResults', { n: total, m: groups.length }) : t('globalSearchEmpty');
    if (total === 0) {
      globalResults.innerHTML = `<div class="recent-empty">${escapeHtml(t('globalSearchEmpty'))}</div>`;
      globalResults.hidden = false;
      return;
    }
    globalResults.innerHTML = groups
      .map(
        (g) =>
          `<div class="global-group"><div class="global-group-title">${escapeHtml(g.fileName)}<span class="global-group-path">${escapeHtml(g.filePath)}</span></div>${g.matches.map((m) => `<button class="global-match" data-path="${escapeAttr(g.filePath)}" data-line="${m.line}">${highlightPreview(m.preview.slice(0, 80), q)}</button>`).join('')}</div>`
      )
      .join('');
    for (const btn of globalResults.querySelectorAll<HTMLButtonElement>('.global-match')) {
      btn.addEventListener('click', async () => {
        const fp = btn.dataset.path!;
        await openPath(fp);
        void api.findInPage(q);
        globalBar.hidden = true;
        globalResults.hidden = true;
      });
    }
    globalResults.hidden = false;
  })();
}, 180);

function openGlobalSearch(): void {
  globalBar.hidden = false;
  globalInput.focus();
  globalInput.select();
  void globalDebounced();
}

function closeGlobalSearch(): boolean {
  if (globalBar.hidden) return false;
  globalBar.hidden = true;
  globalResults.hidden = true;
  globalCount.textContent = '';
  return true;
}

function bindGlobalSearch(): void {
  globalInput.addEventListener('input', () => void globalDebounced());
  document.getElementById('global-search-close')?.addEventListener('click', () => {
    globalBar.hidden = true;
    globalResults.hidden = true;
  });
}

let markdownPromise: Promise<typeof import('./markdown')> | null = null;

function getMarkdown(): Promise<typeof import('./markdown')> {
  markdownPromise ??= import('./markdown');
  return markdownPromise;
}

function setStatus(text: string, kind: 'ok' | 'warn' | 'err' | '' = ''): void {
  statusLeft.textContent = text;
  statusLeft.className = kind;
}

function setStatusRight(text: string): void {
  statusRight.textContent = text;
}

function applyStaticStrings(): void {
  document.documentElement.lang = getEffectiveLang();
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as MsgKey | undefined;
    if (key && key in MESSAGES.en) el.textContent = t(key);
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const key = el.dataset.i18nTitle as MsgKey | undefined;
    if (key && key in MESSAGES.en) el.title = t(key);
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const key = el.dataset.i18nAria as MsgKey | undefined;
    if (key && key in MESSAGES.en) el.setAttribute('aria-label', t(key));
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]')) {
    const key = el.dataset.i18nPlaceholder as MsgKey | undefined;
    if (key && key in MESSAGES.en) el.setAttribute('placeholder', t(key));
  }
  btnAbout.title = updateVersion ? t('updateAvailable', { v: updateVersion }) : t('aboutTooltip');
}

function refreshUi(): void {
  const state = manager.getState();
  renderTabbar(state);
  void renderContent(state);
}

function renderTabbar(state: { tabs: TabData[]; activeId: string | null }): void {
  tabsEl.replaceChildren();

  for (const tab of state.tabs) {
    const el = document.createElement('button');
    el.className = 'tab';
    el.setAttribute('role', 'tab');
    el.setAttribute('data-tab-id', tab.id);
    const isActive = tab.id === state.activeId;
    if (isActive) el.classList.add('is-active');
    if (tab.orphaned) el.classList.add('is-orphaned');
    if (tab.pending) el.classList.add('is-pending');
    el.setAttribute('aria-selected', isActive ? 'true' : 'false');
    el.tabIndex = isActive ? 0 : -1;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.fileName;
    title.title = tab.filePath;
    el.appendChild(title);

    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.setAttribute('role', 'button');
    closeBtn.setAttribute('aria-label', t('closeTabAria', { name: tab.fileName }));
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      void onCloseTab(tab.id);
    });
    el.appendChild(closeBtn);

    el.addEventListener('click', () => {
      manager.activate(tab.id);
      if (tab.pending) showChangedActions(tab.filePath);
      else if (tab.orphaned) showRemovedActions(tab.filePath);
    });
    el.addEventListener('auxclick', (evt) => {
      if (evt.button === 1) {
        evt.preventDefault();
        void onCloseTab(tab.id);
      }
    });

    el.addEventListener('contextmenu', (evt) => {
      evt.preventDefault();
      void api.revealInFolder(tab.filePath);
    });

    tabsEl.appendChild(el);
  }
}

function renderEmpty(): void {
  document.title = 'LiveMD';
  const recent = getRecentFiles();
  const recentHtml =
    recent.length > 0
      ? `<div class="recent-section">
           <div class="recent-title">${escapeHtml(t('recentTitle'))}</div>
           <ul class="recent-list">
             ${recent
               .map(
                 (p) =>
                   `<li><button class="recent-item" type="button" data-path="${escapeAttr(p)}" title="${escapeAttr(p)}">${escapeHtml(basename(p))}</button></li>`
               )
               .join('')}
           </ul>
         </div>`
      : '';

  contentEl.innerHTML = `
    <div class="empty-state">
      <div class="empty-illustration" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 3 14 8 19 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="15" y2="17"/>
        </svg>
      </div>
      <h1>${escapeHtml(t('emptyTitle'))}</h1>
      <p>${escapeHtml(t('emptyHint'))}</p>
      <button id="btn-open-empty" class="btn btn-primary">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        ${escapeHtml(t('openFile'))}
      </button>
      ${recentHtml}
    </div>
  `;
  document.getElementById('btn-open-empty')?.addEventListener('click', () => void openFiles());
  for (const item of contentEl.querySelectorAll<HTMLButtonElement>('.recent-item')) {
    item.addEventListener('click', () => {
      const path = item.dataset.path;
      if (path) void openPath(path);
    });
  }
}

const INCREMENTAL_RENDER_BYTES = 1024 * 1024;
const FIRST_SEGMENT_BYTES = 96 * 1024;
const SINGLE_PAINT_HTML_BYTES = 1024 * 1024;

let renderVersion = 0;

function idleSlice(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 500 });
    } else {
      setTimeout(resolve, 16);
    }
  });
}

async function scheduleHighlight(container: HTMLElement): Promise<void> {
  if (!container.querySelector('[data-hljs]')) return;
  const { highlightCodeBlocksInIdle } = await import('./highlight');
  highlightCodeBlocksInIdle(container);
}

function paintArticle(html: string): HTMLElement {
  const singlePaint = html.length > SINGLE_PAINT_HTML_BYTES;
  contentEl.style.display = singlePaint ? 'none' : '';
  contentEl.innerHTML = `<article class="markdown-body">${html}</article>`;
  if (singlePaint) contentEl.style.display = '';
  return contentEl.firstElementChild as HTMLElement;
}

// Renders a large file segment by segment so the first content appears
// quickly and the main thread only ever handles one segment at a time.
async function renderIncremental(source: string, version: number): Promise<void> {
  const { renderMarkdown } = await getMarkdown();
  const [first, ...rest] = splitMarkdown(source, FIRST_SEGMENT_BYTES);
  const segments = [first, ...splitMarkdown(rest.join('\n'), SEGMENT_BYTES)];
  contentEl.innerHTML = '<article class="markdown-body"></article>';
  const body = contentEl.firstElementChild as HTMLElement;

  for (let i = 0; i < segments.length; i++) {
    if (version !== renderVersion) return;
    const segHtml = await renderMarkdown(segments[i] as string);
    if (version !== renderVersion) return;
    if (body.isConnected) body.insertAdjacentHTML('beforeend', segHtml);
    if (i === 0) perfMark(`renderer:first-segment html=${(segHtml.length / 1024).toFixed(0)}KB`);
    if (i < segments.length - 1) await idleSlice();
  }
}

async function renderContent(state: { tabs: TabData[]; activeId: string | null }): Promise<void> {
  const active = state.activeId
    ? state.tabs.find((t) => t.id === state.activeId) ?? null
    : null;

  if (!active) {
    renderEmpty();
    setStatus(t('ready'), '');
    setStatusRight('');
    refreshOutline('', contentEl, btnOutline, outlineMenu);
    return;
  }

  let html = renderCache.get(active.filePath, active.content);
  const incremental = active.content.length > INCREMENTAL_RENDER_BYTES;
  const version = ++renderVersion;

  if (html === null && incremental) {
    await renderIncremental(active.content, version);
    if (version !== renderVersion) return;
    html = (contentEl.firstElementChild as HTMLElement).innerHTML;
    renderCache.set(active.filePath, active.content, html);
  } else {
    if (html === null) {
      const { renderMarkdown } = await getMarkdown();
      html = await renderMarkdown(active.content);
      renderCache.set(active.filePath, active.content, html);
    }
    if (version !== renderVersion) return;
    perfMark(`renderer:first-content html=${(html.length / 1024).toFixed(0)}KB`);
    paintArticle(html);
  }
  renderCache.flush();

  if (pendingScrollTop !== null) {
    contentEl.scrollTop = pendingScrollTop;
    pendingScrollTop = null;
  }

  setStatus(t('reading', { file: active.fileName }), 'ok');
  setStatusRight(formatTimestamp(active.modifiedAt));
  document.title = `${active.fileName} — LiveMD`;

  contentEl.classList.remove('flash');
  void contentEl.offsetWidth;
  contentEl.classList.add('flash');

  refreshOutline(state.activeId ?? '', contentEl, btnOutline, outlineMenu);
  void scheduleHighlight(contentEl);
  void renderMermaid(contentEl);
  void renderMath(contentEl);
  void applyHighlightsForFile(active.filePath);
  doRefreshSidebar(active.filePath);
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return t('modifiedAt', { time: d.toLocaleTimeString(getEffectiveLang()) });
}

async function openFiles(): Promise<void> {
  try {
    setStatus(t('opening'), '');
    const files = await api.openDialog();
    if (files.length === 0) {
      setStatus(t('cancelled'), '');
      return;
    }
    for (const file of files) {
      manager.add(file);
      recordRecentFile(file.filePath);
    }
    setStatus(t('openedCount', { n: files.length }), 'ok');
  } catch (err) {
    setStatus(t('errorPrefix', { msg: errorMessage(err) }), 'err');
  }
}

async function onCloseTab(id: string): Promise<void> {
  const removedPath = manager.close(id);
  if (removedPath) {
    renderCache.delete(removedPath);
    await api.closeTab(removedPath);
  }
}

function readStoredPause(): boolean {
  try {
    return localStorage.getItem(PAUSE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredPause(value: boolean): void {
  try {
    localStorage.setItem(PAUSE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function applyPauseUi(): void {
  btnPause.classList.toggle('is-paused', paused);
  (btnPause.querySelector('.icon-pause') as HTMLElement).hidden = paused;
  (btnPause.querySelector('.icon-play') as HTMLElement).hidden = !paused;
  const label = paused ? t('resumeTooltip') : t('pauseTooltip');
  btnPause.title = label;
  btnPause.setAttribute('aria-label', label);
}

function bindPauseToggle(): void {
  btnPause.addEventListener('click', () => {
    paused = !paused;
    writeStoredPause(paused);
    applyPauseUi();
  });
}

function hasLiveTab(filePath: string): boolean {
  return manager.getState().tabs.some((t) => t.filePath === filePath && !t.orphaned);
}

function findTab(filePath: string): TabData | null {
  return manager.getState().tabs.find((t) => t.filePath === filePath) ?? null;
}

function showTransientToast(message: string): void {
  toast.show({ message });
}

function showChangedActions(filePath: string): void {
  const pending = pendingByPath.get(filePath);
  if (!pending) return;
  const actions: ToastAction[] = [
    { label: t('actSync'), primary: true, onClick: () => syncPending(filePath) },
    { label: t('actNotNow'), onClick: () => dismissPending(filePath) }
  ];
  toast.show({
    message: t('toastChanged', { file: basename(filePath) }),
    actions,
    persist: true
  });
}

function showRemovedActions(filePath: string): void {
  const actions: ToastAction[] = [
    { label: t('actSaveAs'), primary: true, onClick: () => void saveFrozen(filePath) },
    { label: t('actCloseTab'), onClick: () => void closeOrphanedTab(filePath) },
    { label: t('actKeep'), onClick: () => toast.hide() }
  ];
  toast.show({
    message: t('toastRemoved', { file: basename(filePath) }),
    actions,
    persist: true
  });
}

function showRecreatedActions(filePath: string): void {
  const actions: ToastAction[] = [
    { label: t('actOpenNewTab'), primary: true, onClick: () => void openRecreated(filePath) },
    { label: t('actIgnore'), onClick: () => toast.hide() }
  ];
  toast.show({
    message: t('toastRecreated', { file: basename(filePath) }),
    actions,
    persist: true
  });
}

function syncPending(filePath: string): void {
  const pending = pendingByPath.get(filePath);
  if (pending) {
    manager.updateContent(filePath, pending.content, pending.modifiedAt);
    pendingByPath.delete(filePath);
  } else {
    manager.clearPending(filePath);
  }
  showTransientToast(t('toastSynced'));
}

function dismissPending(filePath: string): void {
  pendingByPath.delete(filePath);
  manager.clearPending(filePath);
}

async function saveFrozen(filePath: string): Promise<void> {
  const tab = findTab(filePath);
  if (!tab) return;
  try {
    const result = await api.saveAs(filePath, tab.content);
    if (!result) return;
    recordRecentFile(result.savedPath);
    if (result.savedPath === filePath) {
      manager.clearOrphaned(filePath);
      const timer = recentlySaved.get(filePath);
      if (timer !== undefined) window.clearTimeout(timer);
      recentlySaved.set(
        filePath,
        window.setTimeout(() => recentlySaved.delete(filePath), 3000)
      );
    }
    showTransientToast(t('toastSaved', { file: basename(result.savedPath) }));
  } catch (err) {
    toast.show({ message: t('saveError', { msg: errorMessage(err) }), persist: true });
  }
}

async function closeOrphanedTab(filePath: string): Promise<void> {
  const tab = findTab(filePath);
  if (tab) await onCloseTab(tab.id);
}

async function openRecreated(filePath: string): Promise<void> {
  try {
    await api.allowRead(filePath);
    const file = await api.readFile(filePath);
    manager.addCopy(file);
    recordRecentFile(file.filePath);
  } catch (err) {
    setStatus(t('openError', { msg: errorMessage(err) }), 'err');
  }
}

async function refreshFromDisk(filePath: string): Promise<void> {
  try {
    await api.allowRead(filePath);
    const file = await api.readFile(filePath);
    if (paused) {
      pendingByPath.set(filePath, { content: file.content, modifiedAt: file.modifiedAt });
      manager.markPending(filePath);
      showChangedActions(filePath);
    } else {
      manager.updateContent(filePath, file.content, file.modifiedAt);
      showTransientToast(t('toastUpdated'));
    }
  } catch {
    /* file may have been removed again */
  }
}

function handleFileEvent(event: FileEvent): void {
  switch (event.kind) {
    case 'changed':
      if (!hasLiveTab(event.filePath)) break;
      if (paused) {
        pendingByPath.set(event.filePath, { content: event.content, modifiedAt: event.modifiedAt });
        manager.markPending(event.filePath);
        showChangedActions(event.filePath);
        break;
      }
      manager.updateContent(event.filePath, event.content, event.modifiedAt);
      setStatus(t('updated', { file: basename(event.filePath) }), 'ok');
      showTransientToast(t('toastUpdated'));
      break;
    case 'removed':
      if (!manager.hasPath(event.filePath)) break;
      if (grace.isActive(event.filePath)) break;
      if (!hasLiveTab(event.filePath)) break;
      grace.start(event.filePath, () => {
        pendingByPath.delete(event.filePath);
        manager.clearPending(event.filePath);
        manager.markOrphaned(event.filePath);
        showRemovedActions(event.filePath);
      });
      break;
    case 'recreated':
      if (recentlySaved.delete(event.filePath)) break;
      if (grace.isActive(event.filePath)) {
        grace.cancel(event.filePath);
        void refreshFromDisk(event.filePath);
        break;
      }
      if (manager.hasOrphaned(event.filePath)) {
        showRecreatedActions(event.filePath);
      }
      break;
    case 'error':
      setStatus(t('errorPrefix', { msg: event.message }), 'err');
      break;
  }
}

async function openPath(filePath: string): Promise<void> {
  try {
    setStatus(t('openingFile', { file: basename(filePath) }), '');
    await api.allowRead(filePath);
    const file = await api.readFile(filePath);
    if (manager.hasOrphaned(file.filePath)) {
      // The disk version opens next to the frozen tab instead of silently
      // replacing the frozen content.
      manager.addCopy(file);
    } else {
      manager.add(file);
    }
    recordRecentFile(file.filePath);
    setStatus(t('openOk', { file: file.fileName }), 'ok');
  } catch (err) {
    removeRecentFile(filePath);
    setStatus(t('openError', { msg: errorMessage(err) }), 'err');
  }
}

async function consumePending(): Promise<void> {
  const filePath = await api.consumePendingPath();
  if (filePath) {
    pendingClickConsumed = true;
    await openPath(filePath);
  }
}

function snapshotSession(): void {
  const state = manager.getState();
  const tabs = state.tabs.map((tab) => ({
    filePath: tab.filePath,
    scrollTop: scrollByPath.get(tab.filePath) ?? 0
  }));
  const active = state.activeId ? state.tabs.find((t) => t.id === state.activeId) : null;
  saveSession({ tabs, activePath: active ? active.filePath : null });
  renderCache.flush();
}

async function restoreSession(): Promise<void> {
  const session = loadSession();
  if (!session || session.tabs.length === 0) return;

  const results = await Promise.allSettled(
    session.tabs.map(async (tab) => {
      await api.allowRead(tab.filePath);
      return api.readFile(tab.filePath);
    })
  );

  const files: Awaited<ReturnType<typeof api.readFile>>[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      files.push(result.value);
      recordRecentFile(result.value.filePath);
    }
  }

  if (files.length === 0) return;

  manager.addMany(files, pendingClickConsumed ? null : (session.activePath ?? undefined));

  const savedScroll = session.tabs.find((t) => t.filePath === session.activePath)?.scrollTop ?? 0;
  if (savedScroll > 0) {
    pendingScrollTop = savedScroll;
  }
}

// ---- Code copy (event delegation on the content container) ----
function bindCodeCopy(): void {
  contentEl.addEventListener('click', async (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    const btn = target.closest<HTMLButtonElement>('.code-copy');
    if (!btn) return;
    const code = btn.closest('.code-block')?.querySelector('code');
    if (!code) return;
    await api.copyText(code.textContent ?? '');
    btn.textContent = t('copied');
    window.setTimeout(() => {
      btn.textContent = t('copy');
    }, 1500);
  });
}

// ---- Markdown link handling (event delegation on the content container) ----
function bindContentLinks(): void {
  contentEl.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      evt.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      const target =
        document.getElementById(id) ??
        document.querySelector<HTMLElement>(`[data-slug="${id}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    evt.preventDefault();
    if (/^(https?:|mailto:)/i.test(href)) {
      void api.openExternal(href);
    }
  });
}

async function openAbout(): Promise<void> {
  const version = await api.getAppVersion();
  aboutVersion.textContent = t('aboutVersion', { v: version });
  aboutDesc.textContent = t('aboutDesc');
  if (updateVersion) {
    aboutUpdateText.textContent = t('updateAvailable', { v: updateVersion });
    aboutUpdate.hidden = false;
  } else {
    aboutUpdate.hidden = true;
  }
  aboutModal.hidden = false;
  aboutCloseBtn.focus();
}

function closeAbout(): void {
  if (aboutModal.hidden) return;
  aboutModal.hidden = true;
  if (lastFocused) lastFocused.focus();
}

function bindAbout(): void {
  btnAbout.addEventListener('click', () => {
    lastFocused = btnAbout;
    void openAbout();
  });
  aboutCloseBtn.addEventListener('click', closeAbout);
  aboutRepoLink.addEventListener('click', () => void api.openExternal(REPO_URL));
  aboutUpdateBtn.addEventListener('click', () => void api.openExternal(REPO_RELEASES_URL));
  aboutModal.addEventListener('click', (evt) => {
    if (evt.target === aboutModal) closeAbout();
  });
  aboutModal.addEventListener('keydown', (evt) => {
    if (evt.key !== 'Tab') return;
    const focusable = aboutModal.querySelectorAll<HTMLElement>(
      'button, a[href], [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (evt.shiftKey && active === first) {
      evt.preventDefault();
      last.focus();
    } else if (!evt.shiftKey && active === last) {
      evt.preventDefault();
      first.focus();
    }
  });
}

async function openCustomCss(): Promise<void> {
  if (!customCssModal || !customCssInput || !customCssPathEl) return;
  try {
    const css = await loadCustomCss();
    customCssInput.value = css;
  } catch {
    customCssInput.value = '';
  }
  customCssPathEl.textContent = t('customCssPath', { path: getCustomCssPathHint() });
  customCssModal.hidden = false;
  customCssInput.focus();
}

function closeCustomCss(): void {
  if (!customCssModal || customCssModal.hidden) return;
  customCssModal.hidden = true;
  if (lastFocused) lastFocused.focus();
}

function bindCustomCss(): void {
  if (!btnCustomCss || !customCssModal || !customCssClose || !customCssInput || !customCssSaveBtn || !customCssClearBtn) return;
  btnCustomCss.addEventListener('click', () => {
    lastFocused = btnCustomCss;
    void openCustomCss();
  });
  customCssClose.addEventListener('click', closeCustomCss);
  customCssModal.addEventListener('click', (evt) => {
    if (evt.target === customCssModal) closeCustomCss();
  });
  customCssSaveBtn.addEventListener('click', async () => {
    const css = customCssInput.value;
    try {
      await saveCustomCss(css);
      applyCustomCss(css);
      toast.show({ message: t('customCssSaved') });
      closeCustomCss();
    } catch (err) {
      toast.show({ message: t('saveError', { msg: errorMessage(err) }), persist: true });
    }
  });
  customCssClearBtn.addEventListener('click', async () => {
    customCssInput.value = '';
    try {
      await saveCustomCss('');
      applyCustomCss('');
      toast.show({ message: t('customCssCleared') });
      closeCustomCss();
    } catch (err) {
      toast.show({ message: t('saveError', { msg: errorMessage(err) }), persist: true });
    }
  });
  customCssModal.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      closeCustomCss();
      return;
    }
    if (evt.key !== 'Tab') return;
    const focusable = customCssModal.querySelectorAll<HTMLElement>(
      'button, textarea, a[href], [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (evt.shiftKey && active === first) {
      evt.preventDefault();
      last.focus();
    } else if (!evt.shiftKey && active === last) {
      evt.preventDefault();
      first.focus();
    }
  });
  // keep textarea in sync when file changes on disk (watcher)
  const syncFromWatcher = (css: string): void => {
    applyCustomCss(css);
    if (!customCssModal.hidden && customCssInput) customCssInput.value = css;
  };
  if (typeof api.onCustomCssChanged === 'function') {
    api.onCustomCssChanged(syncFromWatcher);
  } else {
    const aliased = api as unknown as { onCustomCssChange?: (h: (css: string) => void) => () => void };
    if (typeof aliased.onCustomCssChange === 'function') aliased.onCustomCssChange(syncFromWatcher);
  }
}

function openSearch(): void {
  searchbar.hidden = false;
  fabOpen.hidden = true;
  searchInput.focus();
  searchInput.select();
}

function closeSearch(): void {
  searchbar.hidden = true;
  fabOpen.hidden = false;
  void api.stopFind();
  searchCount.textContent = '';
}

function runSearch(findNext: boolean, forward: boolean): void {
  const text = searchInput.value;
  if (!text) return;
  void api.findInPage(text, { findNext, forward });
}

function bindSearch(): void {
  searchInput.addEventListener('input', () => runSearch(true, true));
  searchInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter') {
      evt.preventDefault();
      runSearch(false, evt.shiftKey ? false : true);
    } else if (evt.key === 'Escape') {
      closeSearch();
    }
  });
  searchPrev.addEventListener('click', () => runSearch(false, false));
  searchNext.addEventListener('click', () => runSearch(false, true));
  searchClose.addEventListener('click', closeSearch);
  api.onFoundInPage((result) => {
    const total = result.matches;
    const current = result.activeMatchOrdinal;
    searchCount.textContent = total > 0 ? `${current}/${total}` : '0/0';
  });
}

function applyZoom(factor: number): void {
  zoomFactor = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, factor));
  api.setZoomFactor(zoomFactor);
}

function zoomIn(): void {
  applyZoom(zoomFactor + ZOOM_STEP);
}

function zoomOut(): void {
  applyZoom(zoomFactor - ZOOM_STEP);
}

function zoomReset(): void {
  applyZoom(1);
}

async function applyHighlightsForFile(filePath: string): Promise<void> {
  try {
    const list = await loadHighlights(filePath);
    renderHighlights(contentEl, list);
  } catch {
    /* ignore */
  }
}

async function handleAddHighlight(): Promise<void> {
  const active = manager.getActive();
  if (!active) return;
  const hl = addHighlight(contentEl, active.filePath, 'accent');
  if (!hl) return;
  try {
    const list = await loadHighlights(active.filePath);
    list.push(hl);
    await saveHighlights(active.filePath, list);
    renderHighlights(contentEl, list);
  } catch {
    /* ignore */
  }
}

async function handleHighlightFromText(text: string): Promise<void> {
  const active = manager.getActive();
  if (!active) return;
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 300) return;
  if ((contentEl.textContent ?? '').indexOf(trimmed) === -1) return;
  const hl = {
    id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: trimmed,
    color: 'accent' as const,
    createdAt: Date.now()
  };
  try {
    const list = await loadHighlights(active.filePath);
    list.push(hl);
    await saveHighlights(active.filePath, list);
    renderHighlights(contentEl, list);
  } catch {
    /* ignore */
  }
}

function renderExportMenu(): void {
  exportMenu.innerHTML = `
    <button class="recent-menu-item" data-act="pdf">${escapeHtml(t('exportPdf'))}</button>
    <button class="recent-menu-item" data-act="html">${escapeHtml(t('exportHtml'))}</button>
    <button class="recent-menu-item" data-act="copy">${escapeHtml(t('copyAsHtml'))}</button>`;
  exportMenu.querySelector<HTMLButtonElement>('[data-act="pdf"]')?.addEventListener('click', async () => {
    exportPopover.close();
    const res = await api.exportPdf();
    if (res) toast.show({ message: t('toastSaved', { file: basename(res.savedPath) }) });
  });
  exportMenu.querySelector<HTMLButtonElement>('[data-act="html"]')?.addEventListener('click', async () => {
    exportPopover.close();
    const css = await fetchCssText();
    const theme = document.documentElement.getAttribute('data-theme') || 'soft';
    const html = buildStandaloneHtml(contentEl.innerHTML, theme, css);
    const suggested = manager.getActive()?.filePath || 'document.md';
    const res = await api.exportHtml(html, suggested);
    if (res) toast.show({ message: t('toastSaved', { file: basename(res.savedPath) }) });
  });
  exportMenu.querySelector<HTMLButtonElement>('[data-act="copy"]')?.addEventListener('click', async () => {
    exportPopover.close();
    const css = await fetchCssText();
    const theme = document.documentElement.getAttribute('data-theme') || 'soft';
    const html = buildStandaloneHtml(contentEl.innerHTML, theme, css);
    await api.copyText(html);
    toast.show({ message: t('copied') });
  });
}

function buildPaletteCommands(): PaletteCmd[] {
  const cmds: PaletteCmd[] = [
    { id: 'openFile', label: t('openFile'), shortcut: 'Ctrl+O', action: () => void openFiles() },
    {
      id: 'toggleTheme',
      label: (() => {
        try {
          return t('themeTooltip').split('(')[0].trim();
        } catch {
          return 'Toggle theme';
        }
      })(),
      shortcut: 'Ctrl+Shift+T',
      action: () => {
        toggleTheme();
      }
    },
    {
      id: 'outline',
      label: t('outlineTitle'),
      action: () => {
        if (!btnOutline.hidden) btnOutline.click();
      }
    },
    {
      id: 'exportPdf',
      label: t('exportPdf'),
      action: async () => {
        const res = await api.exportPdf();
        if (res) toast.show({ message: t('toastSaved', { file: basename(res.savedPath) }) });
      }
    },
    {
      id: 'exportHtml',
      label: t('exportHtml'),
      action: async () => {
        const css = await fetchCssText();
        const theme = document.documentElement.getAttribute('data-theme') || 'soft';
        const html = buildStandaloneHtml(contentEl.innerHTML, theme, css);
        const suggested = manager.getActive()?.filePath || 'document.md';
        const res = await api.exportHtml(html, suggested);
        if (res) toast.show({ message: t('toastSaved', { file: basename(res.savedPath) }) });
      }
    },
    {
      id: 'copyAsHtml',
      label: t('copyAsHtml'),
      action: async () => {
        const css = await fetchCssText();
        const theme = document.documentElement.getAttribute('data-theme') || 'soft';
        const html = buildStandaloneHtml(contentEl.innerHTML, theme, css);
        await api.copyText(html);
        toast.show({ message: t('copied') });
      }
    },
    { id: 'find', label: t('searchPlaceholder'), shortcut: 'Ctrl+F', action: () => openSearch() },
    {
      id: 'globalSearch',
      label: t('globalSearchPlaceholder'),
      shortcut: 'Ctrl+Shift+F',
      action: () => openGlobalSearch()
    },
    {
      id: 'pause',
      label: paused ? t('resumeTooltip') : t('pauseTooltip'),
      action: () => btnPause.click()
    },
    {
      id: 'about',
      label: t('aboutTooltip'),
      action: () => {
        lastFocused = document.activeElement as HTMLElement | null;
        void openAbout();
      }
    },
    {
      id: 'customCss',
      label: t('customCssTitle'),
      action: () => {
        lastFocused = document.activeElement as HTMLElement | null;
        void openCustomCss();
      }
    },
    { id: 'zoomIn', label: 'Zoom in', shortcut: 'Ctrl+=', action: () => zoomIn() },
    { id: 'zoomOut', label: 'Zoom out', shortcut: 'Ctrl+-', action: () => zoomOut() },
    { id: 'zoomReset', label: 'Reset zoom', shortcut: 'Ctrl+0', action: () => zoomReset() }
  ];
  const recents = getRecentFiles();
  for (const p of recents) {
    cmds.push({
      id: `recent:${p}`,
      label: `${basename(p)} — ${p}`,
      action: () => void openPath(p)
    });
  }
  return cmds;
}

function refreshPaletteCommands(): void {
  registerCommands(buildPaletteCommands());
}

function handleOpenPalette(): void {
  refreshPaletteCommands();
  openPalette();
}

function bindUi(): void {
  btnNew.addEventListener('click', () => void openFiles());
  btnTheme.addEventListener('click', () => {
    toggleTheme();
    void loadCustomCss().then(applyCustomCss);
  });
  fabOpen.addEventListener('click', () => void openFiles());
  bindCodeCopy();
  bindContentLinks();
  bindPauseToggle();

  recentPopover = bindRecentMenu(btnRecent, recentMenu, openPath);
  langPopover = bindLangMenu(btnLang, langMenu);
  exportPopover = createPopover(btnExport, exportMenu, renderExportMenu);
  outlinePopover = bindOutline(btnOutline, outlineMenu, contentEl);
  bindAbout();
  bindCustomCss();
  bindSearch();
  bindGlobalSearch();

  if (btnSidebar && sidebarEl && sidebarListEl) {
    setSidebarContext(sidebarListEl, openPath);
    bindSidebar(btnSidebar, sidebarEl, sidebarListEl, openPath);
  }

  bindShortcuts({
    openFiles,
    closeActiveTab: async () => {
      const active = manager.getActive();
      if (active) await onCloseTab(active.id);
    },
    toggleTheme: () => {
      const next = toggleTheme();
      // ensure custom CSS survives theme re-paint
      void loadCustomCss().then(applyCustomCss);
      return next;
    },
    closeMenus: () => {
      recentPopover.close();
      langPopover.close();
      exportPopover.close();
      outlinePopover.close();
      closeAbout();
      closeCustomCss();
      closePalette();
    },
    onSearch: openSearch,
    openGlobalSearch,
    closeGlobalSearch,
    zoomIn,
    zoomOut,
    zoomReset,
    onHighlight: () => void handleAddHighlight(),
    openPalette: () => handleOpenPalette(),
    toggleSidebar: () => {
      if (sidebarEl) toggleSidebar(sidebarEl);
    }
  });

  api.onHighlightAdd((text) => void handleHighlightFromText(text));

  api.onOpenPath((filePath) => {
    pendingClickConsumed = true;
    void openPath(filePath);
  });

  tabsEl.addEventListener('keydown', (evt) => {
    if (evt.key !== 'ArrowLeft' && evt.key !== 'ArrowRight') return;
    const state = manager.getState();
    const tabs = state.tabs;
    if (tabs.length < 2) return;
    const index = tabs.findIndex((t) => t.id === state.activeId);
    const delta = evt.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    manager.activate(next.id);
    tabsEl.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus();
  });

  void consumePending();
  bindDragAndDrop({ api, manager, openPath, setStatus });
}

async function bootstrap(): Promise<void> {
  const osLocale = new URLSearchParams(location.search).get('lang');
  await initI18n({
    osLocale: osLocale ?? null,
    getOsLocale: () => api.getOsLocale(),
    setLanguage: (lang) => api.setLanguage(lang)
  });
  perfMark('renderer:i18n');
  applyStaticStrings();
  applyPauseUi();
  void initCustomCss().catch(() => {});

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(
      () => setTimeout(() => runUpdateCheck(), 5000),
      { timeout: 3000 }
    );
  } else {
    setTimeout(runUpdateCheck, 5000);
  }

  let sessionRestored = false;

  manager.subscribe((state) => {
    renderTabbar(state);
    void renderContent(state);
    const active = state.activeId ? state.tabs.find((t) => t.id === state.activeId) : null;
    if (active) doRefreshSidebar(active.filePath);
    if (sessionRestored || state.tabs.length > 0) snapshotSession();
  });

  subscribeLang(() => {
    applyStaticStrings();
    applyPauseUi();
    refreshUi();
    refreshPaletteCommands();
  });

  api.onFileEvent(handleFileEvent);
  bindUi();
  refreshPaletteCommands();

  contentEl.addEventListener(
    'scroll',
    debounce(() => {
      const active = manager.getActive();
      if (active) scrollByPath.set(active.filePath, contentEl.scrollTop);
      snapshotSession();
    }, 300)
  );

  await restoreSession();
  sessionRestored = true;
  perfMark('renderer:bootstrap-done');
}

function runUpdateCheck(): void {
  void checkForUpdate(api, {
    onUpdate: (v) => {
      updateVersion = v;
      applyStaticStrings();
      btnAbout.classList.add('has-update');
    }
  });
}

void bootstrap();
