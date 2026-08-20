import type { Highlight } from '@shared/api';

export type { Highlight };
export type HighlightColor = Highlight['color'];

function getApi(): Pick<import('@shared/api').MdApi, 'loadHighlights' | 'saveHighlights'> | null {
  try {
    const api = (window as unknown as { mdApi?: Pick<import('@shared/api').MdApi, 'loadHighlights' | 'saveHighlights'> }).mdApi;
    if (api && typeof api.loadHighlights === 'function' && typeof api.saveHighlights === 'function') return api;
    return null;
  } catch {
    return null;
  }
}

export async function loadHighlights(filePath: string): Promise<Highlight[]> {
  const api = getApi();
  if (!api) return [];
  try {
    const list = await api.loadHighlights(filePath);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveHighlights(filePath: string, list: Highlight[]): Promise<void> {
  const api = getApi();
  if (!api) return;
  try {
    await api.saveHighlights(filePath, list);
  } catch {
    /* ignore */
  }
}

/**
 * Creates a Highlight from the current window selection.
 * Validates length 2-300, trims whitespace, checks that the trimmed text
 * appears in contentEl.textContent via indexOf, and generates an id.
 * Returns null on invalid selection.
 */
export function addHighlight(
  contentEl: HTMLElement,
  _filePath: string,
  color: HighlightColor = 'accent'
): Highlight | null {
  let raw = '';
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    raw = sel.toString();
  } catch {
    return null;
  }
  const text = raw.trim();
  if (text.length < 2 || text.length > 300) return null;
  const full = contentEl.textContent ?? '';
  const idx = full.indexOf(text);
  if (idx === -1) return null;
  const id = `hl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const hl: Highlight = { id, text, color, createdAt: Date.now() };
  return hl;
}

function findRangeForOffset(root: HTMLElement, startIdx: number, length: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const len = node.nodeValue?.length ?? 0;
    if (len === 0) {
      // still advance offset? empty text node contributes 0
    }
    if (!startNode && offset + len > startIdx) {
      startNode = node;
      startOffset = startIdx - offset;
    }
    if (startNode && offset + len >= startIdx + length) {
      endNode = node;
      endOffset = startIdx + length - offset;
      break;
    }
    offset += len;
  }
  if (!startNode || !endNode) return null;
  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  } catch {
    return null;
  }
}

/**
 * Renders highlights into contentEl by wrapping the first occurrence of each
 * highlight's text with <mark data-hl-id> . Idempotent: clears previous marks
 * (unwrap) before applying. Skips stale highlights where text not found.
 * Handles text nodes via Range API with fallback.
 */
export function renderHighlights(contentEl: HTMLElement, highlights: Highlight[]): void {
  // Unwrap previous marks
  const prev = [...contentEl.querySelectorAll<HTMLElement>('mark[data-hl-id]')];
  for (const m of prev) {
    const parent = m.parentNode;
    if (!parent) continue;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    // normalize adjacent text nodes to keep offset calculations stable for subsequent unwraps
    // we do it per parent to avoid excessive work; calling on the mark's parent is enough
    try {
      parent.normalize();
    } catch {
      /* ignore */
    }
  }
  // Also normalize contentEl in case marks were deeply nested
  try {
    contentEl.normalize();
  } catch {
    /* ignore */
  }

  if (!highlights || highlights.length === 0) return;

  for (const hl of highlights) {
    if (!hl || typeof hl.text !== 'string') continue;
    const text = hl.text;
    if (text.length < 2 || text.length > 300) continue;
    const full = contentEl.textContent ?? '';
    const idx = full.indexOf(text);
    if (idx === -1) continue;

    const range = findRangeForOffset(contentEl, idx, text.length);
    if (!range) continue;

    try {
      const mark = document.createElement('mark');
      mark.setAttribute('data-hl-id', hl.id);
      mark.setAttribute('data-hl-color', hl.color);
      // also set dataset for convenience (jsdom supports)
      try {
        (mark as HTMLElement & { dataset: DOMStringMap }).dataset.hlId = hl.id;
        (mark as HTMLElement & { dataset: DOMStringMap }).dataset.hlColor = hl.color;
      } catch {
        /* ignore dataset */
      }
      // Try surroundContents first; fallback to extractContents when range partially selects non-text nodes
      try {
        range.surroundContents(mark);
      } catch {
        const frag = range.extractContents();
        mark.appendChild(frag);
        range.insertNode(mark);
      }
      // Normalize to merge adjacent text nodes after insertion if needed
      try {
        mark.parentNode?.normalize();
      } catch {
        /* ignore */
      }
    } catch {
      // Final fallback: innerHTML replace of first occurrence with escaped mark
      // This path is rarely taken; we attempt a simple string replace on innerHTML
      // but only if the text is plain (no HTML). To avoid breaking, just skip.
      continue;
    }
  }
}

/**
 * Convenience: load highlights for filePath and render them into contentEl.
 */
export async function applyHighlights(contentEl: HTMLElement, filePath: string): Promise<void> {
  const list = await loadHighlights(filePath);
  renderHighlights(contentEl, list);
}
