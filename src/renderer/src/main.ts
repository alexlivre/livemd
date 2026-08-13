import type { FileEvent } from '@shared/types';
import type { MdApi } from '@shared/api';
import { MESSAGES, type MsgKey } from '@shared/i18n';
import { TabManager, type TabData } from './tabs';
import { initTheme, toggleTheme } from './theme';
import { RenderCache } from './renderCache';
import { getRecentFiles, recordRecentFile, removeRecentFile } from './recent';
import { getEffectiveLang, initI18n, subscribe as subscribeLang, t } from './i18n';
import { basename, errorMessage, escapeAttr, escapeHtml } from './util';
import { bindDragAndDrop } from './drop';
import { bindShortcuts } from './shortcuts';
import { bindRecentMenu, bindLangMenu, type Popover } from './menus';
import { checkForUpdate } from './update';
import { saveSession, loadSession } from './session';
import { debounce } from '@shared/util';

declare global {
  interface Window {
    mdApi: MdApi;
  }
}

const api = window.mdApi;

initTheme();

const tabsEl = document.getElementById('tabs') as HTMLDivElement;
const contentEl = document.getElementById('content') as HTMLElement;
const statusLeft = document.getElementById('status-left') as HTMLSpanElement;
const statusRight = document.getElementById('status-right') as HTMLSpanElement;
const btnNew = document.getElementById('btn-new') as HTMLButtonElement;
const btnTheme = document.getElementById('btn-theme') as HTMLButtonElement;
const btnRecent = document.getElementById('btn-recent') as HTMLButtonElement;
const recentMenu = document.getElementById('recent-menu') as HTMLDivElement;
const btnLang = document.getElementById('btn-lang') as HTMLButtonElement;
const langMenu = document.getElementById('lang-menu') as HTMLDivElement;
const btnAbout = document.getElementById('btn-about') as HTMLButtonElement;
const aboutModal = document.getElementById('about-modal') as HTMLDivElement;
const aboutCloseBtn = document.getElementById('about-close') as HTMLButtonElement;
const aboutVersion = document.getElementById('about-version') as HTMLDivElement;
const aboutDesc = document.getElementById('about-desc') as HTMLParagraphElement;
const aboutRepoLink = document.getElementById('about-repo-link') as HTMLButtonElement;
const aboutUpdate = document.getElementById('about-update') as HTMLDivElement;
const aboutUpdateText = document.getElementById('about-update-text') as HTMLParagraphElement;
const aboutUpdateBtn = document.getElementById('about-update-btn') as HTMLButtonElement;
const searchbar = document.getElementById('searchbar') as HTMLDivElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchCount = document.getElementById('search-count') as HTMLSpanElement;
const searchPrev = document.getElementById('search-prev') as HTMLButtonElement;
const searchNext = document.getElementById('search-next') as HTMLButtonElement;
const searchClose = document.getElementById('search-close') as HTMLButtonElement;

const REPO_URL = 'https://github.com/alexlivre/livemd';
const REPO_RELEASES_URL = `${REPO_URL}/releases`;

let updateVersion: string | null = null;
const fabOpen = document.getElementById('fab-open') as HTMLButtonElement;

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

    el.addEventListener('click', () => manager.activate(tab.id));
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

async function renderContent(state: { tabs: TabData[]; activeId: string | null }): Promise<void> {
  const active = state.activeId
    ? state.tabs.find((t) => t.id === state.activeId) ?? null
    : null;

  if (!active) {
    renderEmpty();
    setStatus(t('ready'), '');
    setStatusRight('');
    return;
  }

  let html = renderCache.get(active.filePath, active.content);
  if (html === null) {
    const { renderMarkdown } = await getMarkdown();
    html = await renderMarkdown(active.content);
    renderCache.set(active.filePath, active.content, html);
  }
  contentEl.innerHTML = `<article class="markdown-body">${html}</article>`;

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

function handleFileEvent(event: FileEvent): void {
  switch (event.kind) {
    case 'changed':
      manager.updateContent(event.filePath, event.content, event.modifiedAt);
      setStatus(t('updated', { file: basename(event.filePath) }), 'ok');
      break;
    case 'removed':
      manager.closeByPath(event.filePath);
      renderCache.delete(event.filePath);
      setStatus(t('removed', { file: basename(event.filePath) }), 'warn');
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
    manager.add(file);
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
}

async function restoreSession(): Promise<void> {
  const session = loadSession();
  if (!session || session.tabs.length === 0) return;
  for (const tab of session.tabs) {
    await openPath(tab.filePath);
  }
  if (session.activePath) {
    const state = manager.getState();
    const target = state.tabs.find((t) => t.filePath === session.activePath);
    if (target) manager.activate(target.id);
  }
  const savedScroll = session.tabs.find((t) => t.filePath === session.activePath)?.scrollTop ?? 0;
  if (savedScroll > 0) {
    pendingScrollTop = savedScroll;
    void renderContent(manager.getState());
  }
}

// ---- Code copy (event delegation on the content container) ----
function bindCodeCopy(): void {
  contentEl.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    const btn = target.closest<HTMLButtonElement>('.code-copy');
    if (!btn) return;
    const code = btn.closest('.code-block')?.querySelector('code');
    if (!code) return;
    api.copyText(code.textContent ?? '');
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
    if (href.startsWith('#')) return;
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

function openSearch(): void {
  searchbar.hidden = false;
  searchInput.focus();
  searchInput.select();
}

function closeSearch(): void {
  searchbar.hidden = true;
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

function bindUi(): void {
  btnNew.addEventListener('click', () => void openFiles());
  btnTheme.addEventListener('click', () => toggleTheme());
  fabOpen.addEventListener('click', () => void openFiles());
  bindCodeCopy();
  bindContentLinks();

  recentPopover = bindRecentMenu(btnRecent, recentMenu, openPath);
  langPopover = bindLangMenu(btnLang, langMenu);
  bindAbout();
  bindSearch();

  bindShortcuts({
    openFiles,
    closeActiveTab: async () => {
      const active = manager.getActive();
      if (active) await onCloseTab(active.id);
    },
    toggleTheme,
    closeMenus: () => {
      recentPopover.close();
      langPopover.close();
      closeAbout();
    },
    onSearch: openSearch,
    zoomIn,
    zoomOut,
    zoomReset
  });

  api.onOpenPath((filePath) => {
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
  await initI18n({
    getOsLocale: () => api.getOsLocale(),
    setLanguage: (lang) => api.setLanguage(lang)
  });
  applyStaticStrings();

  manager.subscribe((state) => {
    renderTabbar(state);
    void renderContent(state);
    snapshotSession();
  });

  subscribeLang(() => {
    applyStaticStrings();
    refreshUi();
  });

  api.onFileEvent(handleFileEvent);
  bindUi();

  contentEl.addEventListener(
    'scroll',
    debounce(() => {
      const active = manager.getActive();
      if (active) scrollByPath.set(active.filePath, contentEl.scrollTop);
      snapshotSession();
    }, 300)
  );

  await restoreSession();

  void checkForUpdate(api, {
    onUpdate: (v) => {
      updateVersion = v;
      applyStaticStrings();
      btnAbout.classList.add('has-update');
    }
  });
}

void bootstrap();
