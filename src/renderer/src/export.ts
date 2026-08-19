export function buildStandaloneHtml(contentHtml: string, theme: string, cssText: string): string {
  const css = cssText ? `<style>${cssText}</style>` : '';
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="UTF-8">${css}</head><body><div class="markdown-body">${contentHtml}</div></body></html>`;
}

export async function fetchCssText(): Promise<string> {
  const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
  if (!link) return '';
  try { const res = await fetch(link.href); return await res.text(); } catch { return ''; }
}
