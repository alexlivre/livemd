// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
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

describe('renderMarkdown heading anchors', () => {
  it('adds GitHub-style ids to headings', async () => {
    const html = await renderMarkdown('## Why this exists');
    expect(html).toMatch(/<h2 id="why-this-exists"/);
  });

  it('strips punctuation and collapses spaces in slugs', async () => {
    const html = await renderMarkdown('## How "Open with" works');
    expect(html).toMatch(/<h2 id="how-open-with-works"/);
  });

  it('dedupes repeated headings with numeric suffixes', async () => {
    const html = await renderMarkdown('# Features\n\n# Features');
    expect(html).toMatch(/<h1 id="features"/);
    expect(html).toMatch(/<h1 id="features-1"/);
  });

  it('keeps inline formatting in heading text', async () => {
    const html = await renderMarkdown('## Install `npm`');
    expect(html).toMatch(/<h2 id="install-npm"/);
  });

  it('resolves every table-of-contents anchor of the repo README', async () => {
    const source = readFileSync('README.md', 'utf8');
    const html = await renderMarkdown(source);
    const tocAnchors = [...source.matchAll(/\(#([a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(tocAnchors.length).toBeGreaterThan(10);
    for (const anchor of tocAnchors) {
      expect(html).toContain(`data-slug="${anchor}"`);
    }
  });
});

describe('renderMarkdown remote images', () => {
  it('adds referrerpolicy="no-referrer" to remote images', async () => {
    const html = await renderMarkdown('![badge](https://img.shields.io/badge/a)');
    expect(html).toContain('referrerpolicy="no-referrer"');
  });

  it('does not touch local images', async () => {
    const html = await renderMarkdown('![local](./img.png)');
    expect(html).not.toContain('referrerpolicy');
  });

  it('applies no-referrer to every remote image in the repo README', async () => {
    const source = readFileSync('README.md', 'utf8');
    const html = await renderMarkdown(source);
    const remoteImgs = [...html.matchAll(/<img[^>]*src="https:[^>]*>/g)];
    expect(remoteImgs.length).toBeGreaterThanOrEqual(5);
    for (const m of remoteImgs) {
      expect(m[0]).toContain('referrerpolicy="no-referrer"');
    }
  });
});
