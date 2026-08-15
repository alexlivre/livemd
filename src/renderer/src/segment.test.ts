import { describe, it, expect } from 'vitest';
import { splitMarkdown, SEGMENT_BYTES } from './segment';

describe('splitMarkdown', () => {
  it('returns a single segment for small input', () => {
    const segments = splitMarkdown('# Title\n\nhello');
    expect(segments).toEqual(['# Title\n\nhello']);
  });

  it('never cuts through a fenced code block', () => {
    const fence = '```javascript\n' + 'const x = 1;\n'.repeat(5000) + '```';
    const source = `# A\n\n${fence}\n\n# B`;
    const segments = splitMarkdown(source, 1024);
    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      const openFences = (segment.match(/```/g) ?? []).length;
      expect(openFences % 2).toBe(0);
    }
    expect(segments.join('')).toBe(source);
  });

  it('keeps a single oversized fence together', () => {
    const fence = '```\n' + 'x\n'.repeat(50_000) + '```';
    const segments = splitMarkdown(fence, 1024);
    expect(segments).toEqual([fence]);
  });

  it('preserves the whole source when concatenated', () => {
    const paragraph = '# H\n\nSome text with **bold** and `inline`.\n\n- a\n- b\n\n';
    const source = paragraph.repeat(2000);
    const segments = splitMarkdown(source, SEGMENT_BYTES);
    expect(segments.join('')).toBe(source);
  });

  it('respects tilde fences', () => {
    const source = '~~~\n' + 'y\n'.repeat(10_000) + '~~~\n\n# after';
    const segments = splitMarkdown(source, 1024);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.join('')).toBe(source);
  });

  it('handles mixed fences with different markers', () => {
    const source = '```\ninner\n```\n\n~~~\ntilde\n~~~\n\n# end';
    const segments = splitMarkdown(source, 512);
    for (const segment of segments) {
      const opens = (segment.match(/```/g) ?? []).length;
      expect(opens % 2).toBe(0);
    }
  });
});
