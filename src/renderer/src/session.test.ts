// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { saveSession, loadSession, clearSession } from './session';

describe('session', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a snapshot', () => {
    saveSession({ tabs: [{ filePath: '/a.md', scrollTop: 42 }], activePath: '/a.md' });
    expect(loadSession()).toEqual({ tabs: [{ filePath: '/a.md', scrollTop: 42 }], activePath: '/a.md' });
  });

  it('returns null when empty', () => {
    expect(loadSession()).toBeNull();
  });

  it('clears the stored session', () => {
    saveSession({ tabs: [{ filePath: '/a.md', scrollTop: 0 }], activePath: '/a.md' });
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('ignores malformed entries', () => {
    localStorage.setItem('md-reader.session', '{ not json');
    expect(loadSession()).toBeNull();
  });
});
