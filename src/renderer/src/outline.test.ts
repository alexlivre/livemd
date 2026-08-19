// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildOutline } from './outline';

describe('buildOutline', () => {
  it('extracts h1-h3 with id and text', () => {
    const div = document.createElement('div');
    div.innerHTML = '<h1 id="a">Alpha</h1><h2 id="b">Beta</h2><p>x</p><h3 id="c">Gamma</h3>';
    const items = buildOutline(div);
    expect(items).toEqual([
      { id:'a', level:1, text:'Alpha' },
      { id:'b', level:2, text:'Beta' },
      { id:'c', level:3, text:'Gamma' },
    ]);
  });
  it('ignores h4+ and elements without id', () => {
    const div = document.createElement('div');
    div.innerHTML = '<h4 id="x">X</h4><h2>NoId</h2><h2 id="y">Y</h2>';
    expect(buildOutline(div)).toEqual([{id:'y', level:2, text:'Y'}]);
  });
  it('handles data-slug fallback', () => {
    const div = document.createElement('div');
    div.innerHTML = '<h2 data-slug="slug-1">Slug Title</h2>';
    const items = buildOutline(div);
    expect(items[0].id).toBe('slug-1');
  });
});
