// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { highlightBlock, highlightCodeBlocksInIdle } from './highlight';

function codeBlock(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.querySelector('code') as HTMLElement;
}

beforeEach(() => {
  // vitest mocks requestIdleCallback as a never-firing stub; the scheduler
  // falls back to setTimeout when it is unavailable.
  vi.stubGlobal('requestIdleCallback', undefined);
  vi.stubGlobal('cancelIdleCallback', undefined);
});

describe('highlightBlock', () => {
  it('highlights a language-tagged block and clears data-hljs', () => {
    const code = codeBlock('<pre><code class="hljs" data-hljs="javascript">const x = 1;</code></pre>');
    highlightBlock(code);
    expect(code.dataset.hljs).toBeUndefined();
    expect(code.innerHTML).toContain('hljs-keyword');
  });

  it('auto-detects unlabelled blocks', () => {
    const code = codeBlock('<pre><code class="hljs" data-hljs="auto">const x = 1;</code></pre>');
    highlightBlock(code);
    expect(code.innerHTML).toContain('hljs-keyword');
    expect(code.classList.contains('hljs')).toBe(true);
  });

  it('skips oversized auto-detect blocks', () => {
    const code = codeBlock(`<pre><code class="hljs" data-hljs="auto">${'x'.repeat(9000)}</code></pre>`);
    highlightBlock(code);
    expect(code.innerHTML).toBe('x'.repeat(9000));
    expect(code.dataset.hljs).toBeUndefined();
  });

  it('leaves unknown languages untouched', () => {
    const code = codeBlock('<pre><code class="hljs" data-hljs="klingon">hello</code></pre>');
    highlightBlock(code);
    expect(code.innerHTML).toBe('hello');
  });

  it('re-escapes code when highlighting', () => {
    const code = codeBlock('<pre><code class="hljs" data-hljs="javascript">a &lt; b</code></pre>');
    highlightBlock(code);
    expect(code.innerHTML).toContain('&lt;');
  });
});

describe('highlightCodeBlocksInIdle', () => {
  it('highlights every marked block in the container', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML =
      '<pre><code class="hljs" data-hljs="javascript">const a = 1;</code></pre>' +
      '<pre><code class="hljs" data-hljs="json">{"b": 2}</code></pre>';
    highlightCodeBlocksInIdle(container);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(container.querySelectorAll('code').length).toBe(2);
    for (const code of container.querySelectorAll('code')) {
      expect(code.dataset.hljs).toBeUndefined();
      expect(code.innerHTML).toContain('hljs-');
    }
    document.body.removeChild(container);
  });

  it('does nothing when there are no marked blocks', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<pre><code>plain</code></pre>';
    highlightCodeBlocksInIdle(container);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.innerHTML).toBe('<pre><code>plain</code></pre>');
  });
});
