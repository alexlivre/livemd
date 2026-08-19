import { describe, it, expect } from 'vitest';
import { buildStandaloneHtml } from './export';

describe('buildStandaloneHtml', () => {
  it('inlines css and wraps markdown-body', () => {
    const html = buildStandaloneHtml('<h1>Hello</h1>', 'dark', 'body{color:red}');
    expect(html).toContain('<style>body{color:red}</style>');
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('<div class="markdown-body"><h1>Hello</h1></div>');
  });
});
