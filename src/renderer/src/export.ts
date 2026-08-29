export function buildStandaloneHtml(contentHtml: string, theme: string, cssText: string): string {
  const safeTheme = theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'soft';
  const css = cssText ? `<style>${cssText}</style>` : '';
  const standaloneOverrides = `<style>
  html, body {
    height: auto !important;
    min-height: 100%;
    overflow: visible !important;
    overflow-y: auto !important;
    user-select: text !important;
    background-color: var(--bg-content, var(--bg-app, #ffffff));
  }
  .markdown-body {
    max-width: min(1150px, 94%);
    margin: 0 auto;
    padding: 32px 48px 64px;
  }
  .markdown-body .code-copy {
    display: none !important;
  }
  @media print {
    body {
      background-color: transparent !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .markdown-body {
      max-width: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    h1, h2, h3, h4, h5, h6 {
      break-after: avoid;
      page-break-after: avoid;
    }
    pre, blockquote, table, img, figure, tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
</style>`;

  // Standalone HTML for export/PDF: keep data-theme so tokens apply, wrap markdown-body with same padding as app
  return `<!doctype html><html data-theme="${safeTheme}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${css}${standaloneOverrides}</head><body><div class="markdown-body">${contentHtml}</div></body></html>`;
}

export async function fetchCssText(): Promise<string> {
  let mainCss = '';
  const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
  if (link) {
    try {
      const res = await fetch(link.href);
      if (res.ok) mainCss = await res.text();
    } catch {
      /* fall through */
    }
  }
  // Fallback for packaged file:// builds where fetch may fail: collect from styleSheets
  if (!mainCss) {
    try {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = (sheet as CSSStyleSheet).cssRules;
          if (rules) {
            for (const r of Array.from(rules)) mainCss += r.cssText + '\n';
          }
        } catch {
          /* cross-origin */
        }
      }
    } catch {
      /* ignore */
    }
  }
  const customStyle = document.getElementById('custom-css') as HTMLStyleElement | null;
  if (customStyle?.textContent) {
    mainCss += '\n' + customStyle.textContent;
  }
  return mainCss;
}
