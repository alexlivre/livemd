import { LANG_OPTIONS } from '@shared/i18n';
import { clearRecentFiles, getRecentFiles } from './recent';
import { getOsLangLabel, getOverride, setOverride, t } from './i18n';
import { basename, escapeAttr, escapeHtml } from './util';

export interface Popover {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
}

export function createPopover(
  trigger: HTMLButtonElement,
  menu: HTMLElement,
  onOpen?: () => void
): Popover {
  const open = (): void => {
    menu.hidden = false;
    trigger.classList.add('is-active');
    trigger.setAttribute('aria-expanded', 'true');
    onOpen?.();
  };
  const close = (): void => {
    menu.hidden = true;
    trigger.classList.remove('is-active');
    trigger.setAttribute('aria-expanded', 'false');
  };
  const toggle = (): void => {
    if (menu.hidden) open();
    else close();
  };

  trigger.addEventListener('click', (evt) => {
    evt.stopPropagation();
    toggle();
  });

  document.addEventListener('click', (evt) => {
    if (menu.hidden) return;
    const target = evt.target as Node | null;
    if (target && (menu.contains(target) || target === trigger)) return;
    close();
  });

  return { open, close, toggle, isOpen: () => !menu.hidden };
}

function renderRecentMenu(
  menu: HTMLElement,
  close: () => void,
  openPath: (p: string) => Promise<void>
): void {
  const files = getRecentFiles();
  if (files.length === 0) {
    menu.innerHTML = `<div class="recent-empty">${escapeHtml(t('recentEmpty'))}</div>`;
    return;
  }
  menu.innerHTML = `
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
  for (const item of menu.querySelectorAll<HTMLButtonElement>('.recent-menu-item')) {
    item.addEventListener('click', () => {
      close();
      const path = item.dataset.path;
      if (path) void openPath(path);
    });
  }
  menu.querySelector('.recent-clear')?.addEventListener('click', () => {
    clearRecentFiles();
    renderRecentMenu(menu, close, openPath);
  });
}

export function bindRecentMenu(
  trigger: HTMLButtonElement,
  menu: HTMLElement,
  openPath: (p: string) => Promise<void>
): Popover {
  let popover: Popover;
  popover = createPopover(trigger, menu, () =>
    renderRecentMenu(menu, () => popover.close(), openPath)
  );
  return popover;
}

function renderLangMenu(menu: HTMLElement, close: () => void): void {
  const items: Array<{ value: 'auto' | 'pt' | 'en' | 'es'; label: string }> = [
    { value: 'auto', label: t('langAuto', { lang: getOsLangLabel() }) },
    ...LANG_OPTIONS
  ];
  menu.innerHTML = `
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
  for (const item of menu.querySelectorAll<HTMLButtonElement>('.lang-menu-item')) {
    item.addEventListener('click', () => {
      close();
      const value = item.dataset.value;
      if (value === 'auto' || value === 'pt' || value === 'en' || value === 'es') {
        if (value !== getOverride()) setOverride(value);
      }
    });
  }
}

export function bindLangMenu(trigger: HTMLButtonElement, menu: HTMLElement): Popover {
  let popover: Popover;
  popover = createPopover(trigger, menu, () => renderLangMenu(menu, () => popover.close()));
  return popover;
}
