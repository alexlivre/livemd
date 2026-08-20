// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMermaid, renderMath } from './mermaidMath';

describe('renderMermaid fallback when import fails', () => {
  it('leaves code block intact when mermaid not installed', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<div class="code-block"><pre><code class="hljs language-mermaid">graph TD; A-->B</code></pre></div>';
    document.body.appendChild(container);
    let threw = false;
    try {
      await renderMermaid(container);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    // should still contain the mermaid code block (fallback)
    const code = container.querySelector('pre code.language-mermaid');
    expect(code).not.toBeNull();
    expect(code?.textContent).toContain('graph TD');
    document.body.removeChild(container);
  });

  it('does not throw on empty container', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>hello world</p>';
    await expect(renderMermaid(container)).resolves.toBeUndefined();
    expect(container.innerHTML).toContain('hello world');
  });

  it('does not throw when code block has no text', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<pre><code class="hljs language-mermaid"></code></pre>';
    await expect(renderMermaid(container)).resolves.toBeUndefined();
    expect(container.querySelector('pre code.language-mermaid')).not.toBeNull();
  });

  it('ignores non-mermaid code blocks', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<pre><code class="hljs language-js">const x = 1</code></pre>';
    await renderMermaid(container);
    expect(container.querySelector('code.language-js')).not.toBeNull();
    expect(container.querySelector('.mermaid')).toBeNull();
  });
});

describe('renderMath fallback when import fails', () => {
  it('is no-op when katex not installed and leaves dollars', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>Einstein: $E=mc^2$ and display $$a^2+b^2=c^2$$ end</p>';
    const before = container.innerHTML;
    let threw = false;
    try {
      await renderMath(container);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    // without katex, content should remain containing dollars (no crash, at worst unchanged)
    expect(container.textContent).toContain('$');
    // If no katex, innerHTML should be unchanged (still contains $)
    // We accept either unchanged or still containing original tex
    expect(container.innerHTML).toBe(before);
  });

  it('does not throw on container without dollars', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>no math here</p>';
    await expect(renderMath(container)).resolves.toBeUndefined();
    expect(container.textContent).toBe('no math here');
  });

  it('does not throw on empty container', async () => {
    const container = document.createElement('div');
    await expect(renderMath(container)).resolves.toBeUndefined();
  });

  it('skips math inside code/pre', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<pre><code>$x^2$</code></pre><p>outside $y$</p>';
    const beforePre = container.querySelector('pre')?.innerHTML ?? '';
    await renderMath(container);
    // pre content should remain untouched (fallback leaves intact anyway)
    expect(container.querySelector('pre')?.innerHTML).toBe(beforePre);
  });
});
