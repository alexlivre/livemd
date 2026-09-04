import type { ThemeName } from '@shared/constants';

export interface ShortcutDeps {
  openFiles: () => Promise<void>;
  closeActiveTab: () => Promise<void>;
  toggleTheme: () => ThemeName;
  closeMenus: () => void;
  onSearch: () => void;
  openGlobalSearch?: () => void;
  closeGlobalSearch?: () => boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  onHighlight?: () => void;
  openPalette?: () => void;
  toggleSidebar?: () => void;
  togglePin?: () => void;
}

export function bindShortcuts(deps: ShortcutDeps): void {
  window.addEventListener('keydown', (evt) => {
    const isCtrl = evt.ctrlKey || evt.metaKey;
    const key = evt.key.toLowerCase();
    if (isCtrl && evt.shiftKey && key === 'f') {
      evt.preventDefault();
      deps.openGlobalSearch?.();
      return;
    } else if (isCtrl && key === 'o') {
      evt.preventDefault();
      void deps.openFiles();
    } else if (isCtrl && key === 'w') {
      evt.preventDefault();
      void deps.closeActiveTab();
    } else if (isCtrl && evt.shiftKey && key === 't') {
      evt.preventDefault();
      deps.toggleTheme();
    } else if (isCtrl && key === 'f') {
      evt.preventDefault();
      deps.onSearch();
    } else if (isCtrl && (key === '=' || key === '+')) {
      evt.preventDefault();
      deps.zoomIn();
    } else if (isCtrl && key === '-') {
      evt.preventDefault();
      deps.zoomOut();
    } else if (isCtrl && key === '0') {
      evt.preventDefault();
      deps.zoomReset();
    } else if (isCtrl && key === 'h') {
      evt.preventDefault();
      deps.onHighlight?.();
    } else if (isCtrl && key === 'k') {
      evt.preventDefault();
      deps.openPalette?.();
    } else if (isCtrl && key === 'b') {
      evt.preventDefault();
      deps.toggleSidebar?.();
    } else if (isCtrl && key === 'p' && !evt.shiftKey) {
      // Pin/unpin active tab — override browser Print (ignored while typing)
      evt.preventDefault();
      const target = evt.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (!isEditable) {
        deps.togglePin?.();
      }
    } else if (evt.key === 'Escape') {
      if (deps.closeGlobalSearch?.()) return;
      deps.closeMenus();
    }
  });
}
