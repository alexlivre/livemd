# Code Review Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 17 findings from `docs/improvements.md` (security fixes, small bugs, performance, refactor, and UX/a11y features) as a coherent, tested, shippable sequence.

**Architecture:** Foundation first (Vitest + shared constants/version utilities), then security hardening (navigation, links, sandbox, `file:read` allowlist), then small fixes, performance caching, a `main.ts` refactor, and finally the UX/a11y features (find-in-page, session restore, accessibility, window title, zoom). Each task is independently testable and commits separately.

**Tech Stack:** Electron 32, electron-vite 2, TypeScript 5.6, vanilla DOM, Vitest 2 + jsdom, DOMPurify, marked, highlight.js, chokidar.

## Global Constraints

- Electron 32; `contextIsolation: true`, `nodeIntegration: false` — preserve.
- Preload must use `contextBridge`, `ipcRenderer`, `webUtils`, `clipboard`, `webFrame` only (all sandbox-safe).
- CSP is `script-src 'self'` — attach listeners via `addEventListener`, never inline handlers.
- Never rename localStorage keys `md-reader.theme`, `md-reader.recent`, `md-reader.lang`, `md-reader.update-check`. New keys are allowed.
- UI text is localized via `src/shared/i18n.ts` (pt/en/es). Adding a key requires adding it to all three dictionaries (`en` is source of truth; TS enforces parity).
- Themes are exactly `dark` and `soft` (`soft` is default). All colors are CSS tokens; `soft` `--bg-app` is `#f5f5f5`, `dark` `--bg-app` is `#1a1d23`.
- `app:open-external` whitelist is widened in Task 4 from exact-URL match to a protocol whitelist (`http:`, `https:`, `mailto:`) — this is the reviewed, intentional design required to support markdown links. Keep it to those three protocols.
- Code, comments and commits in English. Chat in pt-BR.
- Verification: `npm run typecheck` + `npm run build`. For Electron-behavior changes (drop, sandbox, find-in-page, zoom, navigation), test in the PACKAGED build (`npm run pack` → `release/win-unpacked/LiveMD.exe`). Close the app before packaging (EBUSY).
- No test framework exists today; this plan introduces Vitest. `npm run typecheck` must be updated so `*.test.ts` files do not break it.

## File Structure

**Created:**
- `vitest.config.ts` — Vitest config (aliases `@shared`, `@renderer`, node env).
- `src/shared/constants.ts` — `MARKDOWN_EXTENSIONS`, `MARKDOWN_EXT_RE`, `ThemeName`, `DEFAULT_THEME`, `THEME_BG_COLORS`, `MAX_FILE_BYTES`.
- `src/shared/version.ts` — `parseVersion`, `versionsDiffer` (moved out of `src/main/index.ts`).
- `src/shared/util.ts` — `fnv1a`, `debounce`.
- `src/renderer/src/util.ts` — `basename`, `errorMessage`, `escapeHtml`, `escapeAttr`.
- `src/renderer/src/renderCache.ts` — `RenderCache` class.
- `src/renderer/src/drop.ts` — drag & drop logic.
- `src/renderer/src/shortcuts.ts` — keydown shortcuts.
- `src/renderer/src/menus.ts` — generic popover + recent/lang dropdowns.
- `src/renderer/src/update.ts` — update check.
- `src/renderer/src/session.ts` — session restore snapshot (localStorage).
- Tests: `src/shared/version.test.ts`, `src/shared/constants.test.ts`, `src/renderer/src/tabs.test.ts`, `src/renderer/src/recent.test.ts`, `src/renderer/src/theme.test.ts`, `src/renderer/src/markdown.test.ts`, `src/renderer/src/renderCache.test.ts`, `src/renderer/src/session.test.ts`.

**Modified:**
- `package.json` — add `test`/`test:watch` scripts, devDeps `vitest`/`jsdom`.
- `tsconfig.node.json`, `tsconfig.web.json` — `exclude` `**/*.test.ts`.
- `src/shared/types.ts` — add IPC channels.
- `src/shared/api.ts` — add `allowRead`, `findInPage`, `stopFind`, `onFoundInPage`, `setZoomFactor`, `getZoomFactor`, `SearchResult`.
- `src/shared/i18n.ts` — new keys.
- `src/main/index.ts` — navigation, sandbox, `file:read` allowlist, size limit, `show:false`, settings persistence.
- `src/preload/index.ts` — new API methods.
- `src/renderer/index.html` — search bar UI.
- `src/renderer/src/style.css` — search bar styles.
- `src/renderer/src/main.ts` — link handler, cache, title, session, refactor imports.
- `src/renderer/src/theme.ts` — import `ThemeName`/`DEFAULT_THEME` from shared.

---

### Task 1: Vitest setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `tsconfig.node.json`, `tsconfig.web.json`

**Interfaces:**
- Produces: `npm test` runs Vitest; `npm run typecheck` ignores `*.test.ts`.

- [ ] **Step 1: Install dev dependencies**

Run: `npm install --save-dev vitest@^2.1.0 jsdom@^25.0.0`
Expected: `vitest` and `jsdom` added to `devDependencies`.

- [ ] **Step 2: Add test scripts**

In `package.json`, in `"scripts"`, after the `"typecheck"` line, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest.config.ts**

Create `vitest.config.ts` at repo root:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
```

- [ ] **Step 4: Exclude test files from typecheck**

In `tsconfig.node.json` and `tsconfig.web.json`, add a top-level `"exclude"` array after `"include"`:

```json
"exclude": ["**/*.test.ts"]
```

(Both files get the identical `"exclude"` key. `vitest.config.ts` is at root and already outside both `include` globs.)

- [ ] **Step 5: Smoke test**

Create `src/shared/version.test.ts` with a placeholder test, then run it.

`src/shared/version.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 test passes.

- [ ] **Step 6: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: exits 0 (the test file is now excluded).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.node.json tsconfig.web.json src/shared/version.test.ts
git commit -m "chore(tests): add Vitest + jsdom setup"
```

---

### Task 2: Shared constants + version utilities

**Files:**
- Create: `src/shared/constants.ts`
- Create: `src/shared/version.ts`
- Create: `src/shared/util.ts`
- Create: `src/shared/version.test.ts` (replace smoke test), `src/shared/constants.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/main.ts`

**Interfaces:**
- Produces:
  - `MARKDOWN_EXTENSIONS: readonly ('md'|'markdown'|'mdown'|'mkd'|'mdx')[]`
  - `MARKDOWN_EXT_RE: RegExp`
  - `ThemeName = 'dark' | 'soft'`, `DEFAULT_THEME: ThemeName`, `THEME_BG_COLORS: Record<ThemeName, string>`, `MAX_FILE_BYTES: number`
  - `parseVersion(value: string): number[]`, `versionsDiffer(a: string, b: string): boolean`
  - `fnv1a(input: string): number`, `debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): (...args: A) => void`
- Consumes: nothing (pure modules).

- [ ] **Step 1: Write the failing tests**

Replace `src/shared/version.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseVersion, versionsDiffer } from './version';

describe('version utils', () => {
  it('parses semver with v prefix', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
  });

  it('pads missing segments with 0', () => {
    expect(parseVersion('1.2')).toEqual([1, 2, 0]);
    expect(parseVersion('1')).toEqual([1, 0, 0]);
  });

  it('treats non-numeric segments as 0', () => {
    expect(parseVersion('1.x.3')).toEqual([1, 0, 3]);
  });

  it('detects differences across any segment', () => {
    expect(versionsDiffer('1.0.0', '1.0.1')).toBe(true);
    expect(versionsDiffer('1.0.0', '1.1.0')).toBe(true);
    expect(versionsDiffer('1.0.0', '2.0.0')).toBe(true);
    expect(versionsDiffer('1.0.0', '1.0.0')).toBe(false);
    expect(versionsDiffer('v1.0.0', '1.0.0')).toBe(false);
  });
});
```

Create `src/shared/constants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MARKDOWN_EXTENSIONS, MARKDOWN_EXT_RE, THEME_BG_COLORS, DEFAULT_THEME } from './constants';
import packageJson from '../../package.json';

describe('constants', () => {
  it('markdown extensions match package.json fileAssociations', () => {
    const assoc = packageJson.build.fileAssociations[0].ext;
    expect([...MARKDOWN_EXTENSIONS].sort()).toEqual([...assoc].sort());
  });

  it('regex matches every supported extension and rejects others', () => {
    for (const ext of MARKDOWN_EXTENSIONS) {
      expect(MARKDOWN_EXT_RE.test(`file.${ext}`)).toBe(true);
    }
    expect(MARKDOWN_EXT_RE.test('file.txt')).toBe(false);
    expect(MARKDOWN_EXT_RE.test('file.MD')).toBe(true);
  });

  it('defines background colors for both themes', () => {
    expect(DEFAULT_THEME).toBe('soft');
    expect(THEME_BG_COLORS.dark).toBe('#1a1d23');
    expect(THEME_BG_COLORS.soft).toBe('#f5f5f5');
  });
});
```

Run: `npm test`
Expected: FAIL — cannot find module `./version`, `./constants`.

- [ ] **Step 2: Create src/shared/constants.ts**

```ts
export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mdx'] as const;

export const MARKDOWN_EXT_RE = /\.(md|markdown|mdown|mkd|mdx)$/i;

export type ThemeName = 'dark' | 'soft';

export const DEFAULT_THEME: ThemeName = 'soft';

export const THEME_BG_COLORS: Record<ThemeName, string> = {
  dark: '#1a1d23',
  soft: '#f5f5f5'
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
```

- [ ] **Step 3: Create src/shared/version.ts**

```ts
export function parseVersion(value: string): number[] {
  const parts = value.replace(/^v/, '').split('.');
  return [0, 1, 2].map((i) => Number.parseInt(parts[i] ?? '0', 10) || 0);
}

export function versionsDiffer(a: string, b: string): boolean {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  return va[0] !== vb[0] || va[1] !== vb[1] || va[2] !== vb[2];
}
```

- [ ] **Step 4: Create src/shared/util.ts**

```ts
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): (...args: A) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = undefined;
      fn(...args);
    }, wait);
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: version (6) + constants (3) pass.

- [ ] **Step 6: Wire src/main/index.ts to shared modules**

In `src/main/index.ts`, add imports at top:

```ts
import { MARKDOWN_EXT_RE, MARKDOWN_EXTENSIONS } from '@shared/constants';
import { parseVersion, versionsDiffer } from '@shared/version';
```

Remove the local `parseVersion` and `versionsDiffer` function definitions (lines 18–27) and the local `SUPPORTED_EXTS` constant (line 29). Replace `SUPPORTED_EXTS.test(filePath)` with `MARKDOWN_EXT_RE.test(filePath)` inside `isMarkdown` (line 32). Replace the dialog filter extensions array (line 155) with `[...MARKDOWN_EXTENSIONS]`.

- [ ] **Step 7: Wire src/renderer/src/main.ts to shared constants**

In `src/renderer/src/main.ts`, add import:

```ts
import { MARKDOWN_EXT_RE } from '@shared/constants';
```

Remove the local `const MARKDOWN_EXT = /\.(md|markdown|mdown|mkd|mdx)$/i;` (line 286) and replace its one usage (line 407) with `MARKDOWN_EXT_RE.test(f.name)`.

- [ ] **Step 8: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add src/shared/constants.ts src/shared/version.ts src/shared/util.ts src/shared/version.test.ts src/shared/constants.test.ts src/main/index.ts src/renderer/src/main.ts
git commit -m "refactor: centralize markdown extensions and version utils in @shared"
```

---

### Task 3: Unit tests for existing pure modules

**Files:**
- Create: `src/renderer/src/tabs.test.ts`
- Create: `src/renderer/src/recent.test.ts`
- Create: `src/renderer/src/theme.test.ts`
- Create: `src/renderer/src/markdown.test.ts`
- Modify: `src/renderer/src/theme.ts`

**Interfaces:**
- Consumes: `TabManager` (from `./tabs`), `recent.ts`, `theme.ts`, `renderMarkdown` (from `./markdown`), `@shared/constants`.
- Produces: coverage of the pure renderer logic (report item 10).

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/src/tabs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TabManager } from './tabs';

function file(filePath: string, content = '# hi'): { filePath: string; fileName: string; content: string; modifiedAt: number } {
  return { filePath, fileName: filePath.split('/').pop() ?? filePath, content, modifiedAt: 1 };
}

describe('TabManager', () => {
  it('adds a tab and makes it active', () => {
    const m = new TabManager();
    const t = m.add(file('/a.md'));
    expect(m.getState().tabs).toHaveLength(1);
    expect(m.getState().activeId).toBe(t.id);
  });

  it('reuses an existing tab for the same path', () => {
    const m = new TabManager();
    m.add(file('/a.md'));
    m.add(file('/a.md', '# changed'));
    expect(m.getState().tabs).toHaveLength(1);
    expect(m.getState().tabs[0].content).toBe('# changed');
  });

  it('closes the active tab and activates a fallback', () => {
    const m = new TabManager();
    const a = m.add(file('/a.md'));
    const b = m.add(file('/b.md'));
    m.close(a.id);
    expect(m.getState().activeId).toBe(b.id);
  });

  it('updateContent is a no-op on identical content', () => {
    const m = new TabManager();
    m.add(file('/a.md'));
    m.updateContent('/a.md', '# hi', 99);
    expect(m.getState().tabs[0].modifiedAt).toBe(1);
    expect(m.getState().tabs[0].content).toBe('# hi');
  });

  it('updateContent updates changed content', () => {
    const m = new TabManager();
    m.add(file('/a.md'));
    m.updateContent('/a.md', '# bye', 99);
    expect(m.getState().tabs[0].content).toBe('# bye');
    expect(m.getState().tabs[0].modifiedAt).toBe(99);
  });

  it('closeByPath removes a tab', () => {
    const m = new TabManager();
    m.add(file('/a.md'));
    m.closeByPath('/a.md');
    expect(m.getState().tabs).toHaveLength(0);
    expect(m.getState().activeId).toBeNull();
  });
});
```

Create `src/renderer/src/recent.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getRecentFiles, recordRecentFile, removeRecentFile, clearRecentFiles } from './recent';

describe('recent files', () => {
  beforeEach(() => localStorage.clear());

  it('records most recent first and dedupes', () => {
    recordRecentFile('/a.md');
    recordRecentFile('/b.md');
    recordRecentFile('/a.md');
    expect(getRecentFiles()).toEqual(['/a.md', '/b.md']);
  });

  it('caps at 10 entries', () => {
    for (let i = 0; i < 12; i++) recordRecentFile(`/f${i}.md`);
    expect(getRecentFiles()).toHaveLength(10);
    expect(getRecentFiles()[0]).toBe('/f11.md');
  });

  it('removes a single file', () => {
    recordRecentFile('/a.md');
    recordRecentFile('/b.md');
    removeRecentFile('/a.md');
    expect(getRecentFiles()).toEqual(['/b.md']);
  });

  it('clears all', () => {
    recordRecentFile('/a.md');
    clearRecentFiles();
    expect(getRecentFiles()).toEqual([]);
  });
});
```

Create `src/renderer/src/theme.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getEffectiveTheme, getStoredTheme, toggleTheme, setTheme } from './theme';

describe('theme', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to soft', () => {
    expect(getEffectiveTheme()).toBe('soft');
  });

  it('migrates legacy light to soft', () => {
    localStorage.setItem('md-reader.theme', 'light');
    expect(getStoredTheme()).toBe('soft');
    expect(getEffectiveTheme()).toBe('soft');
  });

  it('toggles dark <-> soft', () => {
    expect(toggleTheme()).toBe('dark');
    expect(toggleTheme()).toBe('soft');
  });

  it('setTheme persists', () => {
    setTheme('dark');
    expect(getEffectiveTheme()).toBe('dark');
    expect(localStorage.getItem('md-reader.theme')).toBe('dark');
  });
});
```

Create `src/renderer/src/markdown.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown sanitization', () => {
  it('strips script tags', async () => {
    const html = await renderMarkdown('<script>alert(1)</script>\n\nhello');
    expect(html).not.toContain('<script');
    expect(html).toContain('hello');
  });

  it('strips javascript: URLs', async () => {
    const html = await renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('renders headings', async () => {
    const html = await renderMarkdown('# Title');
    expect(html).toContain('Title');
    expect(html).toMatch(/<h1/);
  });
});
```

Run: `npm test`
Expected: FAIL — tabs.test.ts/recent.test.ts/theme.test.ts/markdown.test.ts reference not-yet-correct theme.ts (theme tests will already pass as-is; the FAIL is acceptable to confirm test wiring, then proceed).

- [ ] **Step 2: Update src/renderer/src/theme.ts to use shared types**

In `src/renderer/src/theme.ts`, replace the top of the file:

```ts
import { DEFAULT_THEME, type ThemeName } from '@shared/constants';

export type { ThemeName };

const STORAGE_KEY = 'md-reader.theme';
```

Remove the local `export type ThemeName = 'dark' | 'soft';` (line 1) and the local `const DEFAULT_THEME: ThemeName = 'soft';` (line 4). Everything else stays unchanged.

- [ ] **Step 3: Run tests to verify all pass**

Run: `npm test`
Expected: all suites pass (version, constants, tabs, recent, theme, markdown).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/tabs.test.ts src/renderer/src/recent.test.ts src/renderer/src/theme.test.ts src/renderer/src/markdown.test.ts src/renderer/src/theme.ts
git commit -m "test(renderer): cover TabManager, recent, theme and markdown sanitization"
```

---

### Task 4: Block all navigation + protocol whitelist for external links (report items 1 + main side of 2)

**Files:**
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: none.
- Produces: `will-navigate` blocks every navigation (file:// still opens via `deliverOpenPath`); `app:open-external` accepts only `http:`, `https:`, `mailto:` protocols.

- [ ] **Step 1: Replace the app:open-external handler**

In `src/main/index.ts`, add a module-level constant near `REPO_API` (line 16):

```ts
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
```

Replace the `app:open-external` handler (lines 220–224):

```ts
ipcMain.handle('app:open-external', async (_evt, url: unknown) => {
  if (typeof url !== 'string') return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return;
  await shell.openExternal(url);
});
```

- [ ] **Step 2: Block all will-navigate**

Replace the `will-navigate` handler (lines 268–275):

```ts
mainWindow.webContents.on('will-navigate', (event, url) => {
  event.preventDefault();
  if (!url.startsWith('file://')) return;
  const filePath = filePathFromFileUrl(url);
  if (filePath && isMarkdown(filePath)) {
    deliverOpenPath(filePath);
  }
});
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 4: Manual test (packaged)**

Run `npm run pack`, then in `release/win-unpacked/LiveMD.exe`: open a markdown file whose content contains `[test](https://example.com)`. Click the link.
Expected: the app does NOT navigate away; nothing opens yet (link handling is completed in Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "fix(security): block all navigation and whitelist external protocols"
```

---

### Task 5: Markdown link click handler (report item 2, renderer side)

**Files:**
- Modify: `src/renderer/src/main.ts`

**Interfaces:**
- Consumes: `api.openExternal(url: string)`.
- Produces: `bindContentLinks()` — click delegation on `contentEl` for `a[href]`.

- [ ] **Step 1: Add the handler and bind it**

In `src/renderer/src/main.ts`, add this function near `bindCodeCopy` (after line 452):

```ts
// ---- Markdown link handling (event delegation on the content container) ----
function bindContentLinks(): void {
  contentEl.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) return;
    evt.preventDefault();
    if (/^(https?:|mailto:)/i.test(href)) {
      void api.openExternal(href);
    }
  });
}
```

In `bindUi()` (line 595), add `bindContentLinks();` right after `bindCodeCopy();`.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 3: Manual test (packaged)**

Run `npm run pack`, then in `release/win-unpacked/LiveMD.exe`: open a file with `[test](https://example.com)` and `[mail](mailto:foo@example.com)`.
Expected: clicking opens the default browser/mail client; the app UI stays put. A relative link (e.g. `[x](foo/bar.md)`) does nothing and does not navigate.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/main.ts
git commit -m "feat(renderer): route markdown links through app:open-external"
```

---

### Task 6: Enable renderer sandbox (report item 3)

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Enable sandbox**

In `src/main/index.ts`, in `webPreferences` (line 254), change `sandbox: false` to `sandbox: true`.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Manual test (packaged — sandbox affects the renderer process)**

Run `npm run pack`, then in `release/win-unpacked/LiveMD.exe`: open a file, drop a `.md` file, toggle theme, change language, click a markdown link, use the "About" dialog.
Expected: all features work identically (preload only uses sandbox-safe APIs).

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "security: enable renderer sandbox"
```

---

### Task 7: `file:read` path allowlist (report item 4)

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/main.ts`

**Interfaces:**
- Produces: `api.allowRead(filePath: string): Promise<void>`; new IPC channel `file:allow-read`.
- Main: `trustPath(filePath)`, `readablePaths: Set<string>` seeded by dialog + `deliverOpenPath`; `file:read` rejects paths not in `readablePaths`.
- Consumes: renderer `openPath` calls `allowRead` before `readFile`.

- [ ] **Step 1: Add the IPC channel to the union**

In `src/shared/types.ts`, add `| 'file:allow-read'` to `IpcChannel`.

- [ ] **Step 2: Add allowRead to MdApi**

In `src/shared/api.ts`, in `MdApi`, after `readFile`, add:

```ts
allowRead: (filePath: string) => Promise<void>;
```

- [ ] **Step 3: Expose allowRead in preload**

In `src/preload/index.ts`, in the `api` object, after `readFile`, add:

```ts
allowRead: (filePath: string) => ipcRenderer.invoke('file:allow-read', filePath) as Promise<void>,
```

- [ ] **Step 4: Implement the allowlist in main**

In `src/main/index.ts`, add a module-level set near `watched` (line 10):

```ts
const readablePaths = new Set<string>();
```

Add a helper near `readMarkdownFile`:

```ts
function trustPath(filePath: string): void {
  readablePaths.add(path.resolve(filePath));
}
```

In `file:open-dialog`, inside the loop after `watchFile(filePath, win)`, add `trustPath(filePath);`.

In `deliverOpenPath` (line 140), add `trustPath(filePath);` as the first line.

Add a new handler after `file:read`:

```ts
ipcMain.handle('file:allow-read', (_evt, filePath: unknown) => {
  if (typeof filePath === 'string' && isMarkdown(filePath)) {
    trustPath(filePath);
  }
});
```

Replace the `file:read` handler (lines 184–194) with:

```ts
ipcMain.handle('file:read', async (_evt, filePath: unknown) => {
  if (typeof filePath !== 'string') throw new Error(t(currentLang, 'markdownOnly'));
  const resolved = path.resolve(filePath);
  if (!readablePaths.has(resolved)) throw new Error(t(currentLang, 'markdownOnly'));
  if (!isMarkdown(resolved)) throw new Error(t(currentLang, 'markdownOnly'));
  const { content, modifiedAt } = await readMarkdownFile(resolved);
  watchFile(resolved, win);
  return {
    filePath: resolved,
    fileName: path.basename(resolved),
    content,
    modifiedAt
  };
});
```

- [ ] **Step 5: Authorize reads from the renderer**

In `src/renderer/src/main.ts`, in `openPath` (line 265), add `await api.allowRead(filePath);` before `const file = await api.readFile(filePath);`.

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 7: Manual test (packaged)**

Run `npm run pack`, then in `release/win-unpacked/LiveMD.exe`: open via dialog, via drag-drop, via "Open with" (argv), and via a recent-file click.
Expected: all four flows open successfully (each is authorized). No regression.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/shared/api.ts src/preload/index.ts src/main/index.ts src/renderer/src/main.ts
git commit -m "security: gate file:read behind a session path allowlist"
```

---

### Task 8: Startup flash + language persistence (report items 5 + 6)

**Files:**
- Modify: `src/main/index.ts`

**Interfaces:**
- Produces: `readSettings()` / `writeSettings()` over `userData/settings.json`; window uses `show: false` + `ready-to-show`.

- [ ] **Step 1: Add sync fs import and settings helpers**

In `src/main/index.ts`, add an import for the sync filesystem API:

```ts
import fsSync from 'node:fs';
```

Add near `currentLang` (line 13):

```ts
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

interface Settings {
  language?: AppLanguage;
}

function readSettings(): Settings {
  try {
    return JSON.parse(fsSync.readFileSync(SETTINGS_FILE, 'utf-8')) as Settings;
  } catch {
    return {};
  }
}

function writeSettings(partial: Settings): void {
  const merged = { ...readSettings(), ...partial };
  try {
    fsSync.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fsSync.writeFileSync(SETTINGS_FILE, JSON.stringify(merged), 'utf-8');
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 2: Initialize currentLang from settings**

Change line 13 from:

```ts
let currentLang: AppLanguage = mapOsLocale(app.getLocale());
```

to:

```ts
let currentLang: AppLanguage = readSettings().language ?? mapOsLocale(app.getLocale());
```

Note: `app.getPath('userData')` is available before `app.whenReady()`; this assignment is safe at module load.

- [ ] **Step 3: Persist language on set-language**

Replace the `app:set-language` handler (lines 212–216):

```ts
ipcMain.handle('app:set-language', (_evt, lang: unknown) => {
  if (lang === 'pt' || lang === 'en' || lang === 'es') {
    currentLang = lang;
    writeSettings({ language: lang });
  }
});
```

- [ ] **Step 4: Fix the startup flash**

In `createWindow`, change `backgroundColor: '#1a1d23'` to `backgroundColor: '#f5f5f5'` (the soft/default theme color), and add `show: false` to the `BrowserWindow` options.

After `await mainWindow.loadFile(...)` / `await mainWindow.loadURL(...)` (lines 288–292), add:

```ts
mainWindow.once('ready-to-show', () => mainWindow?.show());
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 6: Manual test (packaged)**

Run `npm run pack`. Launch `release/win-unpacked/LiveMD.exe` with the soft theme and again after switching to dark, and change the language then restart.
Expected: no dark flash on startup (soft theme); the main-process open-dialog title uses the persisted language immediately after restart.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts
git commit -m "fix: remove startup color flash and persist language in main"
```

---

### Task 9: Localized timestamp + file size limit (report items 7 + 9)

**Files:**
- Modify: `src/renderer/src/main.ts`
- Modify: `src/main/index.ts`
- Modify: `src/shared/i18n.ts`

**Interfaces:**
- Consumes: `getEffectiveLang` (renderer), `MAX_FILE_BYTES` (`@shared/constants`), new i18n key `fileTooLarge`.

- [ ] **Step 1: Add the fileTooLarge key to all dictionaries**

In `src/shared/i18n.ts`:
- `enMessages`: add `fileTooLarge: 'File too large (max 10 MB)'`.
- `ptMessages`: add `fileTooLarge: 'Arquivo muito grande (máx. 10 MB)'`.
- `esMessages`: add `fileTooLarge: 'Archivo demasiado grande (máx. 10 MB)'`.

- [ ] **Step 2: Localize the timestamp**

In `src/renderer/src/main.ts`, `formatTimestamp` (lines 212–215), replace the body:

```ts
function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return t('modifiedAt', { time: d.toLocaleTimeString(getEffectiveLang()) });
}
```

(`getEffectiveLang` is already imported.)

- [ ] **Step 3: Enforce the size limit in main**

In `src/main/index.ts`, add import `MAX_FILE_BYTES` from `@shared/constants` (extend the existing `@shared/constants` import from Task 2).

In `readMarkdownFile` (line 72), after the `stat.isFile()` check, add:

```ts
if (stat.size > MAX_FILE_BYTES) throw new Error(t(currentLang, 'fileTooLarge'));
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 5: Manual test**

In dev or packaged: open a file larger than 10 MB (e.g. `fsutil file createnew big.md 11000000` in a temp dir).
Expected: an error status shows "File too large"; app stays responsive.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/main.ts src/main/index.ts src/shared/i18n.ts
git commit -m "feat: localize modified timestamp and enforce 10MB file limit"
```

---

### Task 10: Render cache (report item 8)

**Files:**
- Create: `src/renderer/src/renderCache.ts`
- Create: `src/renderer/src/renderCache.test.ts`
- Modify: `src/renderer/src/main.ts`

**Interfaces:**
- Produces: `RenderCache` with `get(key, content): string | null`, `set(key, content, html)`, `delete(key)`.
- Consumes: `fnv1a` from `@shared/util`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/renderCache.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RenderCache } from './renderCache';

describe('RenderCache', () => {
  it('returns cached html for identical content', () => {
    const c = new RenderCache();
    c.set('/a.md', '# hi', '<h1>hi</h1>');
    expect(c.get('/a.md', '# hi')).toBe('<h1>hi</h1>');
  });

  it('misses when content changed', () => {
    const c = new RenderCache();
    c.set('/a.md', '# hi', '<h1>hi</h1>');
    expect(c.get('/a.md', '# bye')).toBeNull();
  });

  it('deletes an entry', () => {
    const c = new RenderCache();
    c.set('/a.md', '# hi', '<h1>hi</h1>');
    c.delete('/a.md');
    expect(c.get('/a.md', '# hi')).toBeNull();
  });
});
```

Run: `npm test`
Expected: FAIL — cannot find `./renderCache`.

- [ ] **Step 2: Create src/renderer/src/renderCache.ts**

```ts
import { fnv1a } from '@shared/util';

export class RenderCache {
  private entries = new Map<string, { hash: number; html: string }>();

  get(key: string, content: string): string | null {
    const entry = this.entries.get(key);
    if (entry && entry.hash === fnv1a(content)) return entry.html;
    return null;
  }

  set(key: string, content: string, html: string): void {
    this.entries.set(key, { hash: fnv1a(content), html });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}
```

- [ ] **Step 3: Run tests to verify pass**

Run: `npm test`
Expected: renderCache suite passes.

- [ ] **Step 4: Use the cache in renderContent**

In `src/renderer/src/main.ts`, add import:

```ts
import { RenderCache } from './renderCache';
```

Add a module-level instance near `const manager = new TabManager();` (line 56):

```ts
const renderCache = new RenderCache();
```

Replace `renderContent` (lines 189–210) body between finding `active` and `setStatus`:

```ts
let html = renderCache.get(active.filePath, active.content);
if (html === null) {
  html = await renderMarkdown(active.content);
  renderCache.set(active.filePath, active.content, html);
}
contentEl.innerHTML = `<article class="markdown-body">${html}</article>`;
```

- [ ] **Step 5: Evict cache entries on close/removal**

In `onCloseTab` (line 235), after `manager.close(id)`, add `renderCache.delete(removedPath);` (when `removedPath` is non-null).

In `handleFileEvent` `removed` branch (line 247), add `renderCache.delete(event.filePath);`.

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 7: Manual test**

In dev/packaged: open a large file, edit it externally (trigger a chokidar `change`), and verify the tab bar updates instantly while the content re-render is efficient (no visible flicker; unchanged content not re-parsed).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/renderCache.ts src/renderer/src/renderCache.test.ts src/renderer/src/main.ts
git commit -m "perf: cache rendered markdown per tab content hash"
```

---

### Task 11: Split renderer main.ts (report item 12)

**Files:**
- Create: `src/renderer/src/util.ts`
- Create: `src/renderer/src/drop.ts`
- Create: `src/renderer/src/shortcuts.ts`
- Create: `src/renderer/src/menus.ts`
- Create: `src/renderer/src/update.ts`
- Modify: `src/renderer/src/main.ts`

**Interfaces:**
- `util.ts`: `basename(filePath: string): string`, `errorMessage(err: unknown): string`, `escapeHtml(text: string): string`, `escapeAttr(text: string): string`.
- `drop.ts`: `bindDragAndDrop(deps: DropDeps): void` where `DropDeps = { api: MdApi; manager: TabManager; openPath: (filePath: string) => Promise<void>; setStatus: (text: string, kind: 'ok'|'warn'|'err'|'') => void }`.
- `shortcuts.ts`: `bindShortcuts(deps: ShortcutDeps): void` where `ShortcutDeps = { openFiles: () => Promise<void>; closeActiveTab: () => Promise<void>; toggleTheme: () => ThemeName; closeMenus: () => void }`.
- `menus.ts`: `createPopover(trigger, menu): Popover`, `bindRecentMenu(btn, menu, openPath): Popover`, `bindLangMenu(btn, menu): Popover`.
- `update.ts`: `checkForUpdate(api, opts: { onUpdate: (version: string) => void }): Promise<void>`.

- [ ] **Step 1: Create src/renderer/src/util.ts**

```ts
export function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
```

- [ ] **Step 2: Create src/renderer/src/drop.ts**

```ts
import type { MdApi } from '@shared/api';
import { MARKDOWN_EXT_RE } from '@shared/constants';
import { TabManager } from './tabs';
import { t } from './i18n';
import { errorMessage } from './util';

export interface DropDeps {
  api: MdApi;
  manager: TabManager;
  openPath: (filePath: string) => Promise<void>;
  setStatus: (text: string, kind: 'ok' | 'warn' | 'err' | '') => void;
}

function hasDraggedFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      if (dt.items[i].kind === 'file') return true;
    }
    return false;
  }
  return dt.files.length > 0;
}

function collectDroppedFiles(dt: DataTransfer | null): File[] {
  const files: File[] = [];
  if (!dt) return files;
  if (dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) files.push(dt.files[i]);
    return files;
  }
  if (dt.items) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind !== 'file') continue;
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

export function bindDragAndDrop(deps: DropDeps): void {
  const { api, manager, openPath, setStatus } = deps;
  const dropOverlay = document.getElementById('drop-overlay') as HTMLDivElement;

  async function openDroppedFile(f: File): Promise<boolean> {
    try {
      const path = api.getPathForFile(f);
      if (path) {
        await openPath(path);
        return true;
      }
    } catch (err) {
      setStatus(t('dropError', { msg: errorMessage(err) }), 'err');
      return false;
    }

    try {
      const content = await f.text();
      manager.add({
        filePath: `drop://${f.name}`,
        fileName: f.name,
        content,
        modifiedAt: Date.now()
      });
      setStatus(t('openedWithoutWatch', { file: f.name }), 'warn');
      return true;
    } catch (err) {
      setStatus(t('readDroppedError', { msg: errorMessage(err) }), 'err');
      return false;
    }
  }

  let depth = 0;
  const root = document.documentElement;

  root.addEventListener(
    'dragenter',
    (evt) => {
      const dt = evt.dataTransfer;
      if (!dt) return;
      evt.preventDefault();
      depth++;
      if (hasDraggedFiles(dt)) {
        dropOverlay.classList.add('is-visible');
      }
    },
    { capture: true }
  );

  root.addEventListener(
    'dragover',
    (evt) => {
      evt.preventDefault();
      if (evt.dataTransfer) {
        evt.dataTransfer.dropEffect = hasDraggedFiles(evt.dataTransfer) ? 'copy' : 'none';
      }
    },
    { capture: true }
  );

  root.addEventListener(
    'dragleave',
    () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) dropOverlay.classList.remove('is-visible');
    },
    { capture: true }
  );

  root.addEventListener(
    'drop',
    async (evt) => {
      evt.preventDefault();
      depth = 0;
      dropOverlay.classList.remove('is-visible');

      try {
        const files = collectDroppedFiles(evt.dataTransfer);
        if (files.length === 0) {
          setStatus(t('noFileInDrop'), 'warn');
          return;
        }

        const markdownFiles = files.filter((f) => MARKDOWN_EXT_RE.test(f.name));
        if (markdownFiles.length === 0) {
          setStatus(t('noMarkdownInDrop'), 'warn');
          return;
        }

        let opened = 0;
        for (const f of markdownFiles) {
          if (await openDroppedFile(f)) opened++;
        }
        if (opened === markdownFiles.length) {
          setStatus(t('openedViaDrop', { n: opened }), 'ok');
        }
      } catch (err) {
        setStatus(t('dropError', { msg: errorMessage(err) }), 'err');
      }
    },
    { capture: true }
  );

  root.addEventListener(
    'dragend',
    () => {
      depth = 0;
      dropOverlay.classList.remove('is-visible');
    },
    { capture: true }
  );
}
```

- [ ] **Step 3: Create src/renderer/src/shortcuts.ts**

```ts
import type { ThemeName } from '@shared/constants';

export interface ShortcutDeps {
  openFiles: () => Promise<void>;
  closeActiveTab: () => Promise<void>;
  toggleTheme: () => ThemeName;
  closeMenus: () => void;
}

export function bindShortcuts(deps: ShortcutDeps): void {
  window.addEventListener('keydown', (evt) => {
    const isCtrl = evt.ctrlKey || evt.metaKey;
    const key = evt.key.toLowerCase();
    if (isCtrl && key === 'o') {
      evt.preventDefault();
      void deps.openFiles();
    } else if (isCtrl && key === 'w') {
      evt.preventDefault();
      void deps.closeActiveTab();
    } else if (isCtrl && evt.shiftKey && key === 't') {
      evt.preventDefault();
      deps.toggleTheme();
    } else if (evt.key === 'Escape') {
      deps.closeMenus();
    }
  });
}
```

- [ ] **Step 4: Create src/renderer/src/menus.ts**

```ts
import { LANG_OPTIONS } from '@shared/i18n';
import { clearRecentFiles, getRecentFiles } from './recent';
import { getOsLangLabel, getOverride, setOverride, t } from './i18n';
import { basename, escapeAttr, escapeHtml } from './util';

export interface Popover {
  toggle: () => void;
  close: () => void;
  isOpen: () => boolean;
}

export function createPopover(trigger: HTMLButtonElement, menu: HTMLElement): Popover {
  const open = (): void => {
    menu.hidden = false;
    trigger.classList.add('is-active');
    trigger.setAttribute('aria-expanded', 'true');
  };
  const close = (): void => {
    menu.hidden = true;
    trigger.classList.remove('is-active');
    trigger.setAttribute('aria-expanded', 'false');
  };
  const toggle = (): void => {
    if (menu.hidden) open();
    else close();
  };

  trigger.addEventListener('click', (evt) => {
    evt.stopPropagation();
    toggle();
  });

  document.addEventListener('click', (evt) => {
    if (menu.hidden) return;
    const target = evt.target as Node | null;
    if (target && (menu.contains(target) || target === trigger)) return;
    close();
  });

  return { toggle, close, isOpen: () => !menu.hidden };
}

function renderRecentMenu(menu: HTMLElement, openPath: (p: string) => Promise<void>): void {
  const files = getRecentFiles();
  if (files.length === 0) {
    menu.innerHTML = `<div class="recent-empty">${escapeHtml(t('recentEmpty'))}</div>`;
    return;
  }
  menu.innerHTML = `
    <ul class="recent-menu-list">
      ${files
        .map(
          (p) =>
            `<li><button class="recent-menu-item" type="button" data-path="${escapeAttr(p)}" title="${escapeAttr(p)}"><span class="recent-menu-name">${escapeHtml(basename(p))}</span><span class="recent-menu-path">${escapeHtml(p)}</span></button></li>`
        )
        .join('')}
    </ul>
    <button class="recent-clear" type="button">${escapeHtml(t('clearHistory'))}</button>
  `;
  for (const item of menu.querySelectorAll<HTMLButtonElement>('.recent-menu-item')) {
    item.addEventListener('click', () => {
      const path = item.dataset.path;
      if (path) void openPath(path);
    });
  }
  menu.querySelector('.recent-clear')?.addEventListener('click', () => {
    clearRecentFiles();
    renderRecentMenu(menu, openPath);
  });
}

export function bindRecentMenu(
  trigger: HTMLButtonElement,
  menu: HTMLElement,
  openPath: (p: string) => Promise<void>
): Popover {
  const popover = createPopover(trigger, menu);
  trigger.addEventListener('click', () => {
    if (!popover.isOpen()) renderRecentMenu(menu, openPath);
  });
  return popover;
}

function renderLangMenu(menu: HTMLElement): void {
  const items: Array<{ value: 'auto' | 'pt' | 'en' | 'es'; label: string }> = [
    { value: 'auto', label: t('langAuto', { lang: getOsLangLabel() }) },
    ...LANG_OPTIONS
  ];
  menu.innerHTML = `
    <div class="lang-menu-title">${escapeHtml(t('langMenuTitle'))}</div>
    <ul class="recent-menu-list">
      ${items
        .map(
          (item) =>
            `<li><button class="lang-menu-item ${item.value === getOverride() ? 'is-active' : ''}" type="button" data-value="${item.value}"><span class="lang-check" aria-hidden="true">✓</span><span class="recent-menu-name">${escapeHtml(item.label)}</span></button></li>`
        )
        .join('')}
    </ul>
  `;
  for (const item of menu.querySelectorAll<HTMLButtonElement>('.lang-menu-item')) {
    item.addEventListener('click', () => {
      const value = item.dataset.value;
      if (value === 'auto' || value === 'pt' || value === 'en' || value === 'es') {
        if (value !== getOverride()) setOverride(value);
      }
    });
  }
}

export function bindLangMenu(trigger: HTMLButtonElement, menu: HTMLElement): Popover {
  const popover = createPopover(trigger, menu);
  trigger.addEventListener('click', () => {
    if (!popover.isOpen()) renderLangMenu(menu);
  });
  return popover;
}
```

Note: the original `bindRecentMenu`/`bindLangMenu` render on every open and close on click-outside. The above reuses `createPopover` for open/close/outside-click; the trigger's second listener re-renders on open. `closeMenus` (for Esc) is wired in Task 11 Step 6.

- [ ] **Step 5: Create src/renderer/src/update.ts**

```ts
import type { MdApi } from '@shared/api';

const UPDATE_CHECK_KEY = 'md-reader.update-check';

export async function checkForUpdate(
  api: MdApi,
  opts: { onUpdate: (version: string) => void }
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  let lastCheck = '';
  try {
    lastCheck = localStorage.getItem(UPDATE_CHECK_KEY) ?? '';
    localStorage.setItem(UPDATE_CHECK_KEY, today);
  } catch {
    /* localStorage may be disabled — check anyway */
  }
  if (lastCheck === today) return;
  const result = await api.checkUpdate();
  if (result && result.hasUpdate) {
    opts.onUpdate(result.latestVersion.replace(/^v/, ''));
  }
}
```

- [ ] **Step 6: Rewire src/renderer/src/main.ts**

Apply these edits to `src/renderer/src/main.ts`:

1. Add imports:

```ts
import { basename, errorMessage, escapeAttr, escapeHtml } from './util';
import { bindDragAndDrop } from './drop';
import { bindShortcuts } from './shortcuts';
import { bindRecentMenu, bindLangMenu, type Popover } from './menus';
import { checkForUpdate } from './update';
```

2. Delete the local `escapeHtml`, `escapeAttr` (lines 134–140), `basename`, `errorMessage` (lines 256–263) — they now come from `./util`.

3. Delete the entire drag & drop block (lines 285–435: `MARKDOWN_EXT` comment, `hasDraggedFiles`, `collectDroppedFiles`, `openDroppedFile`, `bindDragAndDrop`) — moved to `./drop`.

4. Delete `renderRecentMenu`, `closeRecentMenu`, `toggleRecentMenu`, `bindRecentMenu`, `closeLangMenu`, `toggleLangMenu`, `bindLangMenu`, `renderLangMenu` (lines 454–593) — moved to `./menus`.

5. Delete `checkForUpdate` and the `UPDATE_CHECK_KEY` constant (lines 51 and 633–649) — moved to `./update`.

6. Replace the `keydown` handler in `bindUi` (lines 604–623) and the module-level `bindUi` body. `bindUi` becomes:

```ts
let recentPopover: Popover;
let langPopover: Popover;

function bindUi(): void {
  btnNew.addEventListener('click', () => void openFiles());
  btnTheme.addEventListener('click', () => toggleTheme());
  fabOpen.addEventListener('click', () => void openFiles());
  bindCodeCopy();
  bindContentLinks();

  recentPopover = bindRecentMenu(btnRecent, recentMenu, openPath);
  langPopover = bindLangMenu(btnLang, langMenu);
  bindAbout();

  bindShortcuts({
    openFiles,
    closeActiveTab: async () => {
      const active = manager.getActive();
      if (active) await onCloseTab(active.id);
    },
    toggleTheme,
    closeMenus: () => {
      recentPopover.close();
      langPopover.close();
      closeAbout();
    }
  });

  api.onOpenPath((filePath) => {
    void openPath(filePath);
  });

  void consumePending();
  bindDragAndDrop({ api, manager, openPath, setStatus });
}
```

7. In `bootstrap`, replace `void checkForUpdate();` with:

```ts
void checkForUpdate(api, {
  onUpdate: (v) => {
    updateVersion = v;
    applyStaticStrings();
    btnAbout.classList.add('has-update');
  }
});
```

8. Remove the now-unused import of `clearRecentFiles`, `getRecentFiles`, `recordRecentFile` from `./recent` and `LANG_OPTIONS`/`getOsLangLabel`/`getOverride`/`setOverride` from `./i18n` (they moved into `menus.ts`). Keep `getEffectiveLang`, `initI18n`, `subscribe`, `t` from `./i18n`; keep `removeRecentFile` and `recordRecentFile` from `./recent` (still used in `openFiles`/`openPath`).

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass. Fix any unused-import or type errors.

- [ ] **Step 8: Manual test (packaged)**

Run `npm run pack`, then in `release/win-unpacked/LiveMD.exe`: open files, drag-drop, toggle theme, switch language via menu, use recent menu, Ctrl+O/W/Shift+T, Esc closes menus, click markdown links, About dialog.
Expected: no behavior change from before the refactor.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/util.ts src/renderer/src/drop.ts src/renderer/src/shortcuts.ts src/renderer/src/menus.ts src/renderer/src/update.ts src/renderer/src/main.ts
git commit -m "refactor(renderer): split main.ts into focused modules"
```

---

### Task 12: In-document search via findInPage (report item 13)

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/src/style.css`
- Modify: `src/shared/i18n.ts`
- Modify: `src/renderer/src/main.ts`
- Modify: `src/renderer/src/shortcuts.ts`

**Interfaces:**
- Produces: `api.findInPage(text, options?)`, `api.stopFind()`, `api.onFoundInPage(handler)`; `SearchResult { matches: number; activeMatchOrdinal: number }`.
- IPC channels: `search:find`, `search:stop`; event `search:found`.

- [ ] **Step 1: Add i18n keys**

In `src/shared/i18n.ts`, add to all three dictionaries:
- en: `searchPlaceholder: 'Find in document'`, `searchPrev: 'Previous match'`, `searchNext: 'Next match'`, `searchClose: 'Close search'`.
- pt: `searchPlaceholder: 'Buscar no documento'`, `searchPrev: 'Resultado anterior'`, `searchNext: 'Próximo resultado'`, `searchClose: 'Fechar busca'`.
- es: `searchPlaceholder: 'Buscar en el documento'`, `searchPrev: 'Resultado anterior'`, `searchNext: 'Resultado siguiente'`, `searchClose: 'Cerrar búsqueda'`.

- [ ] **Step 2: Add types + API**

In `src/shared/types.ts`, add to `IpcChannel`: `| 'search:find' | 'search:stop'`.

In `src/shared/api.ts`, add:

```ts
export interface SearchResult {
  matches: number;
  activeMatchOrdinal: number;
}
```

and in `MdApi`:

```ts
findInPage: (text: string, options?: { findNext?: boolean; forward?: boolean }) => Promise<void>;
stopFind: () => Promise<void>;
onFoundInPage: (handler: (result: SearchResult) => void) => () => void;
```

- [ ] **Step 3: Preload**

In `src/preload/index.ts`, import `SearchResult` type and add to `api`:

```ts
findInPage: (text, options) =>
  ipcRenderer.invoke('search:find', text, options) as Promise<void>,
stopFind: () => ipcRenderer.invoke('search:stop') as Promise<void>,
onFoundInPage: (handler) => {
  const listener = (_: unknown, result: SearchResult) => handler(result);
  ipcRenderer.on('search:found', listener);
  return () => ipcRenderer.off('search:found', listener);
},
```

- [ ] **Step 4: Main IPC**

In `src/main/index.ts`, inside `registerIpc` (after `app:check-update`), add:

```ts
ipcMain.handle('search:find', (_evt, text: unknown, options: unknown) => {
  if (typeof text !== 'string' || text.length === 0) {
    mainWindow?.webContents.stopFindInPage('clearSelection');
    return;
  }
  const opts = (options ?? {}) as { findNext?: boolean; forward?: boolean };
  mainWindow?.webContents.findInPage(text, {
    findNext: opts.findNext !== false,
    forward: opts.forward !== false
  });
});

ipcMain.handle('search:stop', () => {
  mainWindow?.webContents.stopFindInPage('clearSelection');
});
```

In `createWindow`, after the `will-navigate` handler, forward the result:

```ts
mainWindow.webContents.on('found-in-page', (_event, result) => {
  mainWindow?.webContents.send('search:found', {
    matches: result.matches,
    activeMatchOrdinal: result.activeMatchOrdinal
  });
});
```

- [ ] **Step 5: Add the search bar UI**

In `src/renderer/index.html`, insert before the closing `</div>` of `#app` (before `<footer id="statusbar">`, around line 148):

```html
<div id="searchbar" class="searchbar" hidden>
  <input id="search-input" type="text" data-i18n-aria="searchPlaceholder" placeholder="Buscar" />
  <span id="search-count" class="search-count"></span>
  <button id="search-prev" class="btn btn-ghost btn-icon" type="button" data-i18n-aria="searchPrev">↑</button>
  <button id="search-next" class="btn btn-ghost btn-icon" type="button" data-i18n-aria="searchNext">↓</button>
  <button id="search-close" class="btn btn-ghost btn-icon" type="button" data-i18n-aria="searchClose">×</button>
</div>
```

- [ ] **Step 6: Search bar styles**

In `src/renderer/src/style.css`, append:

```css
.searchbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-elevated);
  border-top: 1px solid var(--bg-tab-hover);
}
.searchbar[hidden] {
  display: none;
}
.searchbar input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--bg-tab-hover);
  border-radius: 6px;
  background: var(--bg-content);
  color: var(--text);
}
.search-count {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 40px;
  text-align: center;
}
```

- [ ] **Step 7: Wire the search bar in main.ts**

In `src/renderer/src/main.ts`, add refs (near the other `getElementById` calls):

```ts
const searchbar = document.getElementById('searchbar') as HTMLDivElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchCount = document.getElementById('search-count') as HTMLSpanElement;
const searchPrev = document.getElementById('search-prev') as HTMLButtonElement;
const searchNext = document.getElementById('search-next') as HTMLButtonElement;
const searchClose = document.getElementById('search-close') as HTMLButtonElement;
```

Add a function (near `bindAbout`):

```ts
function openSearch(): void {
  searchbar.hidden = false;
  searchInput.focus();
  searchInput.select();
}

function closeSearch(): void {
  searchbar.hidden = true;
  void api.stopFind();
  searchCount.textContent = '';
}

function runSearch(findNext: boolean, forward: boolean): void {
  const text = searchInput.value;
  if (!text) return;
  void api.findInPage(text, { findNext, forward });
}

function bindSearch(): void {
  searchInput.addEventListener('input', () => runSearch(true, true));
  searchInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter') {
      evt.preventDefault();
      runSearch(false, evt.shiftKey ? false : true);
    } else if (evt.key === 'Escape') {
      closeSearch();
    }
  });
  searchPrev.addEventListener('click', () => runSearch(false, false));
  searchNext.addEventListener('click', () => runSearch(false, true));
  searchClose.addEventListener('click', closeSearch);
  api.onFoundInPage((result) => {
    const total = result.matches;
    const current = result.activeMatchOrdinal;
    searchCount.textContent = total > 0 ? `${current}/${total}` : '0/0';
  });
}
```

Call `bindSearch();` inside `bindUi()`.

- [ ] **Step 8: Add the Ctrl+F shortcut**

In `src/renderer/src/shortcuts.ts`, add `onSearch: () => void;` to `ShortcutDeps` and a branch in the handler:

```ts
} else if (isCtrl && key === 'f') {
  evt.preventDefault();
  deps.onSearch();
}
```

In `src/renderer/src/main.ts`, pass `onSearch: openSearch` in the `bindShortcuts({...})` call.

- [ ] **Step 9: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 10: Manual test (packaged)**

Run `npm run pack`. In `release/win-unpacked/LiveMD.exe`: open a long `.md` file, press Ctrl+F, type a word. Expected: matches highlight, count shows `1/N`; Enter/Shift+Enter navigate next/prev; Esc closes and clears.

- [ ] **Step 11: Commit**

```bash
git add src/shared/types.ts src/shared/api.ts src/preload/index.ts src/main/index.ts src/renderer/index.html src/renderer/src/style.css src/shared/i18n.ts src/renderer/src/main.ts src/renderer/src/shortcuts.ts
git commit -m "feat: in-document search with findInPage (Ctrl+F)"
```

---

### Task 13: Session restore (report item 14)

**Files:**
- Create: `src/renderer/src/session.ts`
- Create: `src/renderer/src/session.test.ts`
- Modify: `src/renderer/src/main.ts`

**Interfaces:**
- Produces: `saveSession(s: SessionSnapshot): void`, `loadSession(): SessionSnapshot | null`, `clearSession(): void`; `SessionSnapshot = { tabs: { filePath: string; scrollTop: number }[]; activePath: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/session.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { saveSession, loadSession, clearSession } from './session';

describe('session', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a snapshot', () => {
    saveSession({ tabs: [{ filePath: '/a.md', scrollTop: 42 }], activePath: '/a.md' });
    expect(loadSession()).toEqual({ tabs: [{ filePath: '/a.md', scrollTop: 42 }], activePath: '/a.md' });
  });

  it('returns null when empty', () => {
    expect(loadSession()).toBeNull();
  });

  it('clears the stored session', () => {
    saveSession({ tabs: [{ filePath: '/a.md', scrollTop: 0 }], activePath: '/a.md' });
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
```

Run: `npm test`
Expected: FAIL — cannot find `./session`.

- [ ] **Step 2: Create src/renderer/src/session.ts**

```ts
export interface SessionSnapshot {
  tabs: Array<{ filePath: string; scrollTop: number }>;
  activePath: string | null;
}

const SESSION_KEY = 'md-reader.session';

export function saveSession(snapshot: SessionSnapshot): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

export function loadSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as { tabs?: unknown; activePath?: unknown };
    if (!Array.isArray(p.tabs)) return null;
    return {
      tabs: p.tabs
        .filter((t): t is { filePath: string; scrollTop: number } =>
          typeof t === 'object' && t !== null && typeof (t as { filePath?: unknown }).filePath === 'string'
        )
        .map((t) => ({ filePath: t.filePath, scrollTop: typeof t.scrollTop === 'number' ? t.scrollTop : 0 })),
      activePath: typeof p.activePath === 'string' ? p.activePath : null
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 3: Run tests to verify pass**

Run: `npm test`
Expected: session suite passes.

- [ ] **Step 4: Wire save/restore in main.ts**

In `src/renderer/src/main.ts`, add imports:

```ts
import { saveSession, loadSession } from './session';
import { debounce } from '@shared/util';
```

Add a module-level map near `renderCache`:

```ts
const scrollByPath = new Map<string, number>();
```

Add a function near `consumePending`:

```ts
function snapshotSession(): void {
  const state = manager.getState();
  const tabs = state.tabs.map((tab) => ({
    filePath: tab.filePath,
    scrollTop: scrollByPath.get(tab.filePath) ?? 0
  }));
  const active = state.activeId ? state.tabs.find((t) => t.id === state.activeId) : null;
  saveSession({ tabs, activePath: active ? active.filePath : null });
}

async function restoreSession(): Promise<void> {
  const session = loadSession();
  if (!session || session.tabs.length === 0) return;
  for (const tab of session.tabs) {
    try {
      await openPath(tab.filePath);
    } catch {
      /* openPath already reports errors; continue */
    }
  }
  if (session.activePath) manager.activate(manager.getState().tabs.find((t) => t.filePath === session.activePath)?.id ?? manager.getState().activeId ?? '');
  const savedScroll = session.tabs.find((t) => t.filePath === session.activePath)?.scrollTop ?? 0;
  if (savedScroll > 0) {
    requestAnimationFrame(() => {
      contentEl.scrollTop = savedScroll;
    });
  }
}
```

In `bootstrap`, after `manager.subscribe(...)` registration, extend the subscribe callback to also persist:

```ts
manager.subscribe((state) => {
  renderTabbar(state);
  void renderContent(state);
  snapshotSession();
});
```

Add scroll tracking in `bootstrap` (after `bindUi()`):

```ts
contentEl.addEventListener(
  'scroll',
  debounce(() => {
    const active = manager.getActive();
    if (active) scrollByPath.set(active.filePath, contentEl.scrollTop);
    snapshotSession();
  }, 300)
);
```

In `bootstrap`, add `await restoreSession();` after `bindUi();`.

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 6: Manual test (packaged)**

Run `npm run pack`. In `release/win-unpacked/LiveMD.exe`: open 2 files, scroll one, close the app, reopen.
Expected: both tabs reopen, the previously-active tab is active, and its scroll position is restored.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/session.ts src/renderer/src/session.test.ts src/renderer/src/main.ts
git commit -m "feat: persist open tabs and scroll position across restarts"
```

---

### Task 14: Accessibility + window title (report items 15 + 16)

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/src/main.ts`

**Interfaces:**
- Consumes: DOM refs; `manager.getState()`.

- [ ] **Step 1: aria-live on the status bar**

In `src/renderer/index.html`, change `<div class="status-messages">` to `<div class="status-messages" aria-live="polite">`.

- [ ] **Step 2: Tab accessibility**

In `src/renderer/src/main.ts`, in `renderTabbar`, inside the loop after `el.setAttribute('data-tab-id', tab.id);` and the `is-active` class toggle, add:

```ts
const isActive = tab.id === state.activeId;
el.setAttribute('aria-selected', isActive ? 'true' : 'false');
el.tabIndex = isActive ? 0 : -1;
```

(Replace the existing `if (tab.id === state.activeId) el.classList.add('is-active');` with the `const isActive = ...` + class + aria logic.)

Add arrow-key navigation. In `renderTabbar`, after the loop, add:

```ts
tabsEl.addEventListener('keydown', (evt) => {
  if (evt.key !== 'ArrowLeft' && evt.key !== 'ArrowRight') return;
  const tabs = state.tabs;
  if (tabs.length < 2) return;
  const index = tabs.findIndex((t) => t.id === state.activeId);
  const delta = evt.key === 'ArrowRight' ? 1 : -1;
  const next = tabs[(index + delta + tabs.length) % tabs.length];
  manager.activate(next.id);
  const button = tabsEl.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`);
  button?.focus();
});
```

Note: this listener is re-added on every `renderTabbar` call. To avoid stacking listeners, add a guard — replace the whole `tabsEl` keydown binding so it runs once. Move the keydown binding out of the loop and bind it once in `bindUi` instead, reading the latest state via `manager.getState()`. (Simpler: in `renderTabbar`, keep the loop for buttons but bind the keydown handler once at module init in `bindUi`.)

Final approach: in `renderTabbar`, keep the per-button `aria-selected`/`tabIndex`; add a separate once-bound handler in `bindUi`:

```ts
tabsEl.addEventListener('keydown', (evt) => {
  if (evt.key !== 'ArrowLeft' && evt.key !== 'ArrowRight') return;
  const state = manager.getState();
  const tabs = state.tabs;
  if (tabs.length < 2) return;
  const index = tabs.findIndex((t) => t.id === state.activeId);
  const delta = evt.key === 'ArrowRight' ? 1 : -1;
  const next = tabs[(index + delta + tabs.length) % tabs.length];
  manager.activate(next.id);
  tabsEl.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus();
});
```

- [ ] **Step 3: About modal focus trap + restore**

In `src/renderer/src/main.ts`, modify `openAbout` to focus the close button after showing:

```ts
aboutModal.hidden = false;
aboutCloseBtn.focus();
```

Add a focus trap. In `bindAbout`, add a keydown listener on `aboutModal`:

```ts
let lastFocused: HTMLElement | null = null;
```

Store the trigger: change `btnAbout.addEventListener('click', ...)` to capture `lastFocused = btnAbout;` before opening, and in `closeAbout`, restore focus:

```ts
function closeAbout(): void {
  aboutModal.hidden = true;
  if (lastFocused) lastFocused.focus();
}
```

In `bindAbout`, add:

```ts
aboutModal.addEventListener('keydown', (evt) => {
  if (evt.key !== 'Tab') return;
  const focusable = aboutModal.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (evt.shiftKey && active === first) {
    evt.preventDefault();
    last.focus();
  } else if (!evt.shiftKey && active === last) {
    evt.preventDefault();
    first.focus();
  }
});
```

- [ ] **Step 4: Window title reflects the active file**

In `src/renderer/src/main.ts`, in `renderContent`, after setting `contentEl.innerHTML`, add:

```ts
document.title = `${active.fileName} — LiveMD`;
```

In `renderEmpty`, add:

```ts
document.title = 'LiveMD';
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 6: Manual test**

Run the app (packaged). Expected: tabs are reachable via Left/Right arrow keys and announce as selected; About dialog traps focus and returns focus on close; status changes are announced; window title shows the active file name.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/index.html src/renderer/src/main.ts
git commit -m "feat: improve accessibility and reflect active file in window title"
```

---

### Task 15: Zoom via webFrame (report item 17)

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/shared/api.ts`
- Modify: `src/renderer/src/shortcuts.ts`
- Modify: `src/renderer/src/main.ts`

**Interfaces:**
- Produces: `api.setZoomFactor(factor: number): void`, `api.getZoomFactor(): number`.

- [ ] **Step 1: Add zoom to MdApi**

In `src/shared/api.ts`, add to `MdApi`:

```ts
setZoomFactor: (factor: number) => void;
getZoomFactor: () => number;
```

- [ ] **Step 2: Expose webFrame in preload**

In `src/preload/index.ts`, import `webFrame`:

```ts
import { contextBridge, clipboard, ipcRenderer, webUtils, webFrame } from 'electron';
```

Add to `api`:

```ts
setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
getZoomFactor: () => webFrame.getZoomFactor()
```

- [ ] **Step 3: Zoom state + shortcuts**

In `src/renderer/src/main.ts`, add a module-level constant:

```ts
let zoomFactor = 1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;
```

Add helper functions (near `openSearch`):

```ts
function applyZoom(factor: number): void {
  zoomFactor = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, factor));
  api.setZoomFactor(zoomFactor);
}

function zoomIn(): void {
  applyZoom(zoomFactor + ZOOM_STEP);
}

function zoomOut(): void {
  applyZoom(zoomFactor - ZOOM_STEP);
}

function zoomReset(): void {
  applyZoom(1);
}
```

In `src/renderer/src/shortcuts.ts`, add to `ShortcutDeps`: `zoomIn: () => void; zoomOut: () => void; zoomReset: () => void;` and branches:

```ts
} else if (isCtrl && (key === '=' || key === '+')) {
  evt.preventDefault();
  deps.zoomIn();
} else if (isCtrl && key === '-') {
  evt.preventDefault();
  deps.zoomOut();
} else if (isCtrl && key === '0') {
  evt.preventDefault();
  deps.zoomReset();
}
```

In `src/renderer/src/main.ts`, pass `zoomIn`, `zoomOut`, `zoomReset` into the `bindShortcuts({...})` call.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 5: Manual test (packaged)**

Run `npm run pack`. In `release/win-unpacked/LiveMD.exe`, press Ctrl+`+`, Ctrl+`-`, Ctrl+`0`.
Expected: zoom in/out/reset works; content stays readable; no effect on other shortcuts.

- [ ] **Step 6: Commit**

```bash
git add src/preload/index.ts src/shared/api.ts src/renderer/src/shortcuts.ts src/renderer/src/main.ts
git commit -m "feat: add zoom via webFrame (Ctrl + / - / 0)"
```

---

## Self-Review

**Spec coverage** — every report item is mapped:
- Item 1 → Task 4; Item 2 → Tasks 4+5; Item 3 → Task 6; Item 4 → Task 7; Item 5 → Task 8; Item 6 → Task 8; Item 7 → Task 9; Item 8 → Task 10; Item 9 → Task 9; Item 10 → Tasks 1–3; Item 11 → Task 2 (extensions now centralized; `package.json` drift is prevented by `constants.test.ts`); Item 12 → Task 11; Item 13 → Task 12; Item 14 → Task 13; Item 15 → Task 14; Item 16 → Task 14; Item 17 → Task 15.

**Placeholder scan** — no TODOs, no "handle edge cases", no "similar to Task N". Every code step shows full code.

**Type consistency** — `allowRead`, `findInPage`, `stopFind`, `onFoundInPage`, `setZoomFactor`, `getZoomFactor`, `SearchResult`, `SessionSnapshot`, `RenderCache`, `Popover`, `DropDeps`, `ShortcutDeps` are defined once and reused identically across tasks. `MarkdownEXT_RE`/`MARKDOWN_EXTENSIONS` are used consistently. `getEffectiveLang` and `t` are already imported where used.

**Notes for the executor:**
- The markdown sanitization test (`markdown.test.ts`) relies on DOMPurify binding to the jsdom `window`. If `renderMarkdown` throws at import in jsdom, fall back to `createDOMPurify(window)` in `markdown.ts` (out of scope here, but flagged).
- The `fileTooLarge` error uses the existing error surfacing paths (dialog `showErrorBox`, `openPath` catch → status).
- Tasks 4–10 and 12–15 all edit `src/renderer/src/main.ts`; apply them in task order to keep the edit anchors valid (Task 11 rewrites the surrounding structure after Tasks 4–10).
