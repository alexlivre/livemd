export interface OutlineItem { id: string; level: 1|2|3; text: string; }

export function buildOutline(contentEl: HTMLElement): OutlineItem[] {
  const nodes = contentEl.querySelectorAll('h1[id], h2[id], h3[id], h1[data-slug], h2[data-slug], h3[data-slug]');
  const items: OutlineItem[] = [];
  for (const el of nodes) {
    const tag = el.tagName.toLowerCase();
    const level = tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3 as 1|2|3;
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const id = el.getAttribute('id') || el.getAttribute('data-slug') || '';
      if (!id) continue;
      const text = (el.textContent || '').trim();
      if (!text) continue;
      items.push({ id, level, text });
    }
  }
  return items;
}
