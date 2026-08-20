# Phase 2 Design — LiveMD: Highlights + Command Palette + Mermaid/Math

**Date:** 2026-08-19
**Status:** Approved (auto-recommended — vanilla DOM incremental)
**Approach:** Vanilla DOM, no hard new runtime deps for core; Mermaid/KaTeX as optional progressive enhancement (dynamic import with fallback)

## Context

Fase 2 of 3 (Fase 1 outline/export/search done). This spec covers read-enhancement features that keep LiveMD as a reader (no editor).

## Goal

- **Highlights/Annotations** — select text → add persistent highlight (stored per file, non-destructive, does not modify .md)
- **Command Palette** — `Ctrl+K` fuzzy palette for all actions (open recent, toggle theme, outline, export, search)
- **Mermaid/Math (progressive)** — render ```mermaid and $...$ / $$...$$ if libraries available, otherwise show raw code block with copy

## Requirements

### 1. Highlights

- Trigger: user selects text in `.content`, right-click context menu shows `Highlight` (reuse `context-menu` handler in `src/main/index.ts:414`), or `Ctrl+H`.
- Highlight is `<mark data-hl-id="...">` injected in `contentEl` after render, with CSS `background: var(--accent-soft); border-bottom: 1px solid var(--accent)`.
- Persistence: `Map<filePath, Highlight[]>` stored in `userData/highlights.json` via main IPC `highlights:save`/`highlights:load` (JSON, atomic write). Keyed by `filePath` + `text` + `startOffset` hash + `modifiedAt` guard: if file changes on disk, highlights are validated (text still present via `indexOf`), otherwise marked stale (dimmed) and offer to remove.
- Limit 100 highlights per file, 1000 total. No backend, no new dep.
- UI: small palette to change color (accent / warning / success) and remove. Persisted per file.

### 2. Command Palette

- Hotkey `Ctrl+K` opens centered modal (reuse `about-backdrop` styles) with input + filtered list.
- Source: all commands derived from existing actions — `openFile`, `recentFiles[]`, `toggleTheme`, `outline`, `exportPdf/Html/copy`, `findInPage`, `globalSearch`, `pauseToggle`, `about`, `zoomIn/Out/Reset`. Each has `id`, `label` (i18n), `shortcut`, `action`.
- Filter: case-insensitive substring + simple fuzzy (characters in order). Debounce 60ms.
- Selection: ↑/↓, Enter executes, Esc closes, restores focus to `lastFocused`.
- No new dep; reuse `debounce`, `t`, `escapeHtml`, `createPopover` pattern for items; `max-height: 50vh`.

### 3. Mermaid/Math (optional)

- Markdown code fences ` ```mermaid ` are currently rendered as highlighted code. After Fase 2, if `mermaid` is available via dynamic `import('mermaid')`, render to SVG inside `div.mermaid` after `renderContent` → `await mermaid.render(id, code)`. If import fails (no dep installed or offline), keep code block + show `Copy` button (already exists).
- Math: `$inline$` and `$$block$$` via `katex` dynamic import. If available, replace with `katex.renderToString`. If not, leave raw text. No hard dependency — `package.json` may add `mermaid`/`katex` as optional `dependencies` in future, but Fase 2 ships without them and still passes typecheck/build.

## Architecture

```
src/renderer/src/highlights.ts   — highlight CRUD, persistence via IPC, DOM injection
src/renderer/src/palette.ts      — command registry + fuzzy filter + modal UI
src/renderer/src/mermaidMath.ts  — optional renderers (dynamic import, fallback)
src/main/index.ts                — IPC: highlights:load/save (file: highlights.json in userData)
src/shared/i18n.ts               — new keys for highlights/palette
```

Reuses: `TabManager`, `RenderCache`, `t`, `debounce`, `escapeHtml`, `Toast`, `createPopover` not needed for palette (modal).

## Detailed Design

### Highlights (`highlights.ts`)

```ts
export interface Highlight { id:string; text:string; color:'accent'|'warning'|'success'; createdAt:number }
export function addHighlight(contentEl:HTMLElement, filePath:string, color): Highlight|null // uses window.getSelection
export function renderHighlights(contentEl:HTMLElement, highlights: Highlight[]): void // walks text nodes, wraps matches with <mark>
export async function loadHighlights(filePath:string): Promise<Highlight[]>
export async function saveHighlights(filePath:string, list: Highlight[]): Promise<void>
```

- `addHighlight` gets `selection.toString()` trimmed, length 2-300 chars, finds first occurrence index, creates id `hl-${Date.now()}-${rand}`.
- `renderHighlights` after `renderContent` — re-applies: for each hl, find `contentEl.textContent.indexOf(hl.text)` then wrap via Range API (fallback to innerHTML replace with escaped). Idempotent: clear previous marks first (`contentEl.querySelectorAll('mark[data-hl-id]')` → unwrap).
- Persistence: main stores `app.getPath('userData')/highlights.json` as `{ [filePath]: Highlight[] }`. IPC `highlights:load` returns list; `highlights:save` merges.
- Context menu: extend `webContents` `context-menu` handler to add `Highlight` item when `params.selectionText` 2-300 chars (main). Click → `win.webContents.send('highlight:add', selectionText)` and also via renderer `Ctrl+H` path. For now, simpler: renderer adds `contentEl` `contextmenu` listener that shows custom? But we keep native menu via main: add new template item with `click: () => win.webContents.send('highlight:add', params.selectionText)` and renderer listens `ipcRenderer.on('highlight:add')`.

### Palette (`palette.ts`)

```ts
export interface PaletteCmd { id:string; label:string; shortcut?:string; action:()=>void|Promise<void> }
export function registerCommands(cmds: PaletteCmd[]):void
export function openPalette():void
export function closePalette():void
```

- Registry built in `main.ts` bootstrap from existing functions: `openFiles`, `toggleTheme`, `openGlobalSearch`, `exportPdf`, etc + dynamic recent files at open time.
- Modal HTML added to `index.html` — `div#palette-backdrop.about-backdrop[hidden]` with `div#palette-card.about-card` + input + list `ul#palette-list`.
- Filter: `query.toLowerCase()` split, test `label.toLowerCase().includes(q)` or fuzzy `pos` scan. Limit 20 results.
- Keyboard: Arrow, Enter, Esc, Tab trap similar to About.

### Mermaid/Math (`mermaidMath.ts`)

```ts
export async function renderMermaid(contentEl:HTMLElement):Promise<void>
export async function renderMath(contentEl:HTMLElement):Promise<void>
```

- `renderMermaid`: `contentEl.querySelectorAll('pre code.language-mermaid')` — for each, try `const mermaid = await import('mermaid')` (catch → leave). If ok, `mermaid.initialize({theme: document.documentElement.dataset.theme==='dark'?'dark':'default'})` then `const {svg}=await mermaid.render('m-'+Date.now()+i, codeText)` and replace `pre` with `div.mermaid` containing svg.
- `renderMath`: similar with `import('katex')` and `katex.renderToString`. Inline `$...$` via regex on text nodes (careful not to double). If import fails, no-op.
- Called after `scheduleHighlight` in `renderContent`, fire-and-forget, errors swallowed.

### Main IPC

```ts
const HIGHLIGHTS_FILE = path.join(app.getPath('userData'), 'highlights.json');
ipcMain.handle('highlights:load', async (_e, filePath:string) => { /* read JSON, return list or [] */ });
ipcMain.handle('highlights:save', async (_e, filePath:string, list: Highlight[]) => { /* merge and write */ });
```

- Also extend `context-menu` handler to inject Highlight item (as above) and keep existing copy/selectAll.

### Preload

Add to `MdApi`: `loadHighlights`, `saveHighlights`, `onHighlightAdd(handler)` (`ipcRenderer.on('highlight:add')`).

### Integration `src/renderer/src/main.ts`

- After `renderContent` and `scheduleHighlight`, call `await renderMermaid(contentEl); await renderMath(contentEl); await applyHighlights(filePath, contentEl);`
- Bind `Ctrl+H` in `shortcuts.ts` → `addHighlight`.
- Bind `Ctrl+K` → `openPalette`.
- `palette.ts` registration in `bootstrap` after `bindUi`.

### i18n

Add keys:
- `highlight: 'Highlight'` / `pt: 'Destacar'` / `es: 'Resaltar'`
- `highlightRemove: 'Remove highlight'` / etc.
- `palettePlaceholder: 'Type a command...'` / `pt: 'Digite um comando...'`
- `paletteEmpty: 'No commands'` etc.
- `mermaidError: 'Could not render diagram'` etc.

### CSS

- `mark[data-hl-id]` styles for accent/warning/success using `var(--accent-soft)` etc.
- Palette reuses `about-card` + `recent-menu-list` styles, new `.palette-input`, `.palette-item.is-active`.

## Data Flow

1. Render file → `buildOutline` + `renderMermaid` (optional) + `renderMath` (optional) + `applyHighlights`.
2. User selects text → `context-menu` Highlight → `highlight:add` → `addHighlight` → `saveHighlights` → re-render marks.
3. File changed on disk (chokidar) → `handleFileEvent` → `renderContent` → highlights re-validated (if text gone, dim + offer clean).
4. `Ctrl+K` → `openPalette` → filter → Enter → action → close modal.

## Edge Cases

- Selection >300 chars or <2 → no Highlight item.
- File too large → highlights limited to first 100, stored truncated.
- Highlights file missing/corrupt → return [] and recreate on save.
- Mermaid import fails → leave code block, no error toast.
- Palette with no recent files → only static commands.
- Theme switch → highlights keep color, mermaid re-render on next file open (not live).

## Verification

`npm run typecheck && npm test && npm run build` must pass. Manual in packaged:

1. Open `exemplo.md` with ```mermaid graph TD; A-->B;``` → if mermaid installed shows SVG else code.
2. Select text → right-click Highlight → mark appears, reload file → persists, file edit removing text → highlight dimmed.
3. `Ctrl+K` → type "theme" → filter, Enter toggles, Esc closes.

## Out of Scope (Fase 3)

- File sidebar, custom CSS editor, pin workspace, per-file zoom persistence beyond current session.
