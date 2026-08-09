import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
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
marked.use({
  renderer: {
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
          return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
        } catch {
          /* fall through */
        }
      }

      const auto = hljs.highlightAuto(safe).value;
      const cls = auto.includes('class="hljs') ? '' : ' class="hljs"';
      return `<pre><code${cls}>${auto}</code></pre>`;
    }
  }
});

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel']
  });
}

export async function renderMarkdown(source: string): Promise<string> {
  const rawHtml = await marked.parse(source);
  return sanitize(rawHtml);
}
