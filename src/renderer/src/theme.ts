import { DEFAULT_THEME, type ThemeName } from '@shared/constants';

export type { ThemeName };

const STORAGE_KEY = 'md-reader.theme';
const THEME_CYCLE: ThemeName[] = ['dark', 'soft'];

function readStoredTheme(): ThemeName | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'dark' || value === 'soft' || value === 'light') return value;
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
  try {
    const api = (window as unknown as { mdApi?: { setTheme?: (t: string) => Promise<void> } }).mdApi;
    if (api?.setTheme) void api.setTheme(theme).catch(() => {});
  } catch {
    /* ignore in tests/standalone */
  }
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
  // One-time migration: legacy 'light' predates the two-theme policy and is
  // unreachable from THEME_CYCLE; land those users on the default.
  if (readStoredTheme() === 'light') {
    setTheme(DEFAULT_THEME);
    return DEFAULT_THEME;
  }
  const theme = getEffectiveTheme();
  applyTheme(theme);
  return theme;
}