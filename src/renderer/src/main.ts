import type { FileEvent } from '@shared/types';
import type { MdApi } from '@shared/api';
import { MESSAGES, LANG_OPTIONS, type MsgKey } from '@shared/i18n';
import { TabManager, type TabData } from './tabs';
import { renderMarkdown } from './markdown';
import { initTheme, toggleTheme } from './theme';
import { clearRecentFiles, getRecentFiles, recordRecentFile, removeRecentFile } from './recent';
import {
  getEffectiveLang,
  getOsLangLabel,
  getOverride,
  initI18n,
  setOverride,
  subscribe as subscribeLang,
  t
} from './i18n';

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

const REPO_URL = 'https://github.com/alexlivre/livemd';

const UPDATE_CHECK_KEY = 'md-reader.update-check';
let updateVersion: string | null = null;
const fabOpen = document.getElementById('fab-open') as HTMLButtonElement;
const dropOverlay = document.getElementById('drop-overlay') as HTMLDivElement;

const manager = new TabManager();

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
    if (tab.id === state.activeId) el.classList.add('is-active');

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

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

function renderEmpty(): void {
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

  const html = await renderMarkdown(active.content);
  contentEl.innerHTML = `<article class="markdown-body">${html}</article>`;

  setStatus(t('reading', { file: active.fileName }), 'ok');
  setStatusRight(formatTimestamp(active.modifiedAt));

  contentEl.classList.remove('flash');
  void contentEl.offsetWidth;
  contentEl.classList.add('flash');
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return t('modifiedAt', { time: d.toLocaleTimeString() });
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
  if (removedPath) await api.closeTab(removedPath);
}

function handleFileEvent(event: FileEvent): void {
  switch (event.kind) {
    case 'changed':
      manager.updateContent(event.filePath, event.content, event.modifiedAt);
      setStatus(t('updated', { file: basename(event.filePath) }), 'ok');
      break;
    case 'removed':
      manager.closeByPath(event.filePath);
      setStatus(t('removed', { file: basename(event.filePath) }), 'warn');
      break;
    case 'error':
      setStatus(t('errorPrefix', { msg: event.message }), 'err');
      break;
  }
}

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function openPath(filePath: string): Promise<void> {
  try {
    setStatus(t('openingFile', { file: basename(filePath) }), '');
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

// ---- Drag & drop ----
const MARKDOWN_EXT = /\.(md|markdown|mdown|mkd|mdx)$/i;

// On file:// pages (packaged builds) the DataTransfer stays in protected mode
// during dragenter/dragover: item kinds are enumerable, but getAsFile()
// returns null and files is empty. Only inspect kinds here so the drop is
// never rejected; extension filtering happens in the drop handler.
function hasDraggedFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      if (dt.items[i].kind === 'file') return true;
    }
    return false;
  }
  return dt.files.length > 0;
}

function collectDroppedFiles(dt: DataTransfer | null): File[] {
  const files: File[] = [];
  if (!dt) return files;
  if (dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) files.push(dt.files[i]);
    return files;
  }
  if (dt.items) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind !== 'file') continue;
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

async function openDroppedFile(f: File): Promise<boolean> {
  try {
    const path = api.getPathForFile(f);
    if (path) {
      await openPath(path);
      return true;
    }
  } catch (err) {
    setStatus(t('dropError', { msg: errorMessage(err) }), 'err');
    return false;
  }

  // No real path available — read the content directly and open a tab
  // without file watching.
  try {
    const content = await f.text();
    manager.add({
      filePath: `drop://${f.name}`,
      fileName: f.name,
      content,
      modifiedAt: Date.now()
    });
    setStatus(t('openedWithoutWatch', { file: f.name }), 'warn');
    return true;
  } catch (err) {
    setStatus(t('readDroppedError', { msg: errorMessage(err) }), 'err');
    return false;
  }
}

function bindDragAndDrop(): void {
  let depth = 0;
  const root = document.documentElement;

  root.addEventListener(
    'dragenter',
    (evt) => {
      const dt = evt.dataTransfer;
      if (!dt) return;
      // Always preventDefault when ANY file is being dragged in — this
      // prevents Electron from navigating to the dropped file.
      evt.preventDefault();
      depth++;
      if (hasDraggedFiles(dt)) {
        dropOverlay.classList.add('is-visible');
      }
    },
    { capture: true }
  );

  root.addEventListener(
    'dragover',
    (evt) => {
      // preventDefault on EVERY dragover, even when not markdown, so the
      // browser doesn't reject the drop.
      evt.preventDefault();
      if (evt.dataTransfer) {
        evt.dataTransfer.dropEffect = hasDraggedFiles(evt.dataTransfer) ? 'copy' : 'none';
      }
    },
    { capture: true }
  );

  root.addEventListener(
    'dragleave',
    () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) dropOverlay.classList.remove('is-visible');
    },
    { capture: true }
  );

  root.addEventListener(
    'drop',
    async (evt) => {
      evt.preventDefault();
      depth = 0;
      dropOverlay.classList.remove('is-visible');

      try {
        const files = collectDroppedFiles(evt.dataTransfer);
        if (files.length === 0) {
          setStatus(t('noFileInDrop'), 'warn');
          return;
        }

        const markdownFiles = files.filter((f) => MARKDOWN_EXT.test(f.name));
        if (markdownFiles.length === 0) {
          setStatus(t('noMarkdownInDrop'), 'warn');
          return;
        }

        let opened = 0;
        for (const f of markdownFiles) {
          if (await openDroppedFile(f)) opened++;
        }
        if (opened === markdownFiles.length) {
          setStatus(t('openedViaDrop', { n: opened }), 'ok');
        }
      } catch (err) {
        setStatus(t('dropError', { msg: errorMessage(err) }), 'err');
      }
    },
    { capture: true }
  );

  root.addEventListener(
    'dragend',
    () => {
      depth = 0;
      dropOverlay.classList.remove('is-visible');
    },
    { capture: true }
  );
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

// ---- Recent files (titlebar dropdown) ----
function renderRecentMenu(): void {
  const files = getRecentFiles();
  if (files.length === 0) {
    recentMenu.innerHTML = `<div class="recent-empty">${escapeHtml(t('recentEmpty'))}</div>`;
    return;
  }
  recentMenu.innerHTML = `
    <ul class="recent-menu-list">
      ${files
        .map(
          (p) =>
            `<li><button class="recent-menu-item" type="button" data-path="${escapeAttr(p)}" title="${escapeAttr(p)}"><span class="recent-menu-name">${escapeHtml(basename(p))}</span><span class="recent-menu-path">${escapeHtml(p)}</span></button></li>`
        )
        .join('')}
    </ul>
    <button class="recent-clear" type="button">${escapeHtml(t('clearHistory'))}</button>
  `;
  for (const item of recentMenu.querySelectorAll<HTMLButtonElement>('.recent-menu-item')) {
    item.addEventListener('click', () => {
      closeRecentMenu();
      const path = item.dataset.path;
      if (path) void openPath(path);
    });
  }
  recentMenu.querySelector('.recent-clear')?.addEventListener('click', () => {
    clearRecentFiles();
    renderRecentMenu();
  });
}

function closeRecentMenu(): void {
  recentMenu.hidden = true;
  btnRecent.classList.remove('is-active');
}function renderLangMenu(): void {
  const items: Array<{ value: 'auto' | 'pt' | 'en' | 'es'; label: string }> = [
    { value: 'auto', label: t('langAuto', { lang: getOsLangLabel() }) },
    ...LANG_OPTIONS
  ];
  langMenu.innerHTML = `
    <div class="lang-menu-title">${escapeHtml(t('langMenuTitle'))}</div>
    <ul class="recent-menu-list">
      ${items
        .map(
          (item) =>
            `<li><button class="lang-menu-item ${item.value === getOverride() ? 'is-active' : ''}" type="button" data-value="${item.value}"><span class="lang-check" aria-hidden="true">✓</span><span class="recent-menu-name">${escapeHtml(item.label)}</span></button></li>`
        )
        .join('')}
    </ul>
  `;
  for (const item of langMenu.querySelectorAll<HTMLButtonElement>('.lang-menu-item')) {
    item.addEventListener('click', () => {
      const value = item.dataset.value;
      if (value === 'auto' || value === 'pt' || value === 'en' || value === 'es') {
        closeLangMenu();
        if (value !== getOverride()) setOverride(value);
      }
    });
  }
}

function closeLangMenu(): void {
  langMenu.hidden = true;
  btnLang.classList.remove('is-active');
}

function toggleLangMenu(): void {
  if (langMenu.hidden) {
    renderLangMenu();
    langMenu.hidden = false;
    btnLang.classList.add('is-active');
  } else {
    closeLangMenu();
  }
}

async function openAbout(): Promise<void> {
  const version = await api.getAppVersion();
  aboutVersion.textContent = t('aboutVersion', { v: version });
  aboutDesc.textContent = t('aboutDesc');
  aboutModal.hidden = false;
}

function closeAbout(): void {
  aboutModal.hidden = true;
}

function bindAbout(): void {
  btnAbout.addEventListener('click', () => void openAbout());
  aboutCloseBtn.addEventListener('click', closeAbout);
  aboutRepoLink.addEventListener('click', () => void api.openExternal(REPO_URL));
  aboutModal.addEventListener('click', (evt) => {
    if (evt.target === aboutModal) closeAbout();
  });
}

function bindLangMenu(): void {
  btnLang.addEventListener('click', (evt) => {
    evt.stopPropagation();
    toggleLangMenu();
  });

  document.addEventListener('click', (evt) => {
    if (langMenu.hidden) return;
    const target = evt.target as Node | null;
    if (target && langMenu.contains(target)) return;
    closeLangMenu();
  });
}

function toggleRecentMenu(): void {
  if (recentMenu.hidden) {
    renderRecentMenu();
    recentMenu.hidden = false;
    btnRecent.classList.add('is-active');
  } else {
    closeRecentMenu();
  }
}

function bindRecentMenu(): void {
  btnRecent.addEventListener('click', (evt) => {
    evt.stopPropagation();
    toggleRecentMenu();
  });

  document.addEventListener('click', (evt) => {
    if (recentMenu.hidden) return;
    const target = evt.target as Node | null;
    if (target && recentMenu.contains(target)) return;
    closeRecentMenu();
  });
}

function bindUi(): void {
  btnNew.addEventListener('click', () => void openFiles());
  btnTheme.addEventListener('click', () => toggleTheme());
  fabOpen.addEventListener('click', () => void openFiles());
  bindCodeCopy();
  bindRecentMenu();
  bindLangMenu();
  bindAbout();

  window.addEventListener('keydown', (evt) => {
    const isCtrl = evt.ctrlKey || evt.metaKey;
    if (isCtrl && evt.key.toLowerCase() === 'o') {
      evt.preventDefault();
      void openFiles();
    } else if (isCtrl && evt.key.toLowerCase() === 'w') {
      const active = manager.getActive();
      if (active) {
        evt.preventDefault();
        void onCloseTab(active.id);
      }
    } else if (isCtrl && evt.shiftKey && evt.key.toLowerCase() === 't') {
      evt.preventDefault();
      toggleTheme();
    } else if (evt.key === 'Escape') {
      closeRecentMenu();
      closeLangMenu();
      closeAbout();
    }
  });

  api.onOpenPath((filePath) => {
    void openPath(filePath);
  });

  void consumePending();
  bindDragAndDrop();
}

async function checkForUpdate(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  let lastCheck = '';
  try {
    lastCheck = localStorage.getItem(UPDATE_CHECK_KEY) ?? '';
    localStorage.setItem(UPDATE_CHECK_KEY, today);
  } catch {
    /* localStorage may be disabled — check anyway */
  }
  if (lastCheck === today) return;
  const result = await api.checkUpdate();
  if (result && result.hasUpdate) {
    updateVersion = result.latestVersion.replace(/^v/, '');
    applyStaticStrings();
    btnAbout.classList.add('has-update');
  }
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
  });

  subscribeLang(() => {
    applyStaticStrings();
    refreshUi();
  });

  api.onFileEvent(handleFileEvent);
  bindUi();
  void checkForUpdate();
}

void bootstrap();