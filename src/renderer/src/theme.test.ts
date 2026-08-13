// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getEffectiveTheme, getStoredTheme, toggleTheme, setTheme } from './theme';

describe('theme', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to soft', () => {
    expect(getEffectiveTheme()).toBe('soft');
  });

  it('migrates legacy light to soft', () => {
    localStorage.setItem('md-reader.theme', 'light');
    expect(getStoredTheme()).toBe('soft');
    expect(getEffectiveTheme()).toBe('soft');
  });

  it('toggles dark <-> soft', () => {
    expect(toggleTheme()).toBe('dark');
    expect(toggleTheme()).toBe('soft');
  });

  it('setTheme persists', () => {
    setTheme('dark');
    expect(getEffectiveTheme()).toBe('dark');
    expect(localStorage.getItem('md-reader.theme')).toBe('dark');
  });
});
