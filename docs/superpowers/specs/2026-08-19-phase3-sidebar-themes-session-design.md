# Phase 3 Design — LiveMD: Sidebar + Themes/CSS + Session/Pin

**Date:** 2026-08-19
**Status:** Approved (auto-recommended — vanilla DOM)
**Approach:** Vanilla DOM incremental, no new runtime deps

## Context

Fase 3 final of 3. Fase 1 (outline/export/search) and Fase 2 (highlights/palette/mermaid) done. This adds file navigation and personalization.

## Goal

- **Sidebar** — optional file tree of the active file's folder (chokidar-aware)
- **Themes/CSS** — third theme + custom CSS editor (userData/custom.css)
- **Session/Pin** — pin tabs, reorder via drag, per-file zoom persistence, full session restore

## Requirements

### 1. Sidebar (optional file tree)

- Toggle `Ctrl+B` or button in titlebar (next to outline). When open, grid changes from `36px 38px 1fr auto 24px` to `36px 38px 240px 1fr auto 24px` or flex: sidebar 240px + content.
- Content: list `*.md` files in the folder of the active tab (via `fs.readdir` IPC `folder:list`). Sort by name. Click → `openPath`. Show active file highlighted. Watch folder via chokidar in main (reuse `watched` map) and send `folder:changed` to refresh.
- No recursive, max 100 files, filtered `isMarkdown`. Limit depth 1.
- Persist `md-reader.sidebar` localStorage (boolean).

### 2. Themes + Custom CSS

- Add third theme `light`? Spec says currently dark/soft with soft default and light→soft migration. Fase 3 adds `contrast` or `sepia` as third? Choose `light` as distinct from `soft` (pure white) for accessibility. Keep migration: stored `light` now maps to actual light theme, not soft. Add `ThemeName = 'dark'|'soft'|'light'` in `theme.ts`, new `:root[data-theme='light']` tokens.
- Custom CSS: file `userData/custom.css` edited via in-app editor (textarea in settings modal) or external editor. Main watches file and injects via `win.webContents.insertCSS` on load and on change. Renderer also loads via `<link>` if file exists (via IPC `customCss:load`). Editor has Save/Clear, shows `custom.css` path.
- Theme cycle `Ctrl+Shift+T` now cycles dark→soft→light.

### 3. Session/Pin/Zoom

- **Pin tabs** — `TabManager` gains `pinned: boolean` on `TabData`. Right-click tab → context menu `Pin/Unpin` (extend `context-menu` in main to add Pin item when params `selectionText` empty and tab bar hit? Simpler: renderer `contextmenu` on tab already does reveal; add extra: `Ctrl+P` pins active. Pinned tabs stay left, small width, not closeable via `Ctrl+W` without confirmation.
- **Reorder** — drag `tab` via HTML5 drag (`draggable=true`) → `dragstart`/`dragover`/`drop` updates order in `TabManager.reorder(fromId,toId)` and re-renders tabbar.
- **Per-file zoom** — `Map<filePath, zoom>` persisted in `localStorage md-reader.zoom` or `settings.json`. On `applyZoom`, also save for active file. On `openPath`/`activate`, restore.
- **Full session** — `saveSession` already saves tabs + scroll; extend to save `pinned`, `zoom` map, `sidebar` state. On restore, pinned first.

## Architecture

```
src/renderer/src/sidebar.ts  — folder list, toggle, watch
src/renderer/src/customCss.ts — load/save custom.css via IPC
src/renderer/src/theme.ts    — extend to 3 themes
src/renderer/src/tabs.ts     — add pinned + reorder
src/main/index.ts            — IPC: folder:list, customCss:load/save/watch, theme persistence
```

Reuses `createPopover`, `TabManager`, `debounce`, `t`, `escapeHtml`.

## Detailed Design

### Sidebar (`sidebar.ts`)

```ts
export function toggleSidebar():boolean
export function refreshSidebar(folderPath:string): Promise<void>
export function bindSidebar(toggleBtn:HTMLButtonElement, container:HTMLElement):void
```

- Main IPC `folder:list` returns `string[]` filePaths in folder (filtered, max 100). Uses `fs.readdir` + `isMarkdown`.
- Watch: main already has `watched` per file; add `watchFolder(folder, win)` similarly with chokidar, on change send `folder:event`.
- UI: `div#sidebar` inserted between `#tabbar` and `#content-wrap`, width 240px, `overflow-y:auto`, items `.sidebar-item` with `is-active`.

### Themes (`theme.ts`)

- `export type ThemeName = 'dark'|'soft'|'light'`
- `initTheme()` migration: if stored === 'light' keep as light (previously migrated to soft, now allow). If invalid → soft.
- `toggleTheme()` cycles `['dark','soft','light']`.
- `style.css` add `:root[data-theme='light']` block — copy soft but with `--bg-app:#ffffff` etc for pure white.

### Custom CSS (`customCss.ts`)

- `export async function loadCustomCss():Promise<string>` via `api.loadCustomCss()` (IPC reads userData/custom.css if exists)
- `export async function saveCustomCss(css:string):Promise<void>` via `api.saveCustomCss`
- Main watcher: `chokidar.watch(customCssPath)` on change → `win.webContents.send('custom-css:changed', css)` and `win.webContents.insertCSS(css)`; also on window create insert.

### Tabs (`tabs.ts`)

- Add `pinned?: boolean` to `TabData`.
- Methods: `pin(id)`, `unpin(id)`, `reorder(fromId,toId)` (splices array), `isPinned(id)`.
- `renderTabbar` sorts pinned first, adds `is-pinned` class, `draggable=true`, drag handlers.

## Integration

- `main.ts` bootstrap: load customCss and insert; bind sidebar toggle; on tab activation, call `refreshSidebar(dirname(active.filePath))`.
- Titlebar: add `btn-sidebar` before `btn-export`.
- Shortcuts: `Ctrl+B` sidebar, `Ctrl+Shift+T` theme cycle 3, `Ctrl+P` pin.

## i18n

- `sidebarTooltip` etc., `pin`/`unpin`, `customCssTitle`, etc.

## CSS

- `#app` grid update, `#sidebar` styles, `[data-theme='light']` tokens, `.tab.is-pinned`.

## Data Flow

1. Open file → sidebar refresh → list folder md files.
2. Theme toggle → `toggleTheme` → `documentElement.dataset.theme` + localStorage + `saveSession` + re-insert customCss if needed.
3. Pin → TabManager pin → renderTabbar reorders.

## Edge Cases

- Folder with 0 md files → show empty.
- Custom.css invalid CSS → insertCSS may fail, catch and toast.
- Pin + close: pinned tabs require `Shift+click` or unpin first.

## Verification

`typecheck && test && build` PASS. Manual in packaged: Ctrl+B sidebar, Ctrl+Shift+T cycles 3, custom.css edit, pin/drag.

## Out of Scope

- Recursive tree, git integration, minimap.
