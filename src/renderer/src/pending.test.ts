// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemovalGrace, REMOVAL_GRACE_MS } from './pending';

describe('RemovalGrace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onExpire after the grace window', () => {
    const grace = new RemovalGrace();
    const spy = vi.fn();
    grace.start('/a.md', spy);
    vi.advanceTimersByTime(REMOVAL_GRACE_MS);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending grace and reports it', () => {
    const grace = new RemovalGrace();
    const spy = vi.fn();
    grace.start('/a.md', spy);
    expect(grace.cancel('/a.md')).toBe(true);
    vi.advanceTimersByTime(REMOVAL_GRACE_MS * 2);
    expect(spy).not.toHaveBeenCalled();
    expect(grace.cancel('/a.md')).toBe(false);
  });

  it('replaces a running grace when restarted', () => {
    const grace = new RemovalGrace();
    const first = vi.fn();
    const second = vi.fn();
    grace.start('/a.md', first);
    grace.start('/a.md', second);
    vi.advanceTimersByTime(REMOVAL_GRACE_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('tracks multiple paths independently', () => {
    const grace = new RemovalGrace();
    const a = vi.fn();
    const b = vi.fn();
    grace.start('/a.md', a);
    grace.start('/b.md', b);
    expect(grace.isActive('/a.md')).toBe(true);
    grace.cancel('/a.md');
    expect(grace.isActive('/a.md')).toBe(false);
    expect(grace.isActive('/b.md')).toBe(true);
    vi.advanceTimersByTime(REMOVAL_GRACE_MS);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('clears every pending timer', () => {
    const grace = new RemovalGrace();
    const a = vi.fn();
    const b = vi.fn();
    grace.start('/a.md', a);
    grace.start('/b.md', b);
    grace.clear();
    vi.advanceTimersByTime(REMOVAL_GRACE_MS * 2);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });
});
