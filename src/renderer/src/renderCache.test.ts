// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { RenderCache, evictEntries, ENTRY_CAP_BYTES } from './renderCache';

describe('RenderCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns cached html for identical content', () => {
    const c = new RenderCache();
    c.set('/a.md', '# hi', '<h1>hi</h1>');
    expect(c.get('/a.md', '# hi')).toBe('<h1>hi</h1>');
  });

  it('misses when content changed', () => {
    const c = new RenderCache();
    c.set('/a.md', '# hi', '<h1>hi</h1>');
    expect(c.get('/a.md', '# bye')).toBeNull();
  });

  it('deletes an entry', () => {
    const c = new RenderCache();
    c.set('/a.md', '# hi', '<h1>hi</h1>');
    c.delete('/a.md');
    expect(c.get('/a.md', '# hi')).toBeNull();
  });
});

describe('RenderCache persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('survives a restart after flush', () => {
    const first = new RenderCache();
    first.set('/a.md', '# hi', '<h1>hi</h1>');
    first.flush();

    const second = new RenderCache();
    expect(second.get('/a.md', '# hi')).toBe('<h1>hi</h1>');
  });

  it('invalidates a persisted entry when content changed', () => {
    const first = new RenderCache();
    first.set('/a.md', '# hi', '<h1>hi</h1>');
    first.flush();

    const second = new RenderCache();
    expect(second.get('/a.md', '# bye')).toBeNull();
  });

  it('drops a persisted entry on delete', () => {
    const first = new RenderCache();
    first.set('/a.md', '# hi', '<h1>hi</h1>');
    first.flush();
    first.delete('/a.md');
    first.flush();

    const second = new RenderCache();
    expect(second.get('/a.md', '# hi')).toBeNull();
  });

  it('does not persist html over the entry cap', () => {
    const big = 'x'.repeat(ENTRY_CAP_BYTES + 10);
    const first = new RenderCache();
    first.set('/big.md', '# hi', big);
    first.flush();

    const second = new RenderCache();
    expect(second.get('/big.md', '# hi')).toBeNull();
    expect(first.get('/big.md', '# hi')).toBe(big);
  });

  it('evicts least-recently-written entries over the total cap', () => {
    const html = 'y'.repeat(300 * 1024);
    const entries = Array.from({ length: 20 }, (_, i) => ({
      filePath: `/f${i}.md`,
      hash: i,
      length: 3,
      html,
      at: i
    }));
    const kept = evictEntries(entries, 4.5 * 1024 * 1024);
    const keptPaths = kept.map((e) => e.filePath);
    expect(keptPaths).not.toContain('/f0.md');
    expect(keptPaths).toContain('/f19.md');
    expect(kept.reduce((sum, e) => sum + e.html.length, 0)).toBeLessThanOrEqual(4.5 * 1024 * 1024);
  });
});
