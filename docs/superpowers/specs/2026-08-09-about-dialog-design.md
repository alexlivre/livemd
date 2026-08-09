# About Dialog Design — LiveMD

**Date:** 2026-08-09
**Status:** Approved

## Goal

Add an in-app "About" modal showing app info (name, version, description, author, license, repository link, tech stack), fully localized in pt/en/es, following the existing flat-UI style.

## Requirements

1. Trigger: info ("i") button in the titlebar, next to the theme button — same `btn btn-ghost btn-icon` pattern.
2. Modal overlay: dark backdrop + centered card using CSS tokens (`--bg-elevated`, `--border`, etc.). Closes via X button, `Esc`, or backdrop click.
3. Content (all strings via `t()`):
   - App logo (existing document SVG)
   - LiveMD + version (from `app.getVersion()` — single source of truth = package.json)
   - Short localized description
   - Author: Alex Santos · License: MIT
   - Repository link (opens the browser via `shell.openExternal`)
   - Stack: Electron + TypeScript
4. Security: `app:open-external` accepts **only** the whitelisted repo URL (`https://github.com/alexlivre/livemd`) — anything else is ignored.
5. ~9 new i18n keys in all three dictionaries (pt/en/es).

## Architecture

### IPC additions

- `app:get-version` (invoke) → `app.getVersion()` string.
- `app:open-external` (invoke, `url: string`) → opens via `shell.openExternal` **only if** `url === REPO_URL` (constant `'https://github.com/alexlivre/livemd'` in main). No other URL is ever opened.
- `IpcChannel` type gains both channels; `MdApi` gains `getAppVersion(): Promise<string>` and `openExternal(url: string): Promise<void>`; preload implements both.

### Renderer

- `index.html`: add `#btn-about` button (info icon) in `titlebar-actions` (after `btn-lang`, before `btn-theme`) with `data-i18n-title="aboutTooltip"`; add `#about-modal` overlay markup (hidden by default) with `#about-card`, close button, and content containers: `#about-version`, `#about-desc`, `#about-author`, `#about-license`, `#about-repo-link`, `#about-stack`.
- `main.ts`:
  - `openAbout()` — fills localized content (`aboutDesc`, `aboutVersion` with version from `api.getAppVersion()`, labels), wires repo link click → `api.openExternal(REPO_URL)`.
  - `closeAbout()` — hides modal.
  - Bindings: `btn-about` click → open; close button click → close; backdrop click → close; existing keydown `Esc` handler → close (alongside the existing menus).
- Version fetch: `api.getAppVersion()` once at `openAbout()` (cheap invoke; no caching needed).

### i18n keys (9)

| Key | en | pt | es |
| --- | --- | --- | --- |
| `aboutTooltip` | About LiveMD | Sobre o LiveMD | Acerca de LiveMD |
| `aboutTitle` | About | Sobre | Acerca de |
| `aboutVersion` | Version {v} | Versão {v} | Versión {v} |
| `aboutDesc` | A fast, local Markdown reader with live reload, tabs and syntax highlighting. | Leitor de Markdown rápido e local, com reload automático, abas e destaque de sintaxe. | Lector de Markdown rápido y local, con recarga automática, pestañas y resaltado de sintaxis. |
| `aboutAuthor` | Author | Autor | Autor |
| `aboutLicense` | License | Licença | Licencia |
| `aboutRepo` | Repository | Repositório | Repositorio |
| `aboutStack` | Built with Electron + TypeScript | Feito com Electron + TypeScript | Hecho con Electron + TypeScript |
| `aboutClose` | Close | Fechar | Cerrar |

Author value "Alex Santos", license value "MIT" and the repo URL are non-localized constants.

### CSS

New rules in `style.css` using existing tokens: `.about-backdrop` (fixed, inset 0, rgba backdrop), `.about-card` (centered, `--bg-elevated`, border, radius, shadow like `.recent-menu`), `.about-close`, `.about-link`, `.about-row` (label/value grid). Follow the existing dropdown shadow/border conventions.

## Edge cases

- `app.getVersion()` unavailable (dev) → still returns `1.0.0` from package.json (electron-vite dev uses the packaged version field).
- Repo link blocked → modal still closes; link failure is silent (no crash).
- Modal open while menus open → `Esc` closes menus and modal (all three close paths are no-op safe).
- localStorage/theme interactions: none — modal uses CSS tokens only.

## Verification

- `npm run typecheck` + `npm run build`.
- Manual (packaged build): open modal in all 3 languages (content localized, version shows 1.0.0), close via X/Esc/backdrop, repo link opens the browser, drag & drop still works.

## Out of scope

- Version auto-update checks, changelog, credits list, "check for updates" — future features.
