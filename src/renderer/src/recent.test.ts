// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getRecentFiles, recordRecentFile, removeRecentFile, clearRecentFiles } from './recent';

describe('recent files', () => {
  beforeEach(() => localStorage.clear());

  it('records most recent first and dedupes', () => {
    recordRecentFile('/a.md');
    recordRecentFile('/b.md');
    recordRecentFile('/a.md');
    expect(getRecentFiles()).toEqual(['/a.md', '/b.md']);
  });

  it('caps at 10 entries', () => {
    for (let i = 0; i < 12; i++) recordRecentFile(`/f${i}.md`);
    expect(getRecentFiles()).toHaveLength(10);
    expect(getRecentFiles()[0]).toBe('/f11.md');
  });

  it('removes a single file', () => {
    recordRecentFile('/a.md');
    recordRecentFile('/b.md');
    removeRecentFile('/a.md');
    expect(getRecentFiles()).toEqual(['/b.md']);
  });

  it('clears all', () => {
    recordRecentFile('/a.md');
    clearRecentFiles();
    expect(getRecentFiles()).toEqual([]);
  });
});
