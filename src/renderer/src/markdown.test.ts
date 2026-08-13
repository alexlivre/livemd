// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown sanitization', () => {
  it('strips script tags', async () => {
    const html = await renderMarkdown('<script>alert(1)</script>\n\nhello');
    expect(html).not.toContain('<script');
    expect(html).toContain('hello');
  });

  it('strips javascript: URLs', async () => {
    const html = await renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('renders headings', async () => {
    const html = await renderMarkdown('# Title');
    expect(html).toContain('Title');
    expect(html).toMatch(/<h1/);
  });
});
