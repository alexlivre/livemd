# LiveMD — Improvement Proposals

Code review findings (2026-08-12). Items grouped by priority; each references the current file:line.

## Security (highest priority)

1. **`will-navigate` does not block http(s) navigation** — `src/main/index.ts:268` only intercepts `file://`. Clicking a plain markdown link (e.g. `[x](https://...)`) navigates the page away from the app UI. Block **all** navigation and open external links via `shell.openExternal` (with a protocol whitelist).
2. **No click handler for markdown links** — the renderer has no click delegation on `a[href]` (`main.ts` only handles `.code-copy`). Combined with item 1, markdown links "break" the app. Add a listener that routes `http(s)`/`mailto` through `app:open-external` and ignores everything else.
3. **`sandbox: false`** (`src/main/index.ts:255`) — the preload only uses `contextBridge`, `ipcRenderer`, `webUtils` and `clipboard`, all available in sandboxed renderers. Worth testing `sandbox: true` (defense in depth).
4. **`file:read` has no origin restriction** — an XSS in the renderer could read any `.md` on disk over IPC. Defense in depth: allow only already-known paths (dialog/recent/drop) or at minimum validate `path.resolve` with no traversal escapes.

## Bugs / small fixes

5. **Color flash on startup** — `backgroundColor: '#1a1d23'` is hardcoded (`src/main/index.ts:249`), but the default theme is `soft`. The window flashes dark. Read the stored theme (userData) and pass the matching color.
6. **`app:set-language` is not persisted in main** (`src/main/index.ts:212`) — after restart, main-process dialogs revert to the OS language until the renderer re-sends. Persist the choice in main.
7. **`formatTimestamp` ignores the language** (`src/renderer/src/main.ts:214`) — `toLocaleTimeString()` without a locale; use the effective language.

## Performance

8. **Full re-render per change event** — `renderContent` re-parses the whole markdown and replaces the entire `innerHTML` on every `file:event`; re-rendering inactive tabs also costs. Cache the HTML per tab (content hash) and only re-render the active tab, plus a light debounce.
9. **No size limit** — `fs.readFile` reads the whole file (`src/main/index.ts:75`). Warn or block above ~10 MB to avoid freezes.

## Tests / architecture

10. **Zero tests** — `TabManager`, `recent.ts`, `theme.ts`, `parseVersion`/`versionsDiffer` and the markdown sanitization are pure, testable units. Adding Vitest covers the main risks at low cost.
11. **Extensions duplicated in 3 places** — `MARKDOWN_EXT` (renderer `main.ts:286`), `SUPPORTED_EXTS` (main `index.ts:29`) and `package.json:79` (fileAssociations). Centralize in a `@shared/constants` module so they cannot drift.
12. **Renderer `main.ts` is 673 lines** — split into `menus.ts`, `drop.ts`, `update.ts`, `shortcuts.ts`; the two dropdowns (recent/lang) are nearly identical and can share a generic popover helper.

## UX / accessibility

13. **In-document search (Ctrl+F)** — `webContents.findInPage` is trivial to expose and is the most requested feature in readers.
14. **Session restore** — persist open tabs + scroll position on close; nothing survives a restart today.
15. **Tab accessibility** — `role="tablist"` without `aria-selected`, no arrow-key navigation (roving tabindex), menus without `aria-expanded`/focus management, "About" modal without focus trap/restore, status bar without `aria-live`.
16. **Window title** — `document.title` is fixed to "LiveMD"; reflecting the active file helps in the taskbar.
17. **Zoom (Ctrl+±)** via `webFrame.setZoomFactor` — free and expected.
