import { debounce } from '@shared/util';
import { t } from './i18n';
import { escapeHtml } from './util';

export interface PaletteCmd {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void | Promise<void>;
}

let commands: PaletteCmd[] = [];
let selectedIndex = 0;
let filtered: PaletteCmd[] = [];
let lastFocused: HTMLElement | null = null;
let listenersBound = false;

function getBackdrop(): HTMLDivElement | null {
  return document.getElementById('palette-backdrop') as HTMLDivElement | null;
}

function getInput(): HTMLInputElement | null {
  return document.getElementById('palette-input') as HTMLInputElement | null;
}

function getList(): HTMLUListElement | null {
  return document.getElementById('palette-list') as HTMLUListElement | null;
}

export function registerCommands(cmds: PaletteCmd[]): void {
  commands = [...cmds];
}

export function getCommands(): PaletteCmd[] {
  return [...commands];
}

/**
 * Case-insensitive substring + simple fuzzy (chars in order). Limit 20.
 */
export function filterCommands(query: string, list?: PaletteCmd[]): PaletteCmd[] {
  const source = list ?? commands;
  const q = query.trim().toLowerCase();
  if (!q) return source.slice(0, 20);
  const out: PaletteCmd[] = [];
  for (const c of source) {
    const label = c.label.toLowerCase();
    if (label.includes(q)) {
      out.push(c);
      continue;
    }
    // fuzzy: q chars appear in order in label
    let pos = 0;
    let ok = true;
    for (const ch of q) {
      const idx = label.indexOf(ch, pos);
      if (idx === -1) {
        ok = false;
        break;
      }
      pos = idx + 1;
    }
    if (ok) out.push(c);
    if (out.length >= 20) break;
  }
  return out.slice(0, 20);
}

function renderList(): void {
  const list = getList();
  const input = getInput();
  if (!list) return;
  const q = input?.value ?? '';
  filtered = filterCommands(q);
  if (filtered.length === 0) {
    list.innerHTML = `<li class="recent-empty">${escapeHtml(t('paletteEmpty'))}</li>`;
    selectedIndex = -1;
    return;
  }
  if (selectedIndex < 0 || selectedIndex >= filtered.length) selectedIndex = 0;
  list.innerHTML = filtered
    .map(
      (c, i) =>
        `<li><button class="palette-item${i === selectedIndex ? ' is-active' : ''}" type="button" data-index="${i}"><span class="palette-label">${escapeHtml(c.label)}</span>${c.shortcut ? `<span class="palette-shortcut">${escapeHtml(c.shortcut)}</span>` : ''}</button></li>`
    )
    .join('');
  for (const btn of list.querySelectorAll<HTMLButtonElement>('.palette-item')) {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      if (!Number.isNaN(idx) && filtered[idx]) {
        void executeAndClose(filtered[idx]);
      }
    });
  }
  // ensure selected visible
  const active = list.querySelector<HTMLButtonElement>('.palette-item.is-active');
  active?.scrollIntoView({ block: 'nearest' });
}

async function executeAndClose(cmd: PaletteCmd): Promise<void> {
  closePalette();
  try {
    await cmd.action();
  } catch {
    /* ignore action errors */
  }
}

function onInputDebounced(): void {
  selectedIndex = 0;
  renderList();
}

const debouncedRender = debounce(onInputDebounced, 60);

function bindListeners(): void {
  if (listenersBound) return;
  listenersBound = true;
  const backdrop = getBackdrop();
  const input = getInput();
  if (!backdrop || !input) return;

  backdrop.addEventListener('click', (evt) => {
    if (evt.target === backdrop) closePalette();
  });

  input.addEventListener('input', () => {
    debouncedRender();
  });

  input.addEventListener('keydown', (evt) => {
    if (evt.key === 'ArrowDown') {
      evt.preventDefault();
      if (filtered.length === 0) return;
      selectedIndex = (selectedIndex + 1) % filtered.length;
      renderList();
    } else if (evt.key === 'ArrowUp') {
      evt.preventDefault();
      if (filtered.length === 0) return;
      selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
      renderList();
    } else if (evt.key === 'Enter') {
      evt.preventDefault();
      const cmd = filtered[selectedIndex];
      if (cmd) void executeAndClose(cmd);
    } else if (evt.key === 'Escape') {
      evt.preventDefault();
      closePalette();
    } else if (evt.key === 'Tab') {
      // simple focus trap: keep focus on input, cycle selection instead
      evt.preventDefault();
      if (evt.shiftKey) {
        if (filtered.length === 0) return;
        selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
      } else {
        if (filtered.length === 0) return;
        selectedIndex = (selectedIndex + 1) % filtered.length;
      }
      renderList();
    }
  });

  // Global Esc to close when backdrop is visible (redundant with input handler but for backdrop focus)
  window.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      const bd = getBackdrop();
      if (bd && !bd.hidden) closePalette();
    }
  });
}

export function openPalette(): void {
  const backdrop = getBackdrop();
  const input = getInput();
  if (!backdrop || !input) return;
  bindListeners();
  lastFocused = document.activeElement as HTMLElement | null;
  selectedIndex = 0;
  input.value = '';
  // placeholder is set via static i18n; ensure t translation applied (in case language changed)
  try {
    input.placeholder = t('palettePlaceholder');
  } catch {
    /* ignore */
  }
  backdrop.hidden = false;
  renderList();
  input.focus();
  input.select();
}

export function closePalette(): void {
  const backdrop = getBackdrop();
  if (!backdrop) return;
  if (backdrop.hidden) return;
  backdrop.hidden = true;
  if (lastFocused && typeof lastFocused.focus === 'function') {
    try {
      lastFocused.focus();
    } catch {
      /* ignore */
    }
  }
  lastFocused = null;
}

export function isPaletteOpen(): boolean {
  const bd = getBackdrop();
  return !!bd && !bd.hidden;
}
