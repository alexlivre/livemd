import { describe, it, expect } from 'vitest';
import { searchInContent, searchAll } from './globalSearch';

describe('searchInContent', () => {
  it('finds case-insensitive matches with preview', () => {
    const content = 'Hello LiveMD\nsecond line\nLiveMD again';
    const res = searchInContent(content, 'livemd');
    expect(res).toHaveLength(2);
    expect(res[0].line).toBe(1);
    expect(res[1].line).toBe(3);
  });
  it('limits and escapes', () => {
    expect(searchInContent('a\n'.repeat(100), 'a').length).toBeLessThanOrEqual(50);
  });
});
describe('searchAll', () => {
  it('groups by file', () => {
    const groups = searchAll('hello', [{filePath:'/a.md', fileName:'a.md', content:'hello world'} as any], new Map());
    expect(groups[0].fileName).toBe('a.md');
  });
});
