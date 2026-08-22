import { describe, it, expect } from 'vitest';
import { parseVersion, versionsDiffer, versionsNewer } from './version';

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

describe('versionsNewer', () => {
  it('returns true when candidate is strictly newer', () => {
    expect(versionsNewer('v1.4.0', '1.3.0')).toBe(true);
    expect(versionsNewer('1.3.1', '1.3.0')).toBe(true);
    expect(versionsNewer('v2.0.0', '1.9.9')).toBe(true);
  });

  it('returns false when candidate is equal or older (downgrade is not an update)', () => {
    expect(versionsNewer('v1.2.9', '1.3.0')).toBe(false);
    expect(versionsNewer('1.3.0', '1.3.0')).toBe(false);
    expect(versionsNewer('v0.9.0', '1.3.0')).toBe(false);
  });
});
