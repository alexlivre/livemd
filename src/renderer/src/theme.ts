export type ThemeName = 'dark' | 'soft';

const STORAGE_KEY = 'md-reader.theme';
const DEFAULT_THEME: ThemeName = 'soft';
const THEME_CYCLE: ThemeName[] = ['dark', 'soft'];

function readStoredTheme(): ThemeName | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'dark' || value === 'soft') return value;
    if (value === 'light') return 'soft';
  } catch {
    /* localStorage may be disabled */
  }
  return null;
}

function writeStoredTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function getStoredTheme(): ThemeName | null {
  return readStoredTheme();
}

export function getEffectiveTheme(): ThemeName {
  // Soft is the default. The OS preference is ignored unless the user
  // explicitly opts into dark mode.
  return readStoredTheme() ?? DEFAULT_THEME;
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function setTheme(theme: ThemeName): void {
  writeStoredTheme(theme);
  applyTheme(theme);
}

export function toggleTheme(): ThemeName {
  const current = getEffectiveTheme();
  const nextIndex = (THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length;
  const next: ThemeName = THEME_CYCLE[nextIndex];
  setTheme(next);
  return next;
}

/**
 * No-op kept for backwards compatibility. The OS theme is intentionally ignored.
 */
export function watchSystemTheme(_onChange: (theme: ThemeName) => void): () => void {
  return () => undefined;
}

export function initTheme(): ThemeName {
  const theme = getEffectiveTheme();
  applyTheme(theme);
  return theme;
}