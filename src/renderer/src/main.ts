import type { FileEvent } from '@shared/types';
import type { MdApi } from '@shared/api';
import { TabManager, type TabData } from './tabs';
import { renderMarkdown } from './markdown';
import { initTheme, toggleTheme } from './theme';

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
    closeBtn.setAttribute('aria-label', `Fechar ${tab.fileName}`);
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
      <h1>Nenhum arquivo aberto</h1>
      <p>Abra um arquivo <code>.md</code> para começar a ler.</p>
      <button id="btn-open-empty" class="btn btn-primary">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Abrir arquivo
      </button>
    </div>
  `;
  document.getElementById('btn-open-empty')?.addEventListener('click', () => void openFiles());
}

async function renderContent(state: { tabs: TabData[]; activeId: string | null }): Promise<void> {
  const active = state.activeId
    ? state.tabs.find((t) => t.id === state.activeId) ?? null
    : null;

  if (!active) {
    renderEmpty();
    setStatus('Pronto', '');
    setStatusRight('');
    return;
  }

  const html = await renderMarkdown(active.content);
  contentEl.innerHTML = `<article class="markdown-body">${html}</article>`;

  setStatus(`Lendo: ${active.fileName}`, 'ok');
  setStatusRight(formatTimestamp(active.modifiedAt));

  contentEl.classList.remove('flash');
  void contentEl.offsetWidth;
  contentEl.classList.add('flash');
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return `modificado: ${d.toLocaleTimeString()}`;
}

async function openFiles(): Promise<void> {
  try {
    setStatus('Abrindo...', '');
    const files = await api.openDialog();
    if (files.length === 0) {
      setStatus('Cancelado', '');
      return;
    }
    for (const file of files) {
      manager.add(file);
    }
    setStatus(`${files.length} arquivo(s) aberto(s)`, 'ok');
  } catch (err) {
    setStatus(`Erro: ${errorMessage(err)}`, 'err');
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
      setStatus(`Atualizado: ${basename(event.filePath)}`, 'ok');
      break;
    case 'removed':
      manager.closeByPath(event.filePath);
      setStatus(`Arquivo removido: ${basename(event.filePath)}`, 'warn');
      break;
    case 'error':
      setStatus(`Erro: ${event.message}`, 'err');
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
    setStatus(`Abrindo ${basename(filePath)}...`, '');
    const file = await api.readFile(filePath);
    manager.add(file);
    setStatus(`Arquivo aberto: ${file.fileName}`, 'ok');
  } catch (err) {
    setStatus(`Erro ao abrir: ${errorMessage(err)}`, 'err');
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

function isMarkdownDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind !== 'file') continue;
      const f = item.getAsFile();
      if (f && MARKDOWN_EXT.test(f.name)) return true;
    }
    return false;
  }
  const files = dt.files;
  for (let i = 0; i < files.length; i++) {
    if (MARKDOWN_EXT.test(files[i].name)) return true;
  }
  return false;
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
      if (isMarkdownDrag(dt)) {
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
        evt.dataTransfer.dropEffect = isMarkdownDrag(evt.dataTransfer) ? 'copy' : 'none';
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

      const files = evt.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!MARKDOWN_EXT.test(f.name)) continue;
        try {
          const path = api.getPathForFile(f);
          if (path) paths.push(path);
        } catch (err) {
          setStatus(`Erro no drop: ${errorMessage(err)}`, 'err');
        }
      }

      if (paths.length === 0) {
        setStatus('Nenhum arquivo Markdown no drop', 'warn');
        return;
      }

      for (const p of paths) {
        await openPath(p);
      }
      setStatus(`${paths.length} arquivo(s) aberto(s) via drop`, 'ok');
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

function bindUi(): void {
  btnNew.addEventListener('click', () => void openFiles());
  btnTheme.addEventListener('click', () => toggleTheme());
  fabOpen.addEventListener('click', () => void openFiles());

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
    }
  });

  api.onOpenPath((filePath) => {
    void openPath(filePath);
  });

  void consumePending();
  bindDragAndDrop();
}

manager.subscribe((state) => {
  renderTabbar(state);
  void renderContent(state);
});

api.onFileEvent(handleFileEvent);

bindUi();