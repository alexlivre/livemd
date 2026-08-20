// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addHighlight, renderHighlights } from './highlights';

describe('addHighlight', () => {
  let contentEl: HTMLElement;

  beforeEach(() => {
    contentEl = document.createElement('div');
    contentEl.textContent = 'hello world this is a test document for highlights';
    document.body.appendChild(contentEl);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('creates highlight with id when selection valid', () => {
    const mockSelection = {
      toString: () => 'hello world',
      rangeCount: 1
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);
    const hl = addHighlight(contentEl, '/tmp/test.md', 'accent');
    expect(hl).not.toBeNull();
    expect(hl!.id).toMatch(/^hl-/);
    expect(hl!.text).toBe('hello world');
    expect(hl!.color).toBe('accent');
    expect(typeof hl!.createdAt).toBe('number');
  });

  it('returns null for too short selection', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'a', rangeCount: 1 } as unknown as Selection);
    expect(addHighlight(contentEl, '/tmp/test.md')).toBeNull();
  });

  it('returns null for too long selection', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'x'.repeat(301), rangeCount: 1 } as unknown as Selection);
    expect(addHighlight(contentEl, '/tmp/test.md')).toBeNull();
  });

  it('returns null when text not in content', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'nonexistent text here', rangeCount: 1 } as unknown as Selection);
    expect(addHighlight(contentEl, '/tmp/test.md')).toBeNull();
  });

  it('trims whitespace', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '  hello world  ', rangeCount: 1 } as unknown as Selection);
    const hl = addHighlight(contentEl, '/tmp/test.md');
    expect(hl?.text).toBe('hello world');
  });

  it('validates length 2-300 and finds offset via textContent.indexOf', () => {
    contentEl.textContent = 'abc def ghi';
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'def', rangeCount: 1 } as unknown as Selection);
    const hl = addHighlight(contentEl, '/tmp/test.md');
    expect(hl?.text).toBe('def');
    expect((contentEl.textContent ?? '').indexOf(hl!.text)).toBeGreaterThanOrEqual(0);
  });
});

describe('renderHighlights', () => {
  it('wraps matching text with mark', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>hello world this is a test</p>';
    renderHighlights(el, [{ id: 'hl-123', text: 'hello world', color: 'accent', createdAt: Date.now() }]);
    const mark = el.querySelector('mark[data-hl-id="hl-123"]');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('hello world');
  });

  it('is idempotent and clears previous marks', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>hello world</p>';
    renderHighlights(el, [{ id: 'hl-1', text: 'hello', color: 'accent', createdAt: 1 }]);
    expect(el.querySelectorAll('mark[data-hl-id]').length).toBe(1);
    renderHighlights(el, [{ id: 'hl-2', text: 'world', color: 'warning', createdAt: 2 }]);
    expect(el.querySelector('mark[data-hl-id="hl-1"]')).toBeNull();
    expect(el.querySelector('mark[data-hl-id="hl-2"]')).not.toBeNull();
    expect(el.textContent).toContain('hello world');
  });

  it('skips stale highlights when text not found', () => {
    const el = document.createElement('div');
    el.textContent = 'hello world';
    renderHighlights(el, [{ id: 'hl-x', text: 'nonexistent', color: 'accent', createdAt: 1 }]);
    expect(el.querySelector('mark')).toBeNull();
    expect(el.textContent).toBe('hello world');
  });

  it('handles multiple highlights', () => {
    const el = document.createElement('div');
    el.textContent = 'hello world and hello again';
    renderHighlights(el, [
      { id: 'hl-a', text: 'hello', color: 'accent', createdAt: 1 },
      { id: 'hl-b', text: 'world', color: 'success', createdAt: 2 }
    ]);
    // Should have at least one of each? Due to indexOf first occurrence wrapping, 'hello' wraps first hello
    // 'world' wraps world
    expect(el.querySelector('mark[data-hl-id="hl-a"]')).not.toBeNull();
    expect(el.querySelector('mark[data-hl-id="hl-b"]')).not.toBeNull();
  });

  it('unwraps prior marks before re-render', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>hello <mark data-hl-id="old">world</mark></p>';
    renderHighlights(el, [{ id: 'hl-new', text: 'hello world', color: 'accent', createdAt: 1 }]);
    expect(el.querySelector('mark[data-hl-id="old"]')).toBeNull();
    expect(el.querySelector('mark[data-hl-id="hl-new"]')).not.toBeNull();
  });
});

describe('load/save wrappers', () => {
  it('delegates to window.mdApi', async () => {
    const { loadHighlights, saveHighlights } = await import('./highlights');
    (window as unknown as { mdApi: unknown }).mdApi = {
      loadHighlights: vi.fn().mockResolvedValue([{ id: 'hl-1', text: 'hi', color: 'accent', createdAt: 1 }]),
      saveHighlights: vi.fn().mockResolvedValue(undefined)
    } as unknown as typeof window.mdApi;
    const list = await loadHighlights('/tmp/f.md');
    expect(list).toHaveLength(1);
    await saveHighlights('/tmp/f.md', list);
    expect((window as unknown as { mdApi: { saveHighlights: ReturnType<typeof vi.fn> } }).mdApi.saveHighlights).toHaveBeenCalledWith('/tmp/f.md', list);
  });
});
