# About Dialog Implementation Plan — LiveMD

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a localized in-app "About" modal (name, version, description, author, license, repository link, stack) opened from a new info button in the titlebar.

**Architecture:** Two new IPC channels (`app:get-version` via `app.getVersion()`, `app:open-external` with a hard whitelist of the repo URL). The renderer renders a CSS-token modal (`#about-modal`) and fills localized content through the existing i18n singleton; 9 new keys are added to the shared pt/en/es dictionaries.

**Tech Stack:** TypeScript 5.6 (strict), Electron 32, electron-vite 2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-09-about-dialog-design.md`

## Global Constraints

- **No test framework.** Verification = `npm run typecheck` + `npm run build` + manual testing in the packaged build (`npm run pack` → `release/win-unpacked/LiveMD.exe`).
- Code, comments and commits in English. UI strings only via the i18n dictionaries (pt/en/es parity enforced by `Record<MsgKey, string>` typing).
- `app:open-external` accepts ONLY `https://github.com/alexlivre/livemd` — no other URL may ever be opened.
- Security posture unchanged: CSP `script-src 'self'` (listeners via `addEventListener`), contextIsolation on.
- New UI must use CSS tokens, never hardcoded colors.
- Run `npm run typecheck` before every commit.

---

### Task 1: IPC — version + whitelisted external URL

**Files:**
- Modify: `src/shared/types.ts` (IpcChannel)
- Modify: `src/shared/api.ts` (MdApi)
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: nothing new (Task-independent).
- Produces:
  - IPC `'app:get-version'` → `string`
  - IPC `'app:open-external'` (url) → `void`
  - `MdApi.getAppVersion(): Promise<string>`
  - `MdApi.openExternal(url: string): Promise<void>`

- [ ] **Step 1: Extend `IpcChannel` in `src/shared/types.ts`**

```typescript
export type IpcChannel =
  | 'file:open-dialog'
  | 'file:read'
  | 'file:changed'
  | 'file:removed'
  | 'tab:close'
  | 'app:get-locale'
  | 'app:set-language'
  | 'app:get-version'
  | 'app:open-external';
```

- [ ] **Step 2: Extend `MdApi` in `src/shared/api.ts`**

Inside the `MdApi` interface (after `setLanguage`):

```typescript
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
```

- [ ] **Step 3: Implement in `src/preload/index.ts`**

Inside the `api` object (after `setLanguage`):

```typescript
  getAppVersion: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
  openExternal: (url: string) =>
    ipcRenderer.invoke('app:open-external', url) as Promise<void>,
```

- [ ] **Step 4: Add handlers in `src/main/index.ts`**

Add a module-level constant next to `currentLang`:

```typescript
const REPO_URL = 'https://github.com/alexlivre/livemd';
```

Inside `registerIpc(win)` (after the `app:set-language` handler):

```typescript
  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:open-external', async (_evt, url: unknown) => {
    if (url === REPO_URL) {
      await shell.openExternal(REPO_URL);
    }
  });
```

(`shell` is already imported — used by `shell:reveal`.)

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/api.ts src/preload/index.ts src/main/index.ts
git commit -m "feat(about): add version and whitelisted external-URL IPC"
```

---

### Task 2: i18n keys for the About dialog

**Files:**
- Modify: `src/shared/i18n.ts`

**Interfaces:**
- Consumes: nothing (Task-independent; `MsgKey` is derived from `enMessages`).
- Produces: 9 new `MsgKey`s used by Task 3: `aboutTooltip`, `aboutTitle`, `aboutVersion`, `aboutDesc`, `aboutAuthor`, `aboutLicense`, `aboutRepo`, `aboutStack`, `aboutClose`.

- [ ] **Step 1: Add the 9 keys to `enMessages` (before the closing `} as const`)**

```typescript
  aboutTooltip: 'About LiveMD',
  aboutTitle: 'About',
  aboutVersion: 'Version {v}',
  aboutDesc: 'A fast, local Markdown reader with live reload, tabs and syntax highlighting.',
  aboutAuthor: 'Author',
  aboutLicense: 'License',
  aboutRepo: 'Repository',
  aboutStack: 'Built with Electron + TypeScript',
  aboutClose: 'Close'
```

- [ ] **Step 2: Add the same keys to `ptMessages` (before its closing `}`)**

```typescript
  aboutTooltip: 'Sobre o LiveMD',
  aboutTitle: 'Sobre',
  aboutVersion: 'Versão {v}',
  aboutDesc: 'Leitor de Markdown rápido e local, com reload automático, abas e destaque de sintaxe.',
  aboutAuthor: 'Autor',
  aboutLicense: 'Licença',
  aboutRepo: 'Repositório',
  aboutStack: 'Feito com Electron + TypeScript',
  aboutClose: 'Fechar'
```

- [ ] **Step 3: Add the same keys to `esMessages` (before its closing `}`)**

```typescript
  aboutTooltip: 'Acerca de LiveMD',
  aboutTitle: 'Acerca de',
  aboutVersion: 'Versión {v}',
  aboutDesc: 'Lector de Markdown rápido y local, con recarga automática, pestañas y resaltado de sintaxis.',
  aboutAuthor: 'Autor',
  aboutLicense: 'Licencia',
  aboutRepo: 'Repositorio',
  aboutStack: 'Hecho con Electron + TypeScript',
  aboutClose: 'Cerrar'
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: PASS (parity enforced by the `Record<MsgKey, string>` annotations on `ptMessages`/`esMessages`).

- [ ] **Step 5: Commit**

```bash
git add src/shared/i18n.ts
git commit -m "feat(about): add localized about-dialog strings"
```

---

### Task 3: Modal markup, styles and renderer logic

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/src/style.css`
- Modify: `src/renderer/src/main.ts`

**Interfaces:**
- Consumes: `MdApi.getAppVersion`, `MdApi.openExternal` (Task 1); `aboutTooltip`…`aboutClose` keys + `t`, `MESSAGES`, `MsgKey` (Task 2 + existing i18n singleton).
- Produces: DOM `#btn-about`, `#about-modal`, `#about-card`, `#about-close`, `#about-version`, `#about-desc`, `#about-repo-link`; `openAbout()`, `closeAbout()`, `bindAbout()`.

- [ ] **Step 1: Add the info button in `src/renderer/index.html`**

Insert between the `lang-wrap` div and the theme button in `titlebar-actions`:

```html
<button id="btn-about" class="btn btn-ghost btn-icon" title="Sobre o LiveMD" aria-label="Sobre o LiveMD" data-i18n-title="aboutTooltip">
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 16v-4M12 8h.01"/>
  </svg>
</button>
```

- [ ] **Step 2: Add the modal markup in `src/renderer/index.html`**

Insert between the FAB button (`fab-open`) and the statusbar footer:

```html
<div id="about-modal" class="about-backdrop" hidden>
  <div id="about-card" class="about-card" role="dialog" aria-modal="true" aria-labelledby="about-title">
    <button id="about-close" class="about-close" type="button" data-i18n-aria="aboutClose">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6 6 18M6 6l12 12"/>
      </svg>
    </button>
    <div class="about-logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 3 14 8 19 8"/>
        <path d="M9 13l2 2 4-4"/>
      </svg>
    </div>
    <h2 id="about-title" class="about-app-name">LiveMD</h2>
    <div id="about-version" class="about-version"></div>
    <p id="about-desc" class="about-desc"></p>
    <dl class="about-rows">
      <div class="about-row"><dt data-i18n="aboutAuthor">Autor</dt><dd>Alex Santos</dd></div>
      <div class="about-row"><dt data-i18n="aboutLicense">Licença</dt><dd>MIT</dd></div>
      <div class="about-row"><dt data-i18n="aboutRepo">Repositório</dt><dd><button id="about-repo-link" class="about-link" type="button">github.com/alexlivre/livemd</button></dd></div>
    </dl>
    <p class="about-stack" data-i18n="aboutStack">Feito com Electron + TypeScript</p>
  </div>
</div>
```

- [ ] **Step 3: Add styles in `src/renderer/src/style.css`**

Append at the end of the file:

```css
/* ============================================================
   About modal
   ============================================================ */
.about-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}

.about-backdrop[hidden] {
  display: none;
}

.about-card {
  position: relative;
  width: min(420px, calc(100vw - 48px));
  padding: 28px 28px 24px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  text-align: center;
}

.about-close {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.about-close:hover {
  background: var(--bg-tab-hover);
  color: var(--text);
}

.about-logo {
  color: var(--accent);
  margin-bottom: 8px;
}

.about-app-name {
  margin: 0 0 2px;
  font-size: 20px;
}

.about-version {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.about-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
}

.about-rows {
  margin: 0 0 16px;
  text-align: left;
}

.about-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}

.about-row:last-child {
  border-bottom: none;
}

.about-row dt {
  color: var(--text-muted);
  margin: 0;
}

.about-row dd {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.about-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.about-link:hover {
  text-decoration: underline;
}

.about-stack {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 4: Add renderer logic in `src/renderer/src/main.ts`**

Element refs (after `btnLang`/`langMenu`):

```typescript
const btnAbout = document.getElementById('btn-about') as HTMLButtonElement;
const aboutModal = document.getElementById('about-modal') as HTMLDivElement;
const aboutCloseBtn = document.getElementById('about-close') as HTMLButtonElement;
const aboutVersion = document.getElementById('about-version') as HTMLDivElement;
const aboutDesc = document.getElementById('about-desc') as HTMLParagraphElement;
const aboutRepoLink = document.getElementById('about-repo-link') as HTMLButtonElement;

const REPO_URL = 'https://github.com/alexlivre/livemd';
```

Extend `applyStaticStrings()` — append this third loop after the `data-i18n-title` loop (so `about-close` gets its localized aria-label):

```typescript
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const key = el.dataset.i18nAria as MsgKey | undefined;
    if (key && key in MESSAGES.en) el.setAttribute('aria-label', t(key));
  }
```

Add after `bindLangMenu()`:

```typescript
async function openAbout(): Promise<void> {
  const version = await api.getAppVersion();
  aboutVersion.textContent = t('aboutVersion', { v: version });
  aboutDesc.textContent = t('aboutDesc');
  aboutModal.hidden = false;
}

function closeAbout(): void {
  aboutModal.hidden = true;
}

function bindAbout(): void {
  btnAbout.addEventListener('click', () => void openAbout());
  aboutCloseBtn.addEventListener('click', closeAbout);
  aboutRepoLink.addEventListener('click', () => void api.openExternal(REPO_URL));
  aboutModal.addEventListener('click', (evt) => {
    if (evt.target === aboutModal) closeAbout();
  });
}
```

In `bindUi()` add `bindAbout();` after `bindLangMenu();`.

Update the Esc handler to also close the modal:

```typescript
    } else if (evt.key === 'Escape') {
      closeRecentMenu();
      closeLangMenu();
      closeAbout();
    }
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: PASS.

Manual (packaged, `npm run pack` → `release/win-unpacked/LiveMD.exe`):
1. Click the "i" button → modal opens centered with backdrop; shows LiveMD, "Versão 1.0.0" (OS pt-BR), description, Autor Alex Santos, Licença MIT, Repository link, stack line.
2. Click the repo link → browser opens the LiveMD GitHub page.
3. Close via X, Esc, and backdrop click — all three work; app state unaffected.
4. Switch language to English → reopen modal → "Version 1.0.0", English description/labels; Español likewise.
5. Drag & drop `exemplo.md` still works (regression).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/src/style.css src/renderer/src/main.ts
git commit -m "feat(about): add localized about modal with version and repo link"
```

---

### Task 4: README feature bullet

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Features bullet**

After the "Localized UI" bullet:

```markdown
- **About dialog** — info button in the titlebar shows version, author, license and the repository link (opens in the browser)
```

- [ ] **Step 2: Verify + commit**

```bash
git add README.md
git commit -m "docs: mention about dialog in features"
```

---

## Self-Review Notes

- **Spec coverage:** trigger button → Task 3 Step 1; modal + close paths (X/Esc/backdrop) → Tasks 3 Steps 2-4; content list (logo/name/version/desc/author/license/repo/stack) → Tasks 2-3; version via `app.getVersion()` → Task 1; whitelist `app:open-external` → Task 1 Step 4; i18n 9 keys → Task 2; CSS tokens → Task 3 Step 3; README → Task 4. Edge case "version unavailable" → `app.getVersion()` never throws (returns package.json version). Edge case "modal open while menus open" → Esc closes all three (no-op safe). ✓
- **Type consistency:** `getAppVersion`/`openExternal` names match across `MdApi`, preload, and main.ts usage. `aboutVersion`/`aboutDesc`/`aboutRepoLink` DOM ids match markup. `REPO_URL` constant identical in main (`src/main/index.ts`) and renderer (`src/renderer/src/main.ts`) — both literal `'https://github.com/alexlivre/livemd'`. ✓
- **No placeholders:** every step contains complete code. ✓
