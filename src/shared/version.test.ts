import { describe, it, expect } from 'vitest';
import { parseVersion, versionsDiffer } from './version';

describe('version utils', () => {
  it('parses semver with v prefix', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
  });

  it('pads missing segments with 0', () => {
    expect(parseVersion('1.2')).toEqual([1, 2, 0]);
    expect(parseVersion('1')).toEqual([1, 0, 0]);
  });

  it('treats non-numeric segments as 0', () => {
    expect(parseVersion('1.x.3')).toEqual([1, 0, 3]);
  });

  it('detects differences across any segment', () => {
    expect(versionsDiffer('1.0.0', '1.0.1')).toBe(true);
    expect(versionsDiffer('1.0.0', '1.1.0')).toBe(true);
    expect(versionsDiffer('1.0.0', '2.0.0')).toBe(true);
    expect(versionsDiffer('1.0.0', '1.0.0')).toBe(false);
    expect(versionsDiffer('v1.0.0', '1.0.0')).toBe(false);
  });
});
