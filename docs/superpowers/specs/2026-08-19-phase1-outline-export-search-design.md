# Phase 1 Design — LiveMD: Outline Overlay + Export + Global Search

**Date:** 2026-08-19
**Status:** Approved (Fase 1 of 3 — decomposition of “todos” into value-based phases)
**Approach:** A — Vanilla DOM incremental (no new deps)

## Context — Decomposition of “todos”

The user requested all ~20 features at once (outline, Mermaid/Math, annotations, export PDF/HTML, global search, file sidebar, session, themes, command palette, etc.). Per brainstorming gate, this was flagged as too large for a single spec: 6 independent subsystems would produce a giant PR impossible to verify in the packaged build (`release/win-unpacked/LiveMD.exe` per `AGENTS.md`).

Agreed decomposition:

- **Fase 1 (this spec):** Outline overlay + Export com opções + Busca global (abas + recentes) — highest value, lowest risk, zero deps.
- **Fase 2:** Mermaid/Math + highlights/annotations + command palette.
- **Fase 3:** Sidebar de arquivos + tema/CSS custom + sessão/pin workspace.

Each fase gets its own spec → plan → implementation cycle. This document covers Fase 1 only.

## Goal

Add three read-centric capabilities without turning LiveMD into an editor:

1. **Outline** — quick navigation inside long Markdown files.
2. **Export** — share the rendered view as PDF/HTML (preserve theme + highlight).
3. **Busca global** — find text across todas as abas abertas + recentes, not just `Ctrl+F` na aba atual.

Keep the current stack: Electron 32 + electron-vite 2 + TypeScript + vanilla DOM, `sandbox: true`, `contextIsolation: true`, CSP `default-src 'self'; img-src 'self' data: file: https:`, 2 themes (`dark`/`soft`), `pt/en/es` i18n.

## Requirements

### 1. Outline overlay (floating, not drawer)

- Button appears only when the active file has ≥2 headings (`h1-h3`).
- Click opens a popover (same pattern as `recent-menu` / `lang-menu` via `createPopover` in `src/renderer/src/menus.ts:13`).
- List shows `h1` → `h3` with indentation, text truncated, click scrolls to heading via `scrollIntoView({behavior:'smooth'})` — same logic as `bindContentLinks` anchor handling (`src/renderer/src/main.ts:652`).
- Scroll-spy: highlight the heading currently in viewport via `IntersectionObserver`.
- Not a permanent sidebar: does not change `#app` grid (`36px 38px 1fr auto 24px` in `style.css:164`), overlays `content`.

### 2. Export com opções

- Trigger: popover in titlebar (next to `btn-lang`) or inside About, with 3 actions:
  - **Salvar como PDF** — uses `webContents.printToPDF({printBackground:true})` in main, then `dialog.showSaveDialog` with `pdf` filter, then `fs.writeFile`.
  - **Salvar como HTML** — standalone file with inline CSS (extracted from built `assets/index-*.css`) + `markdown-body` innerHTML + highlight, saved via existing `file:save-as` IPC path pattern.
  - **Copiar como HTML** — same HTML copied via `clipboard:write-text` IPC.
- Preserve current theme (`data-theme` dark/soft) and syntax highlight.
- Show `toast` with `toastSaved` / `saveError` (already localized).

### 3. Busca global (abas + recentes)

- Hotkey `Ctrl+Shift+F` opens a second bar (reuse `.searchbar` styling, `grid-row: 4` — already exists for `Ctrl+F` in `index.html:148`).
- Scope: all tabs in `TabManager.getState().tabs` (in-memory content) + `getRecentFiles()` paths (read via `file:read` IPC, limited to `MAX_FILE_BYTES` from `@shared/constants`).
- Debounce input `180ms` via `debounce` in `@shared/util`.
- Results grouped by file: `fileName` + `filePath` + list of `{line, preview}` matches (case-insensitive, substring). Limit 50 results total.
- Click result → `openPath(filePath)` then `findInPage` highlight + scroll.
- No recursive folder scan, no native `ripgrep` subprocess, no worker in Fase 1.

### Cross-cutting

- No new runtime dependencies.
- `pt/en/es` parity for all new strings (`MsgKey` enforcement in `src/shared/i18n.ts:92`).
- No renaming of `localStorage` keys (`md-reader.theme`, `md-reader.recent`, `md-reader.lang`, `md-reader.update-check`).
- Keep CSS tokens (`var(--bg-*)`, `var(--accent)` etc.) — no hardcoded colors.

## Architecture — Vanilla DOM Incremental

Three new isolated modules, each with single responsibility and well-defined interface:

```
src/renderer/src/outline.ts      — outline building + scroll-spy
src/renderer/src/export.ts       — HTML standalone generation + IPC wrappers
src/renderer/src/globalSearch.ts — search across tabs+recents + result rendering
src/main/index.ts                — new IPC: file:export-pdf, file:export-html (dedicated, not file:save-as reuse)
```

Reuses existing:

- `createPopover` (`menus.ts`) for all popovers.
- `TabManager` (`tabs.ts`), `getRecentFiles` (`recent.ts`), `t` (`i18n.ts`), `escapeHtml/escapeAttr/basenam` (`util.ts`), `debounce` (`@shared/util`), `perfMark` (`@shared/perf`).
- IPC pattern: `ipcMain.handle` + `mdApi` in `preload/index.ts` (like `clipboard:write-text`).

```
Renderer                    Main
outline.build(contentEl) ─┐
                          ├─► contentEl.innerHTML already sanitized by markdown.ts (marked+DOMPurify)
export.savePdf() ───────► ipc file:export-pdf ─► printToPDF → dialog → fs.writeFile → toast
export.saveHtml() ──────► ipc file:export-html → dialog + fs.writeFile (separate from file:save-as frozen-backup logic)
globalSearch.query() ───► tabs in-memory + ipc file:read for recents (with trustPath check; main will trust recents) → results list → openPath
```

## Detailed Design

### Module: `src/renderer/src/outline.ts`

```ts
export interface OutlineItem { id: string; level: 1|2|3; text: string; }
export function buildOutline(contentEl: HTMLElement): OutlineItem[]
export function createOutlinePopover(trigger: HTMLButtonElement, menu: HTMLElement, contentEl: HTMLElement): Popover
```

- Implementation: `contentEl.querySelectorAll('h1[id], h2[id], h3[id], [data-slug]')` — `markdown.ts:101` already generates `id`/`data-slug` via anchors. Text via `textContent.trim()`. Level via `tagName`.
- Cache: `Map<string, OutlineItem[]>` keyed by `tabId` (from `TabManager`). Invalidate on `file:event` `changed`/`removed` in `main.ts` where `renderContent()` is called.
- Scroll-spy: after `renderContent()`, create `IntersectionObserver` on heading elements, threshold `0.5`, update `is-active` class in popover list.
- UI: trigger button `id="btn-outline"` (icon: list) floating over `content` — `position: sticky; top:12px; float:right` or `position:absolute` inside a `position:relative` wrapper `#content-wrap` (not `.content` itself which scrolls). Hidden when `items.length < 2` to avoid stray button scrolling away. Popover: `div#outline-menu.recent-menu` (reuse `.recent-menu` styles) + list `.outline-item.is-active`.

### Module: `src/renderer/src/export.ts`

```ts
export async function exportPdf(): Promise<void>  // invokes api.exportPdf()
export async function exportHtmlStandalone(): Promise<void>
export async function copyAsHtml(): Promise<void>
```

- HTML standalone generation: read `<link rel="stylesheet">` href? At runtime, fetch `document.querySelector('link[rel=stylesheet]')` via `fetch` or reuse `out/renderer/assets/index-*.css` content inlined. Simpler for Fase 1: clone `document.documentElement.outerHTML`, replace CSS link with `<style>${await fetch(cssUrl).then(r=>r.text())}</style>`, keep `data-theme` attribute. Ensure CSP `style-src 'unsafe-inline'` already allows inline (it does).
- IPC additions in `src/shared/api.ts`:
  - `exportPdf: () => Promise<{savedPath:string}|null>`
  - `exportHtml: (html:string, defaultPath:string) => Promise<{savedPath:string}|null>` — new dedicated channel (not `file:save-as`, which has frozen-backup naming via `suggestBackupPath`).
- Main handlers:
  ```ts
  ipcMain.handle('file:export-pdf', async () => {
    if(!win) return null;
    const pdf = await win.webContents.printToPDF({printBackground:true});
    const {canceled, filePath} = await dialog.showSaveDialog(win,{title:t(currentLang,'exportPdf'), filters:[{name:'PDF',extensions:['pdf']} ]});
    if(canceled||!filePath) return null;
    await fs.writeFile(filePath, pdf);
    return {savedPath:filePath};
  });
  ipcMain.handle('file:export-html', async (_evt, {html, defaultPath}:{html:string,defaultPath:string}) => {
    if(typeof html!=='string') return null;
    const {canceled, filePath} = await dialog.showSaveDialog(win!,{title:t(currentLang,'exportHtml'), defaultPath: defaultPath || 'export.html', filters:[{name:'HTML',extensions:['html']} ]});
    if(canceled||!filePath) return null;
    await fs.writeFile(filePath, html,'utf-8');
    return {savedPath:filePath};
  });
  ```

### Module: `src/renderer/src/globalSearch.ts`

```ts
export function bindGlobalSearch(input: HTMLInputElement, resultEl: HTMLElement): void
export async function searchAll(query:string, tabs: TabData[], recents:string[]): Promise<SearchGroup[]>
```

- `SearchGroup = { filePath, fileName, matches: {line:number, preview:string, index:number}[] }`
- For tabs: search `tab.content` (from `TabManager.getState()` — need to expose `content` in `TabData` or via `RenderCache`). Substring `toLowerCase().includes`.
- For recents not already in tabs: `await api.readFile(p)` guarded by `isMarkdown(p)` and `stat.size <= MAX_FILE_BYTES` (main already checks). Errors ignored (file removed).
- Rendering: beneath global search bar, a scrollable list `max-height: 40vh`, each group header `fileName` + `filePath` muted, each match is `<button>` with `preview` where match is `<mark>` highlighted. Click → `manager.activate(tabId) || openPath(filePath)` then `api.findInPage(query,{findNext:false})`.
- Hotkey: `bindShortcuts.ts` add `Ctrl+Shift+F` → toggle global search bar (separate from `Ctrl+F` which toggles `searchbar` id `searchbar`).

### Main process (`src/main/index.ts`)

- Add `ipcMain.handle('file:export-pdf', ...)` inside `registerIpc(win)`.
- No `BrowserView`, no native ripgrep. Keep `sandbox:true`, `spellcheck:false`.
- `will-navigate` and `context-menu` handlers already exist (previous fix) — ensure export does not conflict with `setWindowOpenHandler deny`.

### Preload (`src/preload/index.ts`)

Extend `MdApi` with `exportPdf`, wire to `ipcRenderer.invoke`.

### Renderer integration (`src/renderer/src/main.ts`)

- After `renderContent()` (where `contentEl.innerHTML` set and `scheduleHighlight` done), call `outline.refresh(manager.getActiveTabId(), contentEl)` and toggle `btn-outline` visibility.
- Titlebar: add `btn-export` + `export-menu` `recent-wrap` before `btn-about` (mirrors recent/lang pattern). Use `bindExportMenu` similar to `bindRecentMenu`.
- Shortcuts: `bindShortcuts` gains `Ctrl+Shift+F`.
- i18n: `applyStaticStrings()` updates new buttons via `data-i18n-title`.

### i18n keys (`src/shared/i18n.ts`)

Add to `en/pt/es` (en is source):

- `outlineTooltip: 'Outline'` / `pt: 'Sumário'` / `es: 'Índice'`
- `outlineTitle: 'Outline'` / `pt: 'Sumário'` / `es: 'Índice'`
- `outlineEmpty: 'No headings'` / `pt: 'Sem títulos'` / `es: 'Sin encabezados'`
- `exportTooltip: 'Export'` / `pt: 'Exportar'` / `es: 'Exportar'`
- `exportPdf: 'Save as PDF'` / `pt: 'Salvar como PDF'` / `es: 'Guardar como PDF'`
- `exportHtml: 'Save as HTML'` / `pt: 'Salvar como HTML'` / `es: 'Guardar como HTML'`
- `copyAsHtml: 'Copy as HTML'` / `pt: 'Copiar como HTML'` / `es: 'Copiar como HTML'`
- `globalSearchPlaceholder: 'Search in all tabs'` / `pt: 'Buscar em todas as abas'` / `es: 'Buscar en todas las pestañas'`
- `globalSearchEmpty: 'No matches'` / `pt: 'Nenhum resultado'` / `es: 'Sin resultados'`
- `globalSearchResults: '{n} matches in {m} files'` (reuses params interpolation)

### CSS (`src/renderer/src/style.css`)

- Reuse `.recent-menu` for `#outline-menu` and `#export-menu` (no new palette).
- Outline button: `.btn-outline` floating — use wrapper `#content-wrap {position:relative}` around `#content`, button `position:absolute; top:12px; right:16px; z-index:5` so it stays viewport-fixed while `.content` scrolls. Hide when no outline.
- Global search bar: reuse `.searchbar` — new `id="global-searchbar"` same styles, differentiate by icon.
- `mark` highlight for search preview: `background: var(--accent-soft); color: var(--accent-strong);`

## Data Flow

1. User opens `exemplo.md` → `openPath` → `renderContent()` → `outline.refresh()` → if headings≥2 show `btn-outline`.
2. Click outline item → `document.getElementById(id)?.scrollIntoView({behavior:'smooth'})` + `history`? No, just scroll.
3. `file:event changed` via chokidar → `renderContent` re-runs → outline cache invalidated.
4. Export PDF → `api.exportPdf()` → main `printToPDF` → save dialog → `fs.writeFile` → `toastSaved`.
5. Global search → debounce → `searchAll(query)` → render groups → click result → `openPath` → `findInPage`.

## Error & Edge Cases

- Outline empty (0-1 headings): `btn-outline` hidden, popover not built.
- Headings without `id`/`data-slug` (malformed md): fallback `slug = text.toLowerCase().replace(/\s+/g,'-')`, create id dynamically on element.
- Export PDF cancelled: return `null`, no toast.
- Export HTML: if `fetch(css)` fails, fallback to current DOM without inline (still readable).
- Global search: file too large (`>MAX_FILE_BYTES`) → skip with `openedWithoutWatch`? Actually just skip silently, show 0 matches for that file. Recent file removed → catch and remove from recents.
- `win` closed during export → `win?.webContents` guard, return error `t(currentLang,'saveError')`.
- No `localStorage` or `md-reader.lang` invalid → Fase 1 not affected.
- Performance: outline `IntersectionObserver` disconnect on tab switch; global search capped at 50 matches and `idleSlice` for chunking if needed.

## Verification (no test framework)

`npm run typecheck && npm run build` must pass. Manual in `release/win-unpacked/LiveMD.exe`:

1. Open `exemplo.md` (has many h1/h2) → outline button visible → open → list shows headings → click scrolls → scroll spy highlights.
2. Open empty/1-heading file → outline hidden.
3. Export PDF → save → open PDF → theme + highlight preserved.
4. Export HTML → open html in browser → standalone.
5. Copy as HTML → paste in editor → contains `<style>`.
6. `Ctrl+Shift+F` → type "LiveMD" → shows matches in tabs+recents → click opens tab and highlights.
7. Switch language via globe → outline/export/globalSearch strings follow.
8. Switch dark/soft → overlay/popover colors follow tokens.
9. Drag & drop `exemplo.md` in packaged build still works (file:// gotcha).

## Out of Scope (next Fases)

- Mermaid, KaTeX, footnotes, TOC `[toc]` injection.
- Highlights/annotations persistence, sidebar file tree, pin/reorder tabs.
- Recursive folder search, ripgrep worker, minimap, presentation mode.
- Additional themes, custom CSS file, editable shortcuts.

## README Updates (deferred to Plan)

Fase 1 will add bullets: “Outline overlay”, “Export PDF/HTML”, “Global search across tabs + recents”.

## Risks

- `printToPDF` may miss background in `soft` theme if `printBackground:false` — must be `true`.
- Fetching CSS at export time may hit `file://` CSP — mitigate by reading `out/renderer/assets` via `fs` in main if needed (fallback).
- Global search reading recents via IPC may be slow if recents contain 20 files ×10 MB — cap at 1 MB sample per file (`content.slice(0, 256KB)`) for Fase 1.
