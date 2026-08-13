import { describe, it, expect } from 'vitest';
import { RenderCache } from './renderCache';

describe('RenderCache', () => {
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
