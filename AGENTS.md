# AGENTS.md — LiveMD

Electron 32 (electron-vite 2 + TypeScript, vanilla DOM renderer) Markdown reader with live file-reload (chokidar), tabs, 2 themes, recent-files history. Windows-only packaging (NSIS).

## Commands

```bash
npm run dev          # electron-vite dev (hot-reload; renderer on http://localhost)
npm run typecheck    # tsc -p tsconfig.node.json && tsc -p tsconfig.web.json — run before build
npm run build        # build to out/
npm run pack         # build + icon + electron-builder --dir (release/win-unpacked/LiveMD.exe)
npm run dist:win     # build + icon + NSIS installer (release/LiveMD-Setup-1.0.0.exe)
npm run build:icon   # regenerate build/icon.png + build/icon.ico from build/icon.svg
```

**There is no test framework.** Verification = typecheck + build + manual testing in the PACKAGED build (`release/win-unpacked/LiveMD.exe`). Dev-mode-only testing misses real bugs (see drag-drop below).

## Architecture

- `src/main/index.ts` — window, IPC handlers (`file:open-dialog`, `file:read`, `tab:close`, `shell:reveal`, `app:consume-pending`), chokidar watchers, single-instance lock, argv/"Abrir com" handling (`extractMarkdownFromArgs`, `deliverOpenPath`).
- `src/preload/index.ts` — exposes `window.mdApi` (contract in `src/shared/api.ts`). `webUtils.getPathForFile` and `clipboard` must be used HERE (Electron 32 removed `File.path`; these APIs do not work from the page).
- `src/renderer/src/` — **plain TS + DOM, NO React** (the `@vitejs/plugin-react` devDep is vestigial; do not add components/JSX). `main.ts` wires UI; `tabs.ts` = TabManager; `markdown.ts` = marked + DOMPurify + highlight.js; `theme.ts`, `recent.ts`.
- `src/shared/` — `types.ts` (FileEvent, IpcChannel), `api.ts` (MdApi interface).
- Aliases `@shared/*`, `@renderer/*` are configured per-target in `electron.vite.config.ts` AND in both tsconfigs — keep in sync.

## Hard-earned gotchas

- **Drag-drop: dev vs packaged behave differently.** On `file://` pages (packaged builds) DataTransfer is in protected mode during `dragenter`/`dragover`: `getAsFile()` returns null and `dataTransfer.files` is empty (electron#9840). Never decide `dropEffect` from names/files during dragover — check `item.kind === 'file'` only, and filter `.md` at `drop`. `will-navigate` must block `file://` navigation AND convert it to an open via `filePathFromFileUrl` + `deliverOpenPath`. Always test drops in the packaged build.
- **Themes: exactly two — `dark` and `soft`** (`ThemeName` in `theme.ts`). `soft` is the default; there is NO `light` theme (stored `'light'` migrates to `soft`). Toggle = `Ctrl+Shift+T` cycles dark↔soft. All colors are CSS tokens in the two `:root[data-theme='...']` blocks in `style.css` — new UI must use tokens, never hardcoded colors.
- **Never rename localStorage keys** `md-reader.theme` (theme.ts) and `md-reader.recent` (recent.ts). They were deliberately kept when the app was renamed "Markdown Reader" → "LiveMD" — changing them silently loses user theme/history.
- **CSP** in `src/renderer/index.html` is `script-src 'self'` — no inline scripts/event handlers; attach listeners via `addEventListener` (renderer already sanitizes markdown with DOMPurify).
- **IPC/webPreferences**: contextIsolation on, nodeIntegration off, sandbox off — preserve.
- **Product identity**: package.json `name: livemd`, `productName: LiveMD`, `appId: com.livemd.app`. NSIS custom page lives in `build/installer.nsh` and registers the `LiveMD.mdfile` ProgID (HKCU, per-user) — keep names in sync when renaming anything.
- `exemplo.md` at repo root is the manual test fixture.
- Code, comments and commits in English; UI strings in pt-BR.
