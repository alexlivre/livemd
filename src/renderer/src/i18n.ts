import {
  mapOsLocale,
  OS_LANG_LABELS,
  t as sharedT,
  type AppLanguage,
  type LangSetting,
  type MsgKey,
  type MsgParams
} from '@shared/i18n';

const STORAGE_KEY = 'md-reader.lang';

let osLang: AppLanguage = 'en';
let override: LangSetting = 'auto';
let effective: AppLanguage = 'en';
let syncLang: ((lang: AppLanguage) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

function readStoredOverride(): LangSetting {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'auto' || value === 'pt' || value === 'en' || value === 'es') return value;
  } catch {
    /* localStorage may be disabled */
  }
  return 'auto';
}

function writeStoredOverride(value: LangSetting): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function getEffectiveLang(): AppLanguage {
  return effective;
}

export function getOverride(): LangSetting {
  return override;
}

export function getOsLangLabel(): string {
  return OS_LANG_LABELS[effective][osLang];
}

export function t(key: MsgKey, params?: MsgParams): string {
  return sharedT(effective, key, params);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

export async function initI18n(opts: {
  getOsLocale: () => Promise<string>;
  setLanguage: (lang: AppLanguage) => Promise<void>;
}): Promise<void> {
  syncLang = opts.setLanguage;
  override = readStoredOverride();
  osLang = mapOsLocale(await opts.getOsLocale());
  effective = override === 'auto' ? osLang : override;
  await syncLang(effective);
  notify();
}

export function setOverride(value: LangSetting): void {
  if (value === override) return;
  override = value;
  writeStoredOverride(value);
  effective = value === 'auto' ? osLang : value;
  if (syncLang) void syncLang(effective);
  notify();
}
