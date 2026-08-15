import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import { t as i18nT } from './i18n';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('sql', sql);

marked.setOptions({
  gfm: true,
  breaks: false
});

const originalCode = marked.getDefaults().renderer?.code;

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

      if (lang && hljs.getLanguage(lang)) {
        try {
          const highlighted = hljs.highlight(safe, { language: lang, ignoreIllegals: true }).value;
          return `<div class="code-block"><button class="code-copy" type="button" aria-label="${i18nT('copyAria')}">${i18nT('copy')}</button><pre><code class="hljs language-${lang}">${highlighted}</code></pre></div>`;
        } catch {
          /* fall through */
        }
      }

      const auto = hljs.highlightAuto(safe).value;
      const cls = auto.includes('class="hljs') ? '' : ' class="hljs"';
      return `<div class="code-block"><button class="code-copy" type="button" aria-label="${i18nT('copyAria')}">${i18nT('copy')}</button><pre><code${cls}>${auto}</code></pre></div>`;
    }
  }
});

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel']
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
