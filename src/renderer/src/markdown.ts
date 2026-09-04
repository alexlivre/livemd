import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { t as i18nT } from './i18n';
import { escapeAttr } from './util';

marked.setOptions({
  gfm: true,
  breaks: false
});

export const AUTO_DETECT_CHAR_LIMIT = 8 * 1024;

const usedHeadingIds = new Set<string>();

// GitHub-style slug: lowercase, drop punctuation, collapse spaces to dashes.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueHeadingId(slug: string): string {
  const base = slug || 'section';
  let id = base;
  let n = 1;
  while (usedHeadingIds.has(id)) {
    id = `${base}-${n}`;
    n++;
  }
  usedHeadingIds.add(id);
  return id;
}

// Reconstruct the raw inline text of a heading without markup or HTML
// entities (nested tokens first so links/emphasis contribute their text).
function inlineText(tokens: unknown[]): string {
  let out = '';
  for (const t of tokens as Array<{ type: string; raw?: string; tokens?: unknown[] }>) {
    if (t.tokens) out += inlineText(t.tokens);
    else if (typeof t.raw === 'string') out += t.raw;
  }
  return out;
}

marked.use({
  renderer: {
    heading(this: unknown, arg: unknown, level?: unknown) {
      let depth = 0;
      let html = '';
      let plain = '';

      // marked v14 passes a single token object OR legacy args
      if (typeof arg === 'object' && arg !== null) {
        const token = arg as { depth?: number; tokens?: unknown[] };
        depth = token.depth ?? 0;
        const parser = (this as { parser?: { parseInline: (t: unknown[]) => string } }).parser;
        html = parser?.parseInline(token.tokens ?? []) ?? '';
        plain = inlineText(token.tokens ?? []);
      } else {
        depth = Number(level ?? 0);
        html = String(arg ?? '');
        plain = String(arg ?? '');
      }

      const id = uniqueHeadingId(slugify(plain));
      // data-slug survives DOMPurify (which strips ids colliding with
      // document built-ins like document.links, e.g. the slug "links").
      return `<h${depth} id="${id}" data-slug="${id}">${html}</h${depth}>`;
    },
    code(this: unknown, codeOrArg: unknown, infostring?: string, escaped?: unknown) {
      let code = '';
      let lang = '';
      let isEscaped = false;

      // marked v14 passes a single token object OR legacy args
      if (typeof codeOrArg === 'object' && codeOrArg !== null) {
        const token = codeOrArg as { text: string; lang?: string; escaped?: boolean };
        code = token.text;
        lang = (token.lang ?? '').trim().split(/\s+/)[0];
        isEscaped = !!token.escaped;
      } else {
        code = String(codeOrArg ?? '');
        lang = (infostring ?? '').trim().split(/\s+/)[0];
        isEscaped = !!escaped;
      }

      const safe = isEscaped ? code : code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Syntax highlighting is deferred to a second pass (highlight.ts):
      // the code is escaped here so the first paint never waits on hljs.
      // data-hljs marks blocks for highlighting; unlabelled blocks larger
      // than AUTO_DETECT_CHAR_LIMIT skip auto-detection entirely.
      const langAttr = lang ? ` class="hljs language-${escapeAttr(lang)}"` : ' class="hljs"';
      const hljsAttr = lang
        ? ` data-hljs="${escapeAttr(lang)}"`
        : code.length <= AUTO_DETECT_CHAR_LIMIT
          ? ' data-hljs="auto"'
          : '';
      return `<div class="code-block"><button class="code-copy" type="button" aria-label="${i18nT('copyAria')}">${i18nT('copy')}</button><pre><code${langAttr}${hljsAttr}>${safe}</code></pre></div>`;
    }
  }
});

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['input'],
    ADD_ATTR: ['target', 'rel', 'data-hljs', 'type', 'checked', 'disabled']
  });
}

// Remote images are allowed (CSP img-src https:), but never leak the
// reading context: strip the Referer header on their requests.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'IMG' && /^https?:/i.test(node.getAttribute('src') ?? '')) {
    node.setAttribute('referrerpolicy', 'no-referrer');
  }
});

export async function renderMarkdown(source: string): Promise<string> {
  usedHeadingIds.clear();
  const rawHtml = await marked.parse(source);
  return sanitize(rawHtml);
}
