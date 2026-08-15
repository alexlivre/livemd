# LiveMD

> A Markdown reader for Windows that **watches the files you have open** and re-renders them the instant you save. Tabs, syntax highlighting, drag & drop, recent files — all local, no telemetry (only images inside a document load from the web, with `no-referrer`).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Electron 32](https://img.shields.io/badge/Electron-32-blue)](https://www.electronjs.org)
[![TypeScript 5.6](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Windows 10+](https://img.shields.io/badge/Windows-10%2B-0078D6)](https://www.microsoft.com/windows)
[![Release](https://img.shields.io/github/v/release/alexlivre/livemd)](https://github.com/alexlivre/livemd/releases)

**Live reload** · **Tabs** · **Syntax highlighting** · **Search** · **2 themes**

---

## Table of Contents

- [Why this exists](#why-this-exists)
- [Features](#features)
- [Quickstart](#quickstart)
- [Installation](#installation)
- [Usage](#usage)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Configuration](#configuration)
- [Themes](#themes)
- [How auto-reload works](#how-auto-reload-works)
- [How "Open with" works](#how-open-with-works)
- [Architecture](#architecture)
- [Development](#development)
- [Testing](#testing)
- [Security](#security)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [Built with](#built-with)
- [License](#license)
- [Acknowledgments](#acknowledgments)
- [Links](#links)

---

## Why this exists

If you write Markdown, you probably jump between an editor and a preview — or worse, read `.md` files in a text editor that shows raw syntax and never refreshes. LiveMD is the reader you keep open on a second screen:

- **Live reload** — chokidar watches every open file; the tab re-renders as soon as you save, with no manual refresh and no blinking preview panes
- **Tabs** — keep several `.md` files open at once and flip between them
- **Real rendering** — GitHub-flavored Markdown, syntax-highlighted code blocks with a one-click copy button
- **Zero setup for OS integration** — the NSIS installer registers `.md` associations and a single-instance "Open with" flow, so double-clicking any Markdown file just works
- **Local and private** — every file is read from your disk and rendered on your machine. No servers, no accounts, no telemetry, no writes to your files (it's read-only)
- **Fast and light** — no editor bloat, no remote fonts, plain DOM rendering with a custom flat UI

## Features

- **Live file-reload** — save the file in your editor and the open tab updates automatically (chokidar + `awaitWriteFinish` avoids reloading during partial writes)
- **Tabs** — open multiple files (multi-select dialog, drag & drop, or "Open with"); middle-click a tab to close it, right-click to reveal the file in Explorer
- **Syntax highlighting** — 13 languages (JS/TS, Python, Rust, Go, Bash, JSON, SQL, YAML, …) via highlight.js, with a **copy button** on every code block
- **Drag & drop** — drop `.md` files from Explorer anywhere on the window; a "Solte para abrir" overlay shows while dragging, and each file becomes a new tab
- **Recent files** — last 10 opened files in a titlebar dropdown, clearable, click to reopen
- **"Open with" integration** — file associations for `.md`, `.markdown`, `.mdown`, `.mkd`, `.mdx`; single-instance lock focuses the running window and opens the file in a new tab
- **Two themes** — `dark` and `soft` (default), toggled with `Ctrl+Shift+T` or the titlebar button; preference persisted per user
- **Localized UI** — follows the OS language (pt-BR, en-US, es) with a manual override dropdown in the titlebar; unsupported OS locales fall back to English
- **About dialog** — info button in the titlebar shows version, author, license and the repository link (opens in the browser)
- **Update indicator** — a dot on the About button appears when a newer release exists (silent check once a day); the About dialog links to the downloads page
- **In-document search** — `Ctrl+F` opens a search bar (Chromium find-in-page) with match count and next/previous navigation
- **Session restore** — open tabs and their scroll positions are restored on the next launch
- **Zoom** — `Ctrl+` / `Ctrl+-` / `Ctrl+0` adjust the zoom level
- **Secure by default** — Markdown sanitized with DOMPurify, CSP `script-src 'self'`, renderer sandbox on, `contextIsolation` on, `file:read` gated behind a session allowlist; remote **images** render but never leak the reading context (`referrerpolicy="no-referrer"`) and remote **scripts** are impossible
- **NSIS installer** — per-user install (no admin), custom page asking to set LiveMD as the default app for Markdown files
- **Flat UI, no native menus** — the Electron menu bar is removed; every action is an in-window control with shortcuts shown in the status bar

## Quickstart

### End users

```bash
# 1. Download the installer from the Releases page
#    https://github.com/alexlivre/livemd/releases

# 2. Run LiveMD-Setup-1.0.0.exe — no admin required

# 3. Open any .md (double-click, drag & drop, or Ctrl+O)
```

### Developers

```bash
git clone https://github.com/alexlivre/livemd.git
cd livemd
npm install
npm run dev     # electron-vite dev with hot-reload
```

## Installation

### Prerequisites

- **Windows 10+** (x64) for the packaged app
- **Node.js 18+** and **npm 9+** to build from source

### Option A — Windows installer (recommended for end users)

Download `LiveMD-Setup-1.0.0.exe` from the [Releases page](https://github.com/alexlivre/livemd/releases) and run it. The installer is **per-user** (`perMachine: false`), so **no administrator rights are needed** — registry entries go to `HKCU`, not `HKLM`. A custom NSIS page asks whether to make LiveMD the default app for Markdown files.

A portable build (no installer) is also produced: `release/win-unpacked/LiveMD.exe` after `npm run pack`.

### Option B — From source (for contributors)

```bash
git clone https://github.com/alexlivre/livemd.git
cd livemd
npm install
npm run dev        # development with hot-reload
npm run pack       # build + icon + unpacked app in release/win-unpacked/
npm run dist:win   # build + icon + NSIS installer in release/
```

## Usage

| To do this... | ...do that |
| --- | --- |
| Open file(s) | `Ctrl+O`, the "Abrir" FAB (bottom-right), the `+` next to the tabs, or the button on the empty state — native multi-select dialog |
| Open via Explorer | Double-click a `.md` file (if associated), or right-click → **Open with → LiveMD** |
| Open by dragging | Drop `.md` files anywhere in the window; each one becomes a new tab |
| Switch tabs | Click a tab |
| Close a tab | Click `×` on the tab, `Ctrl+W`, or middle-click the tab |
| Find the file on disk | Right-click a tab → reveals it in Windows Explorer |
| Reopen a recent file | Click the clock icon in the titlebar → pick a file (or "Limpar histórico") |
| Toggle theme | `Ctrl+Shift+T` or the sun/moon button in the titlebar |
| Copy a code block | Click the "Copiar" button on any highlighted code block |

The status bar (bottom-left) reports what's happening — `Pronto`, `Lendo: file.md`, `Atualizado: file.md` (after a live reload), `Arquivo removido: file.md` (file deleted on disk), and errors — while the bottom-right shows the last-modified time of the active tab. A subtle flash animation marks every live update.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open files (native dialog) |
| `Ctrl+W` | Close active tab |
| `Ctrl+Shift+T` | Toggle theme (`dark` ↔ `soft`) |
| `Ctrl+F` | Search in the current document |
| `Ctrl+` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |
| `←` / `→` | Cycle through tabs (with a tab focused) |
| `Esc` | Close menus, search, or the About dialog |
| Middle-click on tab | Close that tab |
| Right-click on tab | Reveal the file in Explorer |

## Configuration

LiveMD has **no config files**. The only persisted settings live in `localStorage`:

| Key | Content |
| --- | --- |
| `md-reader.theme` | Theme preference: `dark` or `soft` |
| `md-reader.recent` | Recent-files list, up to 10 paths |
| `md-reader.lang` | UI language override: `auto`, `pt`, `en`, or `es` |
| `md-reader.session` | Last session — open tabs and their scroll positions |
| `md-reader.update-check` | Date of the last silent update check |

The main process also mirrors the selected language in `userData/settings.json` so its native dialogs are localized from a cold start.

> **Note:** these key names are frozen — they were kept when the app was renamed from "Markdown Reader" to "LiveMD" so existing users don't lose their theme or history. Do not rename them.

## Themes

LiveMD ships exactly **two** themes:

- **`soft`** — the default: light, warm, low-contrast reading surface
- **`dark`** — low-light reading

There is **no** `light` theme (a legacy stored value of `'light'` migrates to `soft`). The OS theme preference is intentionally ignored — the user's explicit choice wins. All colors are CSS tokens defined in the two `:root[data-theme='...']` blocks in `style.css`, so every UI element (including syntax highlighting) follows the active theme.

## How auto-reload works

1. When a file is opened, the main process starts a dedicated `chokidar.watch(filePath)`.
2. On change, the main process reads the file and sends a `file:event` with `kind: 'changed'` (content + `mtimeMs`) over IPC.
3. The renderer updates the matching tab's content and re-renders it with a flash animation; the status bar shows `Atualizado: <file>`.
4. Closing the tab calls `tab:close` on the main process, which stops the watcher and frees resources.

`chokidar` is used instead of `fs.watch` because it's more reliable across platforms (especially Windows) and provides `awaitWriteFinish` — a stability window (80 ms) that prevents reloads during partial writes from editors.

If a file is **deleted** on disk, the tab closes automatically with a warning; if reading fails, the error is shown in the status bar.

## How "Open with" works

1. The user double-clicks a `.md` file in Explorer (or uses **Open with → LiveMD**).
2. Windows invokes `LiveMD.exe "C:\path\file.md"`.
3. If an instance is already running, the **single-instance lock** (`requestSingleInstanceLock`) fires `second-instance`; the main process extracts the Markdown path from `argv` (`extractMarkdownFromArgs`), focuses the existing window and sends `app:open-path` over IPC — the renderer opens a new tab.
4. If no instance was running, the path is stored in `pendingOpenPath` and delivered to the renderer right after the window finishes loading (`did-finish-load` / `app:consume-pending`).

The NSIS installer registers the `LiveMD.mdfile` ProgID (HKCU, per-user) for `.md`, `.markdown`, `.mdown`, `.mkd` and `.mdx`.

## Architecture

```
┌────────────────────┐    IPC    ┌──────────────────────────┐   chokidar   ┌──────────────┐
│      Renderer      │ ◄───────► │       Main process       │ ◄──────────► │  .md files   │
│  plain TS + DOM    │  invoke/  │ window, IPC handlers,    │   events     │  on disk     │
│  marked + DOMPurify│  events   │ watchers, single-instance│              │              │
└────────────────────┘           └──────────────────────────┘              └──────────────┘
                                        │ file:read / tab:close / shell:reveal ...
```

**Source layout:**

```
src/
├── main/            # Electron main process
│   └── index.ts     # window, IPC handlers, chokidar watchers, single-instance, "Open with" argv
├── preload/
│   └── index.ts     # contextBridge → window.mdApi (webUtils.getPathForFile, clipboard, webFrame)
├── renderer/        # plain TS + DOM — NO React
│   ├── index.html
│   └── src/
│       ├── main.ts       # wiring: tabs ↔ render ↔ IPC ↔ menus ↔ shortcuts
│       ├── tabs.ts       # TabManager (tabs, active, close/activate/update)
│       ├── markdown.ts   # marked + DOMPurify + highlight.js (13 languages)
│       ├── theme.ts      # dark/soft themes, persistence
│       ├── recent.ts     # recent-files history (localStorage)
│       ├── session.ts    # session restore (tabs + scroll)
│       ├── renderCache.ts # rendered-HTML cache keyed by content hash
│       ├── drop.ts       # drag & drop
│       ├── menus.ts      # generic popover + recent/lang dropdowns
│       ├── shortcuts.ts  # keyboard shortcuts
│       ├── update.ts     # update check
│       ├── util.ts       # basename, errorMessage, escapeHtml, escapeAttr
│       └── style.css     # CSS tokens, both themes, layout
└── shared/           # contract shared by all three layers
    ├── types.ts      # FileEvent, TabModel, IpcChannel
    ├── api.ts        # MdApi interface (window.mdApi)
    ├── i18n.ts       # pt/en/es dictionaries + mapOsLocale
    ├── constants.ts  # markdown extensions, theme names/colors, max file size
    ├── version.ts    # parseVersion / versionsDiffer
    └── util.ts       # fnv1a, debounce
build/
├── icon.svg          # source vector icon
├── icon.ico / icon.png   # generated by scripts/build-icon.mjs
└── installer.nsh     # NSIS script (custom "set as default" page)
scripts/
└── build-icon.mjs    # SVG → PNG → ICO pipeline
```

**IPC channels:**

| Channel | Direction | Purpose |
| --- | --- | --- |
| `file:open-dialog` | renderer → main | Native multi-select open dialog |
| `file:read` | renderer → main | Read a path and start watching it (path must be pre-authorized) |
| `file:allow-read` | renderer → main | Authorize a path for `file:read` |
| `tab:close` | renderer → main | Stop watching a closed tab's file |
| `shell:reveal` | renderer → main | Show a file in Windows Explorer |
| `app:consume-pending` | renderer → main | Fetch the "Open with" path from a cold start |
| `app:get-locale` / `app:set-language` | renderer → main | Get/set the effective UI language |
| `app:get-version` | renderer → main | Read the app version |
| `app:open-external` | renderer → main | Open a whitelisted URL (`http`/`https`/`mailto`) |
| `app:check-update` | renderer → main | Check GitHub releases for a newer version |
| `search:find` / `search:stop` | renderer → main | Control find-in-page |
| `file:event` | main → renderer | `changed` / `removed` / `error` watcher events |
| `app:open-path` | main → renderer | "Open with" path from a second instance |
| `search:found` | main → renderer | find-in-page result (matches, active ordinal) |

**Request flow:**

1. The user opens a file — via dialog (`file:open-dialog`), drag & drop (`webUtils.getPathForFile`), or "Open with" (`app:open-path`).
2. The main process reads the file, returns `{ content, modifiedAt }`, and starts a chokidar watcher for that path.
3. `TabManager` (renderer) creates/activates a tab; `renderMarkdown` (marked → DOMPurify → highlight.js) renders it into `.markdown-body`.
4. On save, chokidar emits `change` → main sends `file:event` → the tab's content updates and re-renders.
5. On tab close, `tab:close` stops the watcher. On window close, all watchers are stopped (`unwatchAll`).

## Development

### Setup

```bash
git clone https://github.com/alexlivre/livemd.git
cd livemd
npm install
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | electron-vite dev server (hot-reload, renderer on localhost) |
| `npm run typecheck` | `tsc` on both `tsconfig.node.json` and `tsconfig.web.json` — **run before building** |
| `npm test` | Run the Vitest unit suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run build` | Production build to `out/` |
| `npm run build:icon` | Regenerate `build/icon.png` + `build/icon.ico` from `build/icon.svg` |
| `npm run pack` | Build + icon + `electron-builder --dir` → `release/win-unpacked/LiveMD.exe` |
| `npm run dist:win` | Build + icon + NSIS installer → `release/LiveMD-Setup-1.0.0.exe` |

### Project conventions

- **Vanilla DOM renderer.** No React, no components/JSX — plain TypeScript and DOM only.
- **TypeScript strict** with per-target tsconfigs; path aliases `@shared/*` and `@renderer/*` are configured in `electron.vite.config.ts` **and** both tsconfigs — keep in sync.
- **Code, comments and commits in English; UI strings are localized via `src/shared/i18n.ts` (pt/en/es — OS-detected with a manual override in the titlebar; unsupported locales fall back to English).**
- **Security posture is fixed:** `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, CSP `script-src 'self'` (no inline scripts — attach listeners with `addEventListener`).
- **Exactly two themes** (`dark`, `soft`) — new UI must use CSS tokens, never hardcoded colors.

## Testing

Unit tests use **Vitest** (`node` environment, `jsdom` for DOM/localStorage-dependent modules). `*.test.ts` files are excluded from `npm run typecheck`.

```bash
npm test            # run the suite once
npm run test:watch  # watch mode
```

Full verification before shipping:

```bash
npm test
npm run typecheck
npm run build
```

…followed by **manual testing in the PACKAGED build** (`release/win-unpacked/LiveMD.exe`), not the dev server. Dev-mode-only testing misses real bugs:

- **Drag & drop behaves differently dev vs packaged.** On `file://` pages the `DataTransfer` is in protected mode during `dragenter`/`dragover` — `getAsFile()` returns `null` and `files` is empty. The code never decides `dropEffect` from names/files during dragover (only `item.kind === 'file'`), and `.md` filtering happens at `drop`. Always test drops in the packaged build.
- **"Open with" requires the packaged app** (ProgID registration) — `exemplo.md` at the repo root is the manual test fixture.

## Security

LiveMD is a local, read-only viewer, and it's built defensively:

- **Sanitized rendering** — every Markdown file is passed through **DOMPurify** before touching the DOM, so malicious HTML in a `.md` file cannot execute.
- **Content Security Policy** — `script-src 'self'`: no inline scripts or inline event handlers; the renderer attaches listeners via `addEventListener`.
- **Sandboxed + isolated renderer** — `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`; the page only talks to the main process through the typed `window.mdApi` bridge (`src/shared/api.ts`).
- **Path allowlist** — `file:read` only accepts paths the user has explicitly opened (dialog, drag & drop, recent files, or "Open with"); arbitrary reads over IPC are rejected.
- **No remote execution** — `window.open` is denied (`setWindowOpenHandler`) and `will-navigate` blocks **all** navigation; a dropped `file://` URL is converted into an open, and external links go through a protocol whitelist (`http`/`https`/`mailto`). Remote images are rendered (`img-src https:`), but DOMPurify tags them with `referrerpolicy="no-referrer"` so image hosts never see which file you are reading, and SVGs loaded via `<img>` are script-sandboxed.
- **Read-only** — LiveMD renders and watches files; it never writes to them. Closing tabs stops the watchers (`tab:close` / `unwatchAll`).
- **No secrets, no telemetry** — no accounts, no API keys, no analytics.

## Limitations

- **Windows-only packaging** — NSIS x64 is the only packaging target. The app can be run in dev mode on macOS/Linux, but installers are Windows-only.
- **Read-only viewer** — LiveMD renders and live-reloads; it does not edit or save files.
- **Exactly two themes** — there is deliberately no `light` theme.
- **Watch scope** — live reload covers files open in tabs; a closed tab's watcher is released.
- **File types** — only Markdown extensions (`.md`, `.markdown`, `.mdown`, `.mkd`, `.mdx`) are accepted by the open dialog and drag & drop.

## Code signing policy

LiveMD installers are currently **unsigned** — Windows SmartScreen may show an "Unknown publisher" warning on first run. Full policy and privacy statement: [CODE_SIGNING_POLICY.md](./CODE_SIGNING_POLICY.md).

## Contributing

Contributions are welcome! TL;DR:

1. Fork & clone
2. Create a feature branch
3. Make focused commits (Conventional Commits, English)
4. Ensure `npm test && npm run typecheck && npm run build` pass, and manually test in the **packaged** build (`npm run pack`)
5. Open a Pull Request against `main`

## Built with

- **[Electron 32](https://www.electronjs.org)** + **[electron-vite 2](https://electron-vite.org)** — desktop shell and build tooling
- **[TypeScript 5.6](https://www.typescriptlang.org)** — strict, end-to-end
- **[marked](https://marked.js.org)** — GitHub-flavored Markdown parsing
- **[DOMPurify](https://github.com/cure53/DOMPurify)** — sanitization
- **[highlight.js](https://highlightjs.org)** — syntax highlighting
- **[chokidar](https://github.com/paulmillr/chokidar)** — reliable cross-platform file watching
- **[electron-builder](https://www.electron.build)** (NSIS) — per-user Windows installer
- **[Vitest](https://vitest.dev)** — unit tests
- **Plain DOM** — no UI framework; everything is vanilla TypeScript and CSS tokens

## License

[MIT](./LICENSE) © 2026 [Alex Santos](https://alexlivre.dev/) ([@alexlivre](https://github.com/alexlivre))

## Acknowledgments

- [Electron](https://www.electronjs.org) — the desktop runtime
- [electron-vite](https://electron-vite.org) — the build pipeline
- [marked](https://marked.js.org) — Markdown parsing
- [DOMPurify](https://github.com/cure53/DOMPurify) — XSS protection
- [highlight.js](https://highlightjs.org) — syntax highlighting
- [chokidar](https://github.com/paulmillr/chokidar) — the file watcher behind live reload
- [electron-builder](https://www.electron.build) — Windows packaging
- [Pi](https://pi.dev) — the AI coding agent (by [Earendil](https://earendil.com)) used to start and shape this project
- [OpenCode](https://github.com/anomalyco/opencode) — the AI-powered CLI used to build, test, and maintain this project

## Links

- **Source code:** [github.com/alexlivre/livemd](https://github.com/alexlivre/livemd)
- **Downloads:** [GitHub Releases](https://github.com/alexlivre/livemd/releases)
- **Issue tracker:** [GitHub Issues](https://github.com/alexlivre/livemd/issues)
- **License:** [MIT](./LICENSE)

---

<p align="center">
  Made with care for the Markdown community.
</p>
