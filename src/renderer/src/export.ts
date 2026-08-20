export function buildStandaloneHtml(contentHtml: string, theme: string, cssText: string): string {
  const safeTheme = theme === 'dark' ? 'dark' : 'soft';
  const css = cssText ? `<style>${cssText}</style>` : '';
  return `<!doctype html><html data-theme="${safeTheme}"><head><meta charset="UTF-8">${css}</head><body><div class="markdown-body">${contentHtml}</div></body></html>`;
}

export async function fetchCssText(): Promise<string> {
  const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
  if (link) {
    try { const res = await fetch(link.href); if (res.ok) return await res.text(); } catch { /* fall through */ }
  }
  // Fallback for packaged file:// builds where fetch may fail: collect from styleSheets
  try {
    let css = '';
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = (sheet as CSSStyleSheet).cssRules;
        if (rules) for (const r of Array.from(rules)) css += r.cssText + '\n';
      } catch { /* cross-origin */ }
    }
    if (css) return css;
  } catch { /* ignore */ }
  return '';
}
