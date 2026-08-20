import { createPopover, type Popover } from './menus';
import { t } from './i18n';
import { escapeAttr, escapeHtml } from './util';

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

let activeObserver: IntersectionObserver | null = null;

function cssEscape(value: string): string {
  const c = (globalThis as unknown as { CSS?: { escape: (v: string) => string } }).CSS;
  if (c?.escape) return c.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

export function refreshOutline(_tabId: string, contentEl: HTMLElement, trigger: HTMLButtonElement, menu: HTMLElement): void {
  const items = buildOutline(contentEl);
  trigger.hidden = items.length < 2;
  if (trigger.hidden) { menu.hidden = true; return; }
  renderOutlineMenu(menu, items, contentEl);
  setupSpy(contentEl, menu);
}

function renderOutlineMenu(menu: HTMLElement, items: OutlineItem[], contentEl: HTMLElement): void {
  if (items.length === 0) { menu.innerHTML = `<div class="recent-empty">${escapeHtml(t('outlineEmpty'))}</div>`; return; }
  menu.innerHTML = `<div class="lang-menu-title">${escapeHtml(t('outlineTitle'))}</div><ul class="recent-menu-list">${items.map(it=>`<li><button class="lang-menu-item outline-item" data-id="${escapeAttr(it.id)}" style="padding-left:${8+it.level*8}px"><span class="recent-menu-name">${escapeHtml(it.text)}</span></button></li>`).join('')}</ul>`;
  for (const btn of menu.querySelectorAll<HTMLButtonElement>('.outline-item')) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!;
      const escId = cssEscape(id);
      const target = contentEl.querySelector(`#${escId}`) ?? contentEl.querySelector(`[data-slug="${escapeAttr(id)}"]`);
      if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
      menu.hidden = true;
    });
  }
}

function setupSpy(contentEl: HTMLElement, menu: HTMLElement): void {
  activeObserver?.disconnect();
  const heads = [...contentEl.querySelectorAll('h1[id],h2[id],h3[id],h1[data-slug],h2[data-slug],h3[data-slug]')] as HTMLElement[];
  if (heads.length===0) return;
  activeObserver = new IntersectionObserver((entries)=>{
    let bestId: string | null = null;
    let bestRatio = 0;
    for (const e of entries) if (e.isIntersecting && e.intersectionRatio > bestRatio) {
      bestRatio = e.intersectionRatio;
      bestId = e.target.getAttribute('id') || e.target.getAttribute('data-slug') || null;
    }
    if (bestId) {
      for (const b of menu.querySelectorAll('.outline-item')) b.classList.toggle('is-active', b.getAttribute('data-id')===bestId);
    }
  }, {root: contentEl, threshold:0.5});
  heads.forEach(h=> activeObserver!.observe(h));
}
export function bindOutline(trigger: HTMLButtonElement, menu: HTMLElement, _contentEl: HTMLElement): Popover {
  let popover: Popover;
  popover = createPopover(trigger, menu, () => {
    // re-render on open using cached active tab items is handled by refreshOutline caller
  });
  return popover;
}
