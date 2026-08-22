// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getEffectiveTheme, getStoredTheme, toggleTheme, setTheme, initTheme } from './theme';

describe('theme', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to soft', () => {
    expect(getEffectiveTheme()).toBe('soft');
  });

  it('persists light theme', () => {
    localStorage.setItem('md-reader.theme', 'light');
    expect(getStoredTheme()).toBe('light');
    expect(getEffectiveTheme()).toBe('light');
  });

  it('cycles dark -> soft', () => {
    // default is soft, cycle is dark <-> soft (sun/moon toggles only dark/soft)
    expect(toggleTheme()).toBe('dark');
    expect(toggleTheme()).toBe('soft');
  });

  it('setTheme persists', () => {
    setTheme('dark');
    expect(getEffectiveTheme()).toBe('dark');
    expect(localStorage.getItem('md-reader.theme')).toBe('dark');
  });
});

describe('light theme migration', () => {
  beforeEach(() => localStorage.clear());

  it('migrates a persisted light theme to soft on init', () => {
    localStorage.setItem('md-reader.theme', 'light');
    const applied = initTheme();
    expect(applied).toBe('soft');
    expect(localStorage.getItem('md-reader.theme')).toBe('soft');
    expect(document.documentElement.getAttribute('data-theme')).toBe('soft');
  });
});
