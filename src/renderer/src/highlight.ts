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
import powershell from 'highlight.js/lib/languages/powershell';
import dos from 'highlight.js/lib/languages/dos';
import csharp from 'highlight.js/lib/languages/csharp';
import cpp from 'highlight.js/lib/languages/cpp';
import ini from 'highlight.js/lib/languages/ini';
import { AUTO_DETECT_CHAR_LIMIT } from './markdown';

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
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('ps', powershell);
hljs.registerLanguage('ps1', powershell);
hljs.registerLanguage('dos', dos);
hljs.registerLanguage('bat', dos);
hljs.registerLanguage('cmd', dos);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', cpp);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('toml', ini);

export function highlightBlock(code: HTMLElement): void {
  const mode = code.dataset.hljs ?? '';
  delete code.dataset.hljs;

  const text = code.textContent ?? '';
  if (mode === 'auto') {
    if (text.length > AUTO_DETECT_CHAR_LIMIT) return;
    code.innerHTML = hljs.highlightAuto(text).value;
    code.classList.add('hljs');
    return;
  }
  if (!hljs.getLanguage(mode)) return;
  try {
    code.innerHTML = hljs.highlight(text, { language: mode, ignoreIllegals: true }).value;
  } catch {
    /* leave the block unhighlighted */
  }
}

const IDLE_SLICE_MS = 8;
const IDLE_FALLBACK_MS = 16;

export function highlightCodeBlocksInIdle(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('[data-hljs]');
  if (blocks.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let index = 0;
    let done = false;
    const finish = (): void => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    const runSlice = (deadline?: { timeRemaining: () => number }): void => {
      const sliceEnd =
        performance.now() + Math.max(deadline?.timeRemaining() ?? IDLE_SLICE_MS, IDLE_SLICE_MS);
      let processed = 0;
      while (index < blocks.length && (performance.now() < sliceEnd || processed === 0)) {
        const block = blocks[index] as HTMLElement;
        index++;
        processed++;
        if (!block.isConnected) continue;
        highlightBlock(block);
      }
      if (index < blocks.length) {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(runSlice, { timeout: 500 });
        } else {
          setTimeout(() => runSlice(), IDLE_FALLBACK_MS);
        }
      } else {
        finish();
      }
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(runSlice, { timeout: 200 });
    } else {
      setTimeout(() => runSlice(), IDLE_FALLBACK_MS);
    }
  });
}
