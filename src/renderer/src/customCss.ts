let styleEl: HTMLStyleElement | null = null;

function getApi(): { loadCustomCss: () => Promise<string>; saveCustomCss: (css: string) => Promise<void>; onCustomCssChanged?: (h: (css: string) => void) => () => void; onCustomCssChange?: (h: (css: string) => void) => () => void } | null {
  try {
    const api = (window as unknown as { mdApi?: unknown }).mdApi as never;
    return api as unknown as ReturnType<typeof getApi>;
  } catch {
    return null;
  }
}

export async function loadCustomCss(): Promise<string> {
  const api = getApi();
  if (!api?.loadCustomCss) return '';
  try {
    const css = await api.loadCustomCss();
    return typeof css === 'string' ? css : '';
  } catch {
    return '';
  }
}

export async function saveCustomCss(css: string): Promise<void> {
  const api = getApi();
  if (!api?.saveCustomCss) throw new Error('saveCustomCss not available');
  await api.saveCustomCss(css);
}

function enhanceSpecificity(css: string): string {
  // :root alone (0,1,0) is less specific than :root[data-theme="dark"] (0,1,1) used by built-in themes.
  // Promote plain :root blocks so custom themes reliably override.
  return css.replace(/:root(?=\s*\{)/g, ':root, :root[data-theme="dark"], :root[data-theme="soft"], :root[data-theme="light"]');
}

export function applyCustomCss(css: string): void {
  if (!css || !css.trim()) {
    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
    return;
  }
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'custom-css';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = enhanceSpecificity(css);
}

export async function initCustomCss(): Promise<void> {
  const css = await loadCustomCss();
  applyCustomCss(css);
  const api = getApi();
  if (!api) return;
  const handler = (next: string): void => applyCustomCss(next);
  if (api.onCustomCssChanged) api.onCustomCssChanged(handler);
  else if (api.onCustomCssChange) api.onCustomCssChange(handler);
}

export function getCustomCssPathHint(): string {
  return 'userData/custom.css';
}
