// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildStandaloneHtml, fetchCssText } from './export';

describe('buildStandaloneHtml', () => {
  it('inlines css and wraps markdown-body', () => {
    const html = buildStandaloneHtml('<h1>Hello</h1>', 'dark', 'body{color:red}');
    expect(html).toContain('<style>body{color:red}</style>');
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('<div class="markdown-body"><h1>Hello</h1></div>');
  });

  it('normalizes themes to valid values', () => {
    expect(buildStandaloneHtml('<p>a</p>', 'soft', '')).toContain('data-theme="soft"');
    expect(buildStandaloneHtml('<p>a</p>', 'light', '')).toContain('data-theme="light"');
    expect(buildStandaloneHtml('<p>a</p>', 'invalid', '')).toContain('data-theme="soft"');
  });

  it('includes viewport and overrides for full document scrolling and print pagination', () => {
    const html = buildStandaloneHtml('<p>Test</p>', 'dark', '');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
    expect(html).toContain('overflow: visible !important');
    expect(html).toContain('height: auto !important');
    expect(html).toContain('user-select: text !important');
    expect(html).toContain('@media print');
    expect(html).toContain('break-inside: avoid');
    expect(html).toContain('break-after: avoid');
    expect(html).toContain('.markdown-body .code-copy');
  });
});

describe('fetchCssText', () => {
  let customStyle: HTMLStyleElement | null = null;

  afterEach(() => {
    if (customStyle) {
      customStyle.remove();
      customStyle = null;
    }
  });

  it('includes custom-css style element content if present', async () => {
    customStyle = document.createElement('style');
    customStyle.id = 'custom-css';
    customStyle.textContent = ':root { --custom-color: #123456; }';
    document.head.appendChild(customStyle);

    const css = await fetchCssText();
    expect(css).toContain('--custom-color: #123456;');
  });
});
