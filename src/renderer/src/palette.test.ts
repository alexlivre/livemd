// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { filterCommands, registerCommands, type PaletteCmd } from './palette';

const sample: PaletteCmd[] = [
  { id: 'open', label: 'Open file', shortcut: 'Ctrl+O', action: () => {} },
  { id: 'theme', label: 'Toggle theme', shortcut: 'Ctrl+Shift+T', action: () => {} },
  { id: 'search', label: 'Find in document', shortcut: 'Ctrl+F', action: () => {} },
  { id: 'global', label: 'Search in all tabs', shortcut: 'Ctrl+Shift+F', action: () => {} },
  { id: 'outline', label: 'Outline', action: () => {} },
  { id: 'exportPdf', label: 'Save as PDF', action: () => {} },
  { id: 'about', label: 'About LiveMD', action: () => {} },
  { id: 'zoomIn', label: 'Zoom in', shortcut: 'Ctrl+=', action: () => {} },
  { id: 'zoomOut', label: 'Zoom out', shortcut: 'Ctrl+-', action: () => {} },
  { id: 'pause', label: 'Pause auto-update', action: () => {} },
];

describe('filterCommands', () => {
  beforeEach(() => {
    registerCommands(sample);
  });

  it('returns all (max 20) when query empty', () => {
    const res = filterCommands('');
    expect(res.length).toBe(sample.length);
    expect(res[0].id).toBe('open');
  });

  it('trims and is case-insensitive substring', () => {
    const res = filterCommands('OPEN');
    expect(res.some((c) => c.id === 'open')).toBe(true);
    const res2 = filterCommands('  open  ');
    expect(res2.some((c) => c.id === 'open')).toBe(true);
  });

  it('substring match finds toggle theme with "theme"', () => {
    const res = filterCommands('theme');
    expect(res.map((c) => c.id)).toContain('theme');
  });

  it('fuzzy matches characters in order', () => {
    // "opf" should fuzzy-match "Open file" (o p ... f), not substring
    const res = filterCommands('opf');
    expect(res.some((c) => c.id === 'open')).toBe(true);
  });

  it('fuzzy is case-insensitive', () => {
    const res = filterCommands('TTE');
    expect(res.some((c) => c.id === 'theme')).toBe(true);
  });

  it('returns empty when no match', () => {
    const res = filterCommands('zzzzzzz');
    expect(res.length).toBe(0);
  });

  it('caps at 20 results', () => {
    const many: PaletteCmd[] = Array.from({ length: 30 }, (_, i) => ({
      id: `cmd-${i}`,
      label: `Command ${i}`,
      action: () => {},
    }));
    const res = filterCommands('', many);
    expect(res.length).toBe(20);
  });

  it('fuzzy order must be sequential', () => {
    // "fta" not in order for "Open file" (f before a? Actually "Open file": o p e n _ f i l e, 'a' not present)
    const res = filterCommands('fta', [{ id: 'x', label: 'Open file', action: () => {} }]);
    // f before t? "Open file" has no t after f? Contains t? No. So no match.
    // Let's test a clear non-match: "ofp" order wrong vs "opf" correct
    const correct = filterCommands('opf', [{ id: 'x', label: 'Open file', action: () => {} }]);
    const wrong = filterCommands('ofp', [{ id: 'x', label: 'Open file', action: () => {} }]);
    expect(correct.length).toBe(1);
    expect(wrong.length).toBe(0);
  });

  it('explicit list param overrides registry', () => {
    const custom: PaletteCmd[] = [{ id: 'custom', label: 'Custom Command', action: () => {} }];
    const res = filterCommands('custom', custom);
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('custom');
  });
});
