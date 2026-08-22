import { describe, it, expect } from 'vitest';
import { escapeAttr, escapeHtml } from './util';

describe('escapeAttr', () => {
  it('escapes double quotes, single quotes and angle brackets', () => {
    expect(escapeAttr('a"b')).toBe('a&quot;b');
    expect(escapeAttr("a'b")).toBe('a&#39;b');
    expect(escapeAttr('a<>&c')).toBe('a&lt;&gt;&amp;c');
  });

  it('leaves safe text untouched', () => {
    expect(escapeAttr('plain text 123')).toBe('plain text 123');
  });
});

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml('<img src=x>')).toBe('&lt;img src=x&gt;');
  });
});
