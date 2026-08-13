import { describe, it, expect } from 'vitest';
import { MARKDOWN_EXTENSIONS, MARKDOWN_EXT_RE, THEME_BG_COLORS, DEFAULT_THEME } from './constants';
import packageJson from '../../package.json';

describe('constants', () => {
  it('markdown extensions match package.json fileAssociations', () => {
    const assoc = packageJson.build.fileAssociations[0].ext;
    expect([...MARKDOWN_EXTENSIONS].sort()).toEqual([...assoc].sort());
  });

  it('regex matches every supported extension and rejects others', () => {
    for (const ext of MARKDOWN_EXTENSIONS) {
      expect(MARKDOWN_EXT_RE.test(`file.${ext}`)).toBe(true);
    }
    expect(MARKDOWN_EXT_RE.test('file.txt')).toBe(false);
    expect(MARKDOWN_EXT_RE.test('file.MD')).toBe(true);
  });

  it('defines background colors for both themes', () => {
    expect(DEFAULT_THEME).toBe('soft');
    expect(THEME_BG_COLORS.dark).toBe('#1a1d23');
    expect(THEME_BG_COLORS.soft).toBe('#f5f5f5');
  });
});
