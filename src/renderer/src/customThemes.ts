import type { CustomTheme } from '@shared/api';
import { applyCustomCss } from './customCss';

const STORAGE_ACTIVE = 'md-reader.customTheme';

function getApi(): Pick<import('@shared/api').MdApi, 'listCustomThemes' | 'saveCustomTheme' | 'deleteCustomTheme' | 'renameCustomTheme'> | null {
  try {
    const api = (window as unknown as { mdApi?: unknown }).mdApi as never;
    return api as unknown as ReturnType<typeof getApi>;
  } catch {
    return null;
  }
}

export async function listCustomThemes(): Promise<CustomTheme[]> {
  const api = getApi();
  if (!api?.listCustomThemes) return [];
  try {
    const list = await api.listCustomThemes();
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveCustomTheme(payload: { id?: string; name: string; css: string }): Promise<CustomTheme> {
  const api = getApi();
  if (!api?.saveCustomTheme) throw new Error('saveCustomTheme not available');
  return await api.saveCustomTheme(payload);
}

export async function deleteCustomTheme(id: string): Promise<void> {
  const api = getApi();
  if (!api?.deleteCustomTheme) throw new Error('deleteCustomTheme not available');
  await api.deleteCustomTheme(id);
  // if deleted was active, clear active
  if (getActiveCustomId() === id) setActiveCustomId(null);
}

export async function renameCustomTheme(id: string, newName: string): Promise<CustomTheme> {
  const api = getApi();
  if (!api?.renameCustomTheme) throw new Error('renameCustomTheme not available');
  return await api.renameCustomTheme(id, newName);
}

export function getActiveCustomId(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_ACTIVE);
    return v ? v : null;
  } catch {
    return null;
  }
}

export function setActiveCustomId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_ACTIVE, id);
    else localStorage.removeItem(STORAGE_ACTIVE);
  } catch { /* ignore */ }
}

export async function applyCustomThemeById(id: string | null): Promise<void> {
  if (!id) {
    applyCustomCss('');
    setActiveCustomId(null);
    return;
  }
  const themes = await listCustomThemes();
  const theme = themes.find((t) => t.id === id);
  if (!theme) {
    applyCustomCss('');
    setActiveCustomId(null);
    return;
  }
  applyCustomCss(theme.css);
  setActiveCustomId(id);
}

export async function initCustomThemes(): Promise<void> {
  const activeId = getActiveCustomId();
  if (activeId) await applyCustomThemeById(activeId);
}
