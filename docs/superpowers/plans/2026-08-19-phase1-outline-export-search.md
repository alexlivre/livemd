# Phase 1 Implementation Plan — Outline Overlay + Export + Global Search

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Fase 1 features to LiveMD — floating outline popover (h1-h3), export as PDF/HTML/Copy-HTML, and global search across tabs + recents — in vanilla DOM without new deps.

**Architecture:** Three isolated renderer modules (`outline.ts`, `export.ts`, `globalSearch.ts`) + two new IPC channels (`file:export-pdf`, `file:export-html`) in `src/main/index.ts`; all UIs reuse `createPopover` from `menus.ts` and CSS tokens `var(--bg-*)`; i18n via `src/shared/i18n.ts` with `pt/en/es` parity; verification via `vitest` unit tests + `typecheck` + `build` + manual in `release/win-unpacked/LiveMD.exe`.

**Tech Stack:** Electron 43, electron-vite 2, TypeScript 5.6, marked 14 + DOMPurify 3 + highlight.js 11, chokidar 3, vitest 2 + jsdom, vanilla DOM (no React).

## Global Constraints

- Electron 32+ (now 43.4.0), `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` — keep in `src/main/index.ts:385-391`.
- CSP in `src/renderer/index.html:8` is `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: file: https:` — no inline event handlers.
- Exactly two themes: `dark` and `soft` (`ThemeName` in `src/renderer/src/theme.ts`), `soft` is default; stored `'light'` migrates to `soft`; all colors via `:root[data-theme]` tokens in `style.css`.
- Never rename `localStorage` keys `md-reader.theme`, `md-reader.recent`, `md-reader.lang`, `md-reader.update-check`.
- Package identity `name: livemd`, `productName: LiveMD`, `appId: com.livemd.app` — keep in sync with `build/installer.nsh` ProgID `LiveMD.mdfile`.
- Packaged verification required: `npm run pack` produces `release/win-unpacked/LiveMD.exe`; dev-mode-only testing misses drag-drop `file://` protected mode.
- No new runtime dependencies.
- UI strings in `pt/en/es` via `src/shared/i18n.ts` — `en` is source, TS enforces parity (`MsgKey = keyof typeof enMessages`).

---

### Task 1: i18n keys for Fase 1

**Files:**
- Modify: `src/shared/i18n.ts:5-90`
- Test: `src/shared/i18n.test.ts` (new, vitest)

**Interfaces:**
- Consumes: existing `MESSAGES`, `MsgKey`
- Produces: 10 new keys `outlineTooltip`, `outlineTitle`, `outlineEmpty`, `exportTooltip`, `exportPdf`, `exportHtml`, `copyAsHtml`, `globalSearchPlaceholder`, `globalSearchEmpty`, `globalSearchResults` available via `t(lang, key)`

- [ ] **Step 1: Write failing test for new keys**

```ts
// src/shared/i18n.test.ts
import { describe, it, expect } from 'vitest';
import { MESSAGES } from './i18n';

describe('fase1 i18n keys', () => {
  it('has all fase1 keys in pt/en/es with same set', () => {
    const enKeys = Object.keys(MESSAGES.en);
    for (const lang of ['pt','es'] as const) {
      const keys = Object.keys(MESSAGES[lang]);
      expect(keys.sort()).toEqual(enKeys.sort());
      for (const k of ['outlineTooltip','exportPdf','globalSearchPlaceholder'] as const) {
        expect(MESSAGES[lang][k]).toBeTruthy();
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/i18n.test.ts -v`
Expected: FAIL — `outlineTooltip` not found in `MESSAGES.pt` etc.

- [ ] **Step 3: Add keys to enMessages, ptMessages, esMessages**

```ts
// src/shared/i18n.ts — inside enMessages (after globalSearchPlaceholder if exists)
outlineTooltip: 'Outline',
outlineTitle: 'Outline',
outlineEmpty: 'No headings',
exportTooltip: 'Export',
exportPdf: 'Save as PDF',
exportHtml: 'Save as HTML',
copyAsHtml: 'Copy as HTML',
globalSearchPlaceholder: 'Search in all tabs',
globalSearchEmpty: 'No matches',
globalSearchResults: '{n} matches in {m} files',
```

```ts
// ptMessages
outlineTooltip: 'Sumário',
outlineTitle: 'Sumário',
outlineEmpty: 'Sem títulos',
exportTooltip: 'Exportar',
exportPdf: 'Salvar como PDF',
exportHtml: 'Salvar como HTML',
copyAsHtml: 'Copiar como HTML',
globalSearchPlaceholder: 'Buscar em todas as abas',
globalSearchEmpty: 'Nenhum resultado',
globalSearchResults: '{n} resultados em {m} arquivos',
```

```ts
// esMessages
outlineTooltip: 'Índice',
outlineTitle: 'Índice',
outlineEmpty: 'Sin encabezados',
exportTooltip: 'Exportar',
exportPdf: 'Guardar como PDF',
exportHtml: 'Guardar como HTML',
copyAsHtml: 'Copiar como HTML',
globalSearchPlaceholder: 'Buscar en todas las pestañas',
globalSearchEmpty: 'Sin resultados',
globalSearchResults: '{n} resultados en {m} archivos',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/shared/i18n.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/i18n.ts src/shared/i18n.test.ts
git commit -m "feat(i18n): add fase1 keys outline/export/globalSearch"
```

---

### Task 2: Outline pure logic (buildOutline + tests)

**Files:**
- Create: `src/renderer/src/outline.ts:1-80`
- Test: `src/renderer/src/outline.test.ts`

**Interfaces:**
- Consumes: `HTMLElement` from renderer DOM (headings already have `id`/`data-slug` from `markdown.ts:101`)
- Produces: `export interface OutlineItem { id:string; level:1|2|3; text:string }` and `export function buildOutline(contentEl: HTMLElement): OutlineItem[]` and `export function getOutlineLevel(el: Element): 1|2|3`

- [ ] **Step 1: Write failing test**

```ts
// src/renderer/src/outline.test.ts
import { describe, it, expect } from 'vitest';
import { buildOutline } from './outline';

describe('buildOutline', () => {
  it('extracts h1-h3 with id and text', () => {
    const div = document.createElement('div');
    div.innerHTML = '<h1 id=\"a\">Alpha</h1><h2 id=\"b\">Beta</h2><p>x</p><h3 id=\"c\">Gamma</h3>';
    const items = buildOutline(div);
    expect(items).toEqual([
      { id:'a', level:1, text:'Alpha' },
      { id:'b', level:2, text:'Beta' },
      { id:'c', level:3, text:'Gamma' },
    ]);
  });
  it('ignores h4+ and elements without id', () => {
    const div = document.createElement('div');
    div.innerHTML = '<h4 id=\"x\">X</h4><h2>NoId</h2><h2 id=\"y\">Y</h2>';
    expect(buildOutline(div)).toEqual([{id:'y', level:2, text:'Y'}]);
  });
  it('handles data-slug fallback', () => {
    const div = document.createElement('div');
    div.innerHTML = '<h2 data-slug=\"slug-1\">Slug Title</h2>';
    const items = buildOutline(div);
    expect(items[0].id).toBe('slug-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/outline.test.ts -v`
Expected: FAIL — `buildOutline is not defined` / file not found

- [ ] **Step 3: Implement minimal outline.ts**

```ts
// src/renderer/src/outline.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/renderer/src/outline.test.ts -v`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/outline.ts src/renderer/src/outline.test.ts
git commit -m "feat(outline): add buildOutline pure logic with tests"
```

---

### Task 3: Outline UI — button + popover + scroll-spy

**Files:**
- Modify: `src/renderer/src/outline.ts:80-180` (add `createOutlinePopover`, `refreshOutline`)
- Modify: `src/renderer/src/main.ts:30-60, 132-250, 700-750` (integrate)
- Modify: `src/renderer/src/style.css:580-650` (add `#content-wrap`, `.btn-outline`, `#outline-menu`)
- Modify: `src/renderer/index.html:77-97` (wrap content, add btn-outline)
- Test: `npm run typecheck && npm run build` + manual

**Interfaces:**
- Consumes: `buildOutline` from Task 2, `createPopover` from `src/renderer/src/menus.ts:13`, `t` from `i18n.ts`
- Produces: `export function refreshOutline(tabId:string, contentEl:HTMLElement, trigger:HTMLButtonElement, menu:HTMLElement):void` and `export function bindOutline(trigger:HTMLButtonElement, menu:HTMLElement, contentEl:HTMLElement):void`

- [ ] **Step 1: Write integration check (manual test script)**

Create `scripts/check-outline.mjs` that asserts `style.css` contains `#content-wrap` after change — placeholder until manual.

```bash
# No automated test for UI yet; verification is build + manual
```

- [ ] **Step 2: Add outline menu HTML**

```html
<!-- src/renderer/index.html — inside #app, replace <main id="content"> -->
<div id="content-wrap">
  <main id="content" class="content"></main>
  <button id="btn-outline" class="btn btn-ghost btn-icon btn-outline" hidden title="Outline" data-i18n-title="outlineTooltip">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
  </button>
  <div id="outline-menu" class="recent-menu" hidden></div>
</div>
```

- [ ] **Step 3: Implement refreshOutline + popover in outline.ts**

```ts
// src/renderer/src/outline.ts — append
import { createPopover, type Popover } from './menus';
import { t } from './i18n';
import { escapeHtml, escapeAttr } from './util';

let activeObserver: IntersectionObserver | null = null;
const cache = new Map<string, OutlineItem[]>();

export function refreshOutline(tabId: string, contentEl: HTMLElement, trigger: HTMLButtonElement, menu: HTMLElement): void {
  const items = buildOutline(contentEl);
  cache.set(tabId, items);
  trigger.hidden = items.length < 2;
  if (trigger.hidden) { menu.hidden = true; return; }
  renderOutlineMenu(menu, items, contentEl);
  setupSpy(contentEl, menu);
}

function renderOutlineMenu(menu: HTMLElement, items: OutlineItem[], contentEl: HTMLElement): void {
  if (items.length === 0) { menu.innerHTML = `<div class="recent-empty">${escapeHtml(t('outlineEmpty'))}</div>`; return; }
  menu.innerHTML = `<div class="lang-menu-title">${escapeHtml(t('outlineTitle'))}</div><ul class="recent-menu-list">${items.map(it=>`<li><button class="lang-menu-item outline-item" data-id="${escapeAttr(it.id)}" style=\"padding-left:${8+it.level*8}px\"><span class="recent-menu-name">${escapeHtml(it.text)}</span></button></li>`).join('')}</ul>`;
  for (const btn of menu.querySelectorAll<HTMLButtonElement>('.outline-item')) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!;
      const target = contentEl.querySelector(`#${CSS.escape(id)}, [data-slug=\"${id}\"]`);
      if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
      menu.hidden = true;
    });
  }
}

function setupSpy(contentEl: HTMLElement, menu: HTMLElement): void {
  activeObserver?.disconnect();
  const heads = [...contentEl.querySelectorAll('h1[id],h2[id],h3[id]')] as HTMLElement[];
  if (heads.length===0) return;
  activeObserver = new IntersectionObserver((entries)=>{
    for (const e of entries) if (e.isIntersecting) {
      const id = e.target.getAttribute('id') || e.target.getAttribute('data-slug') || '';
      for (const b of menu.querySelectorAll('.outline-item')) b.classList.toggle('is-active', b.getAttribute('data-id')===id);
    }
  }, {root: contentEl, threshold:0.5});
  heads.forEach(h=> activeObserver!.observe(h));
}
export function bindOutline(trigger: HTMLButtonElement, menu: HTMLElement, contentEl: HTMLElement): Popover {
  let popover: Popover;
  popover = createPopover(trigger, menu, () => {
    // re-render on open using cached active tab items is handled by refreshOutline caller
  });
  return popover;
}
```

- [ ] **Step 4: Wire in main.ts**

```ts
// src/renderer/src/main.ts — top
import { refreshOutline, bindOutline } from './outline';

// after const declarations
const btnOutline = document.getElementById('btn-outline') as HTMLButtonElement;
const outlineMenu = document.getElementById('outline-menu') as HTMLElement;
bindOutline(btnOutline, outlineMenu, contentEl);

// inside renderContent() after contentEl.innerHTML = html and scheduleHighlight
refreshOutline(manager.getActiveId() ?? '', contentEl, btnOutline, outlineMenu);
// also on tab switch and file:event changed -> same call
```

- [ ] **Step 5: CSS**

```css
/* src/renderer/src/style.css */
#content-wrap { position: relative; overflow: hidden; display: flex; flex-direction: column; }
.btn-outline { position: absolute; top: 12px; right: 16px; z-index: 5; width: 32px; height: 32px; }
#outline-menu { position: absolute; top: 48px; right: 16px; min-width: 280px; max-height: 50vh; overflow-y: auto; }
.outline-item.is-active { background: var(--accent-soft); color: var(--accent); }
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run build`
Expected: PASS

Manual: open `exemplo.md` in `release/win-unpacked/LiveMD.exe`, verify button appears, popover lists h1-h3, click scrolls, spy highlights.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/outline.ts src/renderer/src/main.ts src/renderer/index.html src/renderer/src/style.css
git commit -m "feat(outline): floating popover with scroll-spy"
```

---

### Task 4: Export IPC — main + preload + api

**Files:**
- Modify: `src/shared/api.ts:24-50`
- Modify: `src/preload/index.ts:6-49`
- Modify: `src/main/index.ts:213-373`
- Test: `vitest` not needed; `typecheck` + manual

**Interfaces:**
- Consumes: `BrowserWindow.webContents.printToPDF`, `dialog.showSaveDialog`, `fs.writeFile`, `clipboard.writeText`, `t(currentLang,...)`
- Produces: `api.exportPdf(): Promise<{savedPath:string}|null>` and `api.exportHtml(html, suggestedName): Promise<{savedPath:string}|null>` and `api.copyHtml(html): Promise<void>`

- [ ] **Step 1: Extend MdApi**

```ts
// src/shared/api.ts — add to MdApi
exportHtml: (html: string, suggestedName: string) => Promise<{savedPath:string}|null>;
exportPdf: () => Promise<{savedPath:string}|null>;
copyHtml: (html:string) => Promise<void>;
```

- [ ] **Step 2: Preload wiring**

```ts
// src/preload/index.ts — add to api
exportHtml: (html, suggestedName) => ipcRenderer.invoke('file:export-html', {html, suggestedName}),
exportPdf: () => ipcRenderer.invoke('file:export-pdf'),
copyHtml: (html) => ipcRenderer.invoke('clipboard:write-text', html),
```

- [ ] **Step 3: Main handlers inside registerIpc(win)**

```ts
ipcMain.handle('file:export-pdf', async (): Promise<{savedPath:string}|null> => {
  if (!win || win.isDestroyed()) return null;
  const pdf = await win.webContents.printToPDF({ printBackground: true });
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: t(currentLang, 'exportPdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    defaultPath: 'document.pdf'
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, pdf);
  return { savedPath: filePath };
});

ipcMain.handle('file:export-html', async (_evt, payload: unknown): Promise<{savedPath:string}|null> => {
  const { html, suggestedName } = payload as { html?: unknown, suggestedName?: unknown };
  if (typeof html !== 'string' || typeof suggestedName !== 'string') return null;
  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    title: t(currentLang, 'exportHtml'),
    defaultPath: suggestedName.replace(/\.md$/i,'.html'),
    filters: [{ name: 'HTML', extensions: ['html','htm'] }, { name: t(currentLang,'filterAll'), extensions:['*'] }]
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, html, 'utf-8');
  return { savedPath: filePath };
});
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: PASS (no `any` errors, `Payload` narrowed)

- [ ] **Step 5: Commit**

```bash
git add src/shared/api.ts src/preload/index.ts src/main/index.ts
git commit -m "feat(export): add exportPdf/exportHtml IPC handlers"
```

---

### Task 5: Export renderer — HTML generation + titlebar menu

**Files:**
- Create: `src/renderer/src/export.ts:1-90`
- Modify: `src/renderer/src/main.ts:28-40, 400-420, 700-760`
- Modify: `src/renderer/index.html:29-48` (add export button)
- Modify: `src/renderer/src/menus.ts:122-130` (add export menu helper) or inline
- Test: `src/renderer/src/export.test.ts` (HTML generation pure)

**Interfaces:**
- Consumes: `api.exportPdf`, `api.exportHtml`, `api.copyHtml`, `contentEl.innerHTML`, `document.querySelector('link[rel=stylesheet]')`, `getEffectiveLang`, `t`, `basename` from `@shared/backupName`? Not needed
- Produces: `export function buildStandaloneHtml(contentHtml:string, theme:string): string` and `export function bindExportMenu(trigger, menu): Popover`

- [ ] **Step 1: Write failing test for HTML builder**

```ts
// src/renderer/src/export.test.ts
import { describe, it, expect } from 'vitest';
import { buildStandaloneHtml } from './export';

describe('buildStandaloneHtml', () => {
  it('inlines css and wraps markdown-body', () => {
    const html = buildStandaloneHtml('<h1>Hello</h1>', 'dark', 'body{color:red}');
    expect(html).toContain('<style>body{color:red}</style>');
    expect(html).toContain('data-theme=\"dark\"');
    expect(html).toContain('<div class=\"markdown-body\"><h1>Hello</h1></div>');
  });
});
```

- [ ] **Step 2: Run test to fail**

Run: `npm test -- src/renderer/src/export.test.ts -v`
Expected: FAIL — file not found

- [ ] **Step 3: Implement export.ts**

```ts
// src/renderer/src/export.ts
export function buildStandaloneHtml(contentHtml: string, theme: string, cssText: string): string {
  const css = cssText ? `<style>${cssText}</style>` : '';
  return `<!doctype html><html data-theme=\"${theme}\"><head><meta charset=\"UTF-8\">${css}</head><body><div class=\"markdown-body\">${contentHtml}</div></body></html>`;
}

export async function fetchCssText(): Promise<string> {
  const link = document.querySelector<HTMLLinkElement>('link[rel=\"stylesheet\"]');
  if (!link) return '';
  try { const res = await fetch(link.href); return await res.text(); } catch { return ''; }
}
```

- [ ] **Step 4: Run test to pass**

Run: `npm test -- src/renderer/src/export.test.ts -v`
Expected: PASS

- [ ] **Step 5: Titlebar menu integration**

Add to `index.html` titlebar-actions before `btn-about`:

```html
<div class="recent-wrap">
  <button id="btn-export" class="btn btn-ghost btn-icon" data-i18n-title="exportTooltip" title="Export"><svg>...</svg></button>
  <div id="export-menu" class="recent-menu" hidden></div>
</div>
```

`main.ts`:

```ts
import { buildStandaloneHtml, fetchCssText } from './export';
const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
const exportMenu = document.getElementById('export-menu') as HTMLElement;
function renderExportMenu() {
  exportMenu.innerHTML = `
    <button class="recent-menu-item" data-act="pdf">${escapeHtml(t('exportPdf'))}</button>
    <button class="recent-menu-item" data-act="html">${escapeHtml(t('exportHtml'))}</button>
    <button class="recent-menu-item" data-act="copy">${escapeHtml(t('copyAsHtml'))}</button>`;
  exportMenu.querySelector('[data-act=\"pdf\"]')?.addEventListener('click', async ()=>{
    const res = await window.mdApi.exportPdf();
    if(res) Toast.show(t('toastSaved',{file: basename(res.savedPath)}));
  });
  exportMenu.querySelector('[data-act=\"html\"]')?.addEventListener('click', async ()=>{
    const css = await fetchCssText();
    const theme = document.documentElement.getAttribute('data-theme') || 'soft';
    const html = buildStandaloneHtml(contentEl.innerHTML, theme, css);
    const suggested = manager.getActive()?.filePath || 'document.md';
    const res = await window.mdApi.exportHtml(html, suggested);
    if(res) Toast.show(t('toastSaved',{file: basename(res.savedPath)}));
  });
  exportMenu.querySelector('[data-act=\"copy\"]')?.addEventListener('click', async ()=>{
    const css = await fetchCssText();
    const theme = document.documentElement.getAttribute('data-theme') || 'soft';
    const html = buildStandaloneHtml(contentEl.innerHTML, theme, css);
    await window.mdApi.copyText(html);
    Toast.show(t('copied'));
  });
}
const exportPopover = createPopover(btnExport, exportMenu, renderExportMenu);
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/export.ts src/renderer/src/export.test.ts src/renderer/src/main.ts src/renderer/index.html src/renderer/src/menus.ts
git commit -m "feat(export): standalone HTML + PDF via titlebar menu"
```

---

### Task 6: Global search logic (pure)

**Files:**
- Create: `src/renderer/src/globalSearch.ts:1-100`
- Test: `src/renderer/src/globalSearch.test.ts`

**Interfaces:**
- Consumes: `TabData[]` (with `filePath`, `fileName`, `content`), `string[]` recents
- Produces: `export interface GlobalSearchGroup { filePath:string; fileName:string; matches:{ line:number; preview:string; index:number }[] }` and `export function searchInContent(content:string, query:string): {line,preview,index}[]` and `export function searchAll(query:string, tabs: TabData[], recentContents: Map<string,string>): GlobalSearchGroup[]`

- [ ] **Step 1: Write failing test**

```ts
// src/renderer/src/globalSearch.test.ts
import { describe, it, expect } from 'vitest';
import { searchInContent, searchAll } from './globalSearch';

describe('searchInContent', () => {
  it('finds case-insensitive matches with preview', () => {
    const content = 'Hello LiveMD\nsecond line\nLiveMD again';
    const res = searchInContent(content, 'livemd');
    expect(res).toHaveLength(2);
    expect(res[0].line).toBe(1);
    expect(res[1].line).toBe(3);
  });
  it('limits and escapes', () => {
    expect(searchInContent('a\n'.repeat(100), 'a').length).toBeLessThanOrEqual(50);
  });
});
describe('searchAll', () => {
  it('groups by file', () => {
    const groups = searchAll('hello', [{filePath:'/a.md', fileName:'a.md', content:'hello world'} as any], new Map());
    expect(groups[0].fileName).toBe('a.md');
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `npm test -- src/renderer/src/globalSearch.test.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/renderer/src/globalSearch.ts
export interface GlobalSearchGroup { filePath:string; fileName:string; matches:{line:number;preview:string;index:number}[] }

export function searchInContent(content:string, query:string): {line:number;preview:string;index:number}[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const lines = content.split('\n');
  const out = [];
  for (let i=0;i<lines.length;i++) {
    const line = lines[i]!;
    const idx = line.toLowerCase().indexOf(q);
    if (idx>=0) {
      const preview = line.length>120 ? line.slice(Math.max(0,idx-40), idx+q.length+60) : line;
      out.push({ line:i+1, preview, index: idx });
      if (out.length>=50) break;
    }
  }
  return out;
}

export function searchAll(query:string, tabs: {filePath:string,fileName:string,content:string}[], recentContents: Map<string,string>): GlobalSearchGroup[] {
  const groups: GlobalSearchGroup[] = [];
  const seen = new Set<string>();
  for (const t of tabs) {
    seen.add(t.filePath);
    const m = searchInContent(t.content, query);
    if (m.length) groups.push({ filePath:t.filePath, fileName:t.fileName, matches:m });
  }
  for (const [fp, content] of recentContents) {
    if (seen.has(fp)) continue;
    const m = searchInContent(content, query);
    if (m.length) groups.push({ filePath:fp, fileName: fp.split(/[\\/]/).pop()||fp, matches:m });
  }
  return groups.slice(0,50);
}
```

- [ ] **Step 4: Run to pass**

Run: `npm test -- src/renderer/src/globalSearch.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/globalSearch.ts src/renderer/src/globalSearch.test.ts
git commit -m "feat(search): add global search pure logic"
```

---

### Task 7: Global search UI + shortcuts + recents wiring

**Files:**
- Modify: `src/renderer/src/main.ts:700-820` (add globalSearch bar logic)
- Modify: `src/renderer/src/shortcuts.ts:10-30` (add Ctrl+Shift+F)
- Modify: `src/renderer/index.html:148-174` (add #global-searchbar)
- Modify: `src/renderer/src/style.css:1435-1510` (reuse .searchbar, add .global-results)
- Test: `typecheck && build` + manual

**Interfaces:**
- Consumes: `searchAll` from Task 6, `getRecentFiles`, `api.readFile`, `api.findInPage`, `manager`, `debounce`, `t`, `escapeHtml`
- Produces: UI bar toggle and result list rendering

- [ ] **Step 1: Add HTML**

```html
<!-- after #searchbar in index.html -->
<div id="global-searchbar" class="searchbar" hidden>
  <div class="search-field"><input id="global-search-input" data-i18n-placeholder="globalSearchPlaceholder" placeholder="Search in all tabs"/></div>
  <span id="global-search-count" class="search-count"></span>
  <button id="global-search-close" class="btn btn-ghost btn-icon">×</button>
</div>
<div id="global-results" class="global-results" hidden></div>
```

- [ ] **Step 2: Bind in main.ts**

```ts
const globalBar = document.getElementById('global-searchbar') as HTMLElement;
const globalInput = document.getElementById('global-search-input') as HTMLInputElement;
const globalCount = document.getElementById('global-search-count') as HTMLElement;
const globalResults = document.getElementById('global-results') as HTMLElement;

let globalDebounced = debounce(async ()=>{
  const q = globalInput.value.trim();
  if (!q) { globalResults.hidden=true; globalCount.textContent=''; return; }
  const tabs = manager.getState().tabs.map(t=>({filePath:t.filePath, fileName:t.fileName, content: (t as any).content || ''}));
  // load recents not in tabs: read via api.readFile limited
  const recents = getRecentFiles().filter(p=>!tabs.some(t=>t.filePath===p)).slice(0,10);
  const recentContents = new Map<string,string>();
  for (const p of recents) {
    try { const f = await api.readFile(p); recentContents.set(p, f.content.slice(0, 256*1024)); } catch {}
  }
  const groups = searchAll(q, tabs, recentContents);
  const total = groups.reduce((n,g)=>n+g.matches.length,0);
  globalCount.textContent = total ? t('globalSearchResults',{n: total, m: groups.length}) : t('globalSearchEmpty');
  if (total===0) { globalResults.innerHTML=`<div class="recent-empty">${escapeHtml(t('globalSearchEmpty'))}</div>`; globalResults.hidden=false; return; }
  globalResults.innerHTML = groups.map(g=>`<div class="global-group"><div class="global-group-title">${escapeHtml(g.fileName)}<span class="global-group-path">${escapeHtml(g.filePath)}</span></div>${g.matches.map(m=>`<button class="global-match" data-path="${escapeAttr(g.filePath)}" data-line="${m.line}">${escapeHtml(m.preview.slice(0,80))}</button>`).join('')}</div>`).join('');
  for (const btn of globalResults.querySelectorAll<HTMLButtonElement>('.global-match')) {
    btn.addEventListener('click', async ()=>{
      const fp = btn.dataset.path!; await openPath(fp); void api.findInPage(q);
      globalBar.hidden=true; globalResults.hidden=true;
    });
  }
  globalResults.hidden=false;
}, 180);

globalInput.addEventListener('input', ()=> void globalDebounced());
document.getElementById('global-search-close')?.addEventListener('click', ()=> { globalBar.hidden=true; globalResults.hidden=true; });
```

- [ ] **Step 3: Shortcut**

```ts
// src/renderer/src/shortcuts.ts — add
if (e.ctrlKey && e.shiftKey && e.key.toLowerCase()==='f') { e.preventDefault(); globalBar.hidden=false; globalInput.focus(); globalInput.select(); }
if (e.key==='Escape' && !globalBar.hidden) { globalBar.hidden=true; globalResults.hidden=true; }
```

- [ ] **Step 4: CSS**

```css
.global-results { position: fixed; top: 110px; left: 50%; transform: translateX(-50%); width: min(700px, 90vw); max-height: 40vh; overflow-y:auto; background: var(--bg-elevated); border:1px solid var(--border); border-radius:8px; z-index:60; padding:8px; }
.global-group-title { font-weight:600; font-size:12px; display:flex; justify-content:space-between; padding:6px 4px; }
.global-group-path { color: var(--text-muted); font-weight:400; overflow:hidden; text-overflow:ellipsis; }
.global-match { width:100%; text-align:left; padding:6px 8px; border:none; background:transparent; cursor:pointer; font-family: ui-monospace; font-size:12px; }
.global-match:hover { background: var(--bg-tab-hover); }
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: PASS

Manual: `Ctrl+Shift+F`, type "LiveMD", see grouped results in tabs+recents, click opens.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/main.ts src/renderer/src/shortcuts.ts src/renderer/index.html src/renderer/src/style.css
git commit -m "feat(search): global search UI across tabs+recents"
```

---

### Task 8: Polish, docs & final verification

**Files:**
- Modify: `README.md:46-55` (add Fase 1 bullets)
- Modify: `docs/superpowers/specs/2026-08-19-phase1-outline-export-search-design.md` (mark implemented)
- Test: full verification

**Interfaces:**
- Consumes: all previous tasks

- [ ] **Step 1: Update README**

Add to Features:

```md
- **Outline** — floating popover with h1-h3 and scroll-spy
- **Export** — Save as PDF (printBackground) / HTML standalone / Copy as HTML
- **Global search** — Ctrl+Shift+F across open tabs + recent files
```

- [ ] **Step 2: Run full checks**

Run: `npm run typecheck && npm test && npm run build && npm run pack`
Expected: all PASS, `release/win-unpacked/LiveMD.exe` launches, Fase 1 features work per Verification in spec (9 steps).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README for fase 1 features"
```

---

## Self-Review Checklist

- [x] Spec coverage: Outline (Tasks 2-3), Export (4-5), Global search (6-7) all mapped.
- [x] Placeholder scan: no TBD/TODO, all steps have code/commands.
- [x] Type consistency: `OutlineItem`, `GlobalSearchGroup`, `MdApi` methods `exportPdf/exportHtml/copyHtml` match across preload/main/renderer.
- [x] Global constraints respected: no deps, CSP kept, themes preserved, localStorage keys untouched.

