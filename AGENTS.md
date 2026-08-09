# AGENTS.md — LiveMD

Electron 32 (electron-vite 2 + TypeScript, vanilla DOM renderer) Markdown reader with live file-reload (chokidar), tabs, 2 themes, recent-files history, localized UI (pt/en/es) and a passive update indicator. Windows-only packaging (NSIS).

## Commands

```bash
npm run dev          # electron-vite dev (hot-reload; renderer on http://localhost)
npm run typecheck    # tsc -p tsconfig.node.json && tsc -p tsconfig.web.json — run before build
npm run build        # build to out/
npm run build:icon   # regenerate build/icon.png + build/icon.ico + build/installer-header.bmp from build/icon.svg
npm run pack         # build + icon + electron-builder --dir (release/win-unpacked/LiveMD.exe)
npm run dist:win     # build + icon + NSIS installer (release/LiveMD-Setup-1.0.0.exe)
```

**There is no test framework.** Verification = typecheck + build + manual testing in the PACKAGED build (`release/win-unpacked/LiveMD.exe`). Dev-mode-only testing misses real bugs (see drag-drop below).

## Architecture

- `src/main/index.ts` — window, IPC handlers (`file:open-dialog`, `file:read`, `tab:close`, `shell:reveal`, `app:consume-pending`, `app:get-locale`, `app:set-language`, `app:get-version`, `app:open-external`, `app:check-update`), chokidar watchers, single-instance lock, argv/"Abrir com" handling (`extractMarkdownFromArgs`, `deliverOpenPath`).
- `src/preload/index.ts` — exposes `window.mdApi` (contract in `src/shared/api.ts`). `webUtils.getPathForFile` and `clipboard` must be used HERE (Electron 32 removed `File.path`; these APIs do not work from the page).
- `src/renderer/src/` — **plain TS + DOM, NO React**. `main.ts` wires UI (tabs, dialogs, menus, drop, shortcuts); `tabs.ts` = TabManager; `markdown.ts` = marked + DOMPurify + highlight.js; `theme.ts`, `recent.ts`, `i18n.ts` (renderer locale singleton).
- `src/shared/` — `types.ts` (FileEvent, IpcChannel), `api.ts` (MdApi interface), `i18n.ts` (pt/en/es dictionaries + `mapOsLocale`, shared by main and renderer). Adding a UI string = add a key to all three dictionaries (TS enforces parity).
- Aliases `@shared/*`, `@renderer/*` are configured per-target in `electron.vite.config.ts` AND in both tsconfigs — keep in sync.
- `build/installer.nsh` — NSIS custom page; `build/icon.svg` is the single icon source (everything else in `build/` is generated).
- Docs live in `docs/superpowers/` (design specs + implementation plans, committed as workflow artifacts).

## Release & code signing

- `.github/workflows/release.yml` fires on tag push (`v*`): builds unsigned on `windows-latest`, uploads the installer, submits it to SignPath (`signpath/github-action-submit-signing-request@v2`) and publishes the signed exe with `gh release upload --clobber`.
- Reads `secrets.SIGNPATH_API_TOKEN` + `vars.SIGNPATH_ORG_ID/PROJECT_SLUG/POLICY_SLUG` — not yet configured (SignPath Foundation application pending).
- `.signpath/policies/livemd/release-signing.yml` must be renamed to the real `<project-slug>/<signing-policy-slug>.yml` after approval; `CODEOWNERS` locks that directory.
- SignPath requires GitHub-hosted runners and unsigned artifacts (do NOT configure `win.certificateFile`/`CSC_*`).
- Release bodies must mention "Free code signing provided by SignPath.io, certificate by SignPath Foundation" (see `CODE_SIGNING_POLICY.md`).

## Hard-earned gotchas

- **Drag-drop: dev vs packaged behave differently.** On `file://` pages (packaged builds) DataTransfer is in protected mode during `dragenter`/`dragover`: `getAsFile()` returns null and `dataTransfer.files` is empty (electron#9840). Never decide `dropEffect` from names/files during dragover — check `item.kind === 'file'` only, and filter `.md` at `drop`. `will-navigate` must block `file://` navigation AND convert it to an open via `filePathFromFileUrl` + `deliverOpenPath`. Always test drops in the packaged build.
- **EBUSY when packaging while the app is running.** `npm run pack`/`dist:win` fails with `EBUSY` if `release/win-unpacked/LiveMD.exe` is open (files locked). Close the app first.
- **`build/` images are generated and gitignored** (`icon.png`, `icon.ico`, `installer-header.bmp`). Any packaging flow (local or CI) must run `npm run build:icon` first — `pack`/`dist:win` do it automatically, a manual `npx electron-builder` does not.
- **Themes: exactly two — `dark` and `soft`** (`ThemeName` in `theme.ts`). `soft` is the default; there is NO `light` theme (stored `'light'` migrates to `soft`). Toggle = `Ctrl+Shift+T` cycles dark↔soft. All colors are CSS tokens in the two `:root[data-theme='...']` blocks in `style.css` — new UI must use tokens, never hardcoded colors.
- **Never rename localStorage keys** `md-reader.theme` (theme.ts), `md-reader.recent` (recent.ts), `md-reader.lang` (i18n.ts) and `md-reader.update-check` (main.ts). They were deliberately kept when the app was renamed "Markdown Reader" → "LiveMD" — changing them silently loses user theme/history/language. The update check runs at most once per day and only paints a dot on the About button + a "Go to downloads" link in the About dialog.
- **CSP** in `src/renderer/index.html` is `script-src 'self'` — no inline scripts/event handlers; attach listeners via `addEventListener` (renderer already sanitizes markdown with DOMPurify). Static strings are applied via `data-i18n` / `data-i18n-title` / `data-i18n-aria` attributes in `applyStaticStrings()`.
- **IPC/webPreferences**: contextIsolation on, nodeIntegration off, sandbox off — preserve. `app:open-external` only allows the whitelisted repo/releases URLs — keep the whitelist tight.
- **Product identity**: package.json `name: livemd`, `productName: LiveMD`, `appId: com.livemd.app`. NSIS custom page lives in `build/installer.nsh` and registers the `LiveMD.mdfile` ProgID (HKCU, per-user) — keep names in sync when renaming anything.
- **Windows file association**: when the OS already has a user-chosen default for `.md` (`FileExts\.md\UserChoice`), registry defaults are ignored — the installer page detects this and shows "Abrir com → LiveMD → Sempre usar este app" instructions instead of a misleading checkbox.
- `exemplo.md` at repo root is the manual test fixture.
- Code, comments and commits in English; UI strings are localized via `src/shared/i18n.ts` (pt/en/es, OS-detected with manual override in the titlebar; unsupported locales fall back to English). New UI text must be added as a key to all three dictionaries.
