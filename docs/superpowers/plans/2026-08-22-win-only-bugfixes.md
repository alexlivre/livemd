# LiveMD Win-Only Bug-Fix Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 14 confirmed bugs from `BUG_REPORT.md` that apply to the Windows-only build of LiveMD (v1.3.0, commit `c4da373`), prioritized by user-visible impact on Win11.

**Architecture:** Electron main process owns all FS watchers (`chokidar`), the "open with" argv queue and IPC handlers; the sandboxed renderer drives tabs/rendering through `window.mdApi`. Fixes keep that split: watcher lifecycle moves behind an explicit `file:watch` IPC channel, multi-file opens become a queue in main, export re-renders from tab content instead of live DOM, and theme/session fixes stay pure renderer logic.

**Tech Stack:** Electron 43 + electron-vite 2, TypeScript, vanilla DOM renderer, chokidar, marked + DOMPurify + highlight.js, Vitest 2 (no test framework for main-process IPC — verification is typecheck + build + vitest + manual packaged-build tests).

## Global Constraints

- Verification per repo AGENTS.md: `npm run typecheck` ✅, `npm run build` ✅, `npx vitest run` must be **119/119** before each commit.
- Watcher/drag-drop behaviors MUST be manually tested in the packaged build (`npm run pack`, then `release/win-unpacked/LiveMD.exe`) — dev mode hides real bugs.
- Never rename localStorage keys: `md-reader.theme`, `md-reader.recent`, `md-reader.lang`, `md-reader.update-check`.
- Preserve CSP (`script-src 'self'`, no `unsafe-eval`), contextIsolation/sandbox, `setWindowOpenHandler(deny)`, `will-navigate` guard.
- Exactly two user-facing themes (`dark`, `soft`); stored `'light'` migrates to `'soft'`.
- Code, comments, commits in English. No new UI strings unless added to pt/en/es dictionaries in `src/shared/i18n.ts` — this batch avoids new strings entirely.
- Scope is Windows-only: macOS-specific paths are dead code to delete, not preserve.
- Out of scope (do NOT touch): bug #7 (refuted — tests pass 119/119), bug #8 Mermaid/KaTeX (needs a product decision: install deps vs remove dead module), AGENTS.md doc drift (requires explicit user authorization to edit).
- Commit style follows repo history: `type(scope): summary` (lowercase, imperative).

---

## Phase 0 — Cleanup

### Task 1: Remove macOS-only dead code (eliminated bug #1)

LiveMD ships Windows installers only. The `open-file`, `activate` handlers and the darwin check never execute on win32 and would silently diverge from future main-process changes.

**Files:**
- Modify: `src/main/index.ts` (bottom section, ~lines 881–925)

**Interfaces:**
- Produces: clean `app.on('window-all-closed')` / no `open-file`/`activate` handlers. Later tasks edit this same region.

- [ ] **Step 1: Delete the `open-file` handler**

Find and remove this whole block (right after `app.on('second-instance', ...)`):

```typescript
  // macOS file open events
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (app.isReady() && mainWindow) {
      deliverOpenPath(filePath);
    } else {
      pendingOpenPath = filePath;
    }
  });
```

- [ ] **Step 2: Simplify `window-all-closed`**

Replace:

```typescript
  app.on('window-all-closed', () => {
    unwatchAll();
    if (process.platform !== 'darwin') app.quit();
  });
```

with:

```typescript
  app.on('window-all-closed', () => {
    unwatchAll();
    app.quit();
  });
```

- [ ] **Step 3: Delete the `activate` handler**

Remove:

```typescript
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
```

(`BrowserWindow` stays imported — `createWindow()` still uses it.)

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: both pass, zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "refactor(main): remove macOS-only dead code"
```

---

## Phase 1 — P0: core product, user-visible

### Task 2: Update-check version comparator (bug #4)

`versionsDiffer` flags ANY difference as "update available", so running 1.3.0 with an old v1.2.9 release latest shows a false update dot + About banner.

**Files:**
- Modify: `src/shared/version.ts`
- Test: `src/shared/version.test.ts`
- Modify: `src/main/index.ts:10` (import), `src/main/index.ts:~599` (`hasUpdate` call)

**Interfaces:**
- Consumes: existing `parseVersion(value: string): number[]` in `version.ts`.
- Produces: `versionsNewer(a: string, b: string): boolean` — true only if `a > b` component-wise.

- [ ] **Step 1: Read current test file and add failing tests**

Read `src/shared/version.test.ts`. Add `versionsNewer` to its import from `'./version'` and append:

```typescript
describe('versionsNewer', () => {
  it('returns true when candidate is strictly newer', () => {
    expect(versionsNewer('v1.4.0', '1.3.0')).toBe(true);
    expect(versionsNewer('1.3.1', '1.3.0')).toBe(true);
    expect(versionsNewer('v2.0.0', '1.9.9')).toBe(true);
  });

  it('returns false when candidate is equal or older (downgrade is not an update)', () => {
    expect(versionsNewer('v1.2.9', '1.3.0')).toBe(false);
    expect(versionsNewer('1.3.0', '1.3.0')).toBe(false);
    expect(versionsNewer('v0.9.0', '1.3.0')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/shared/version.test.ts`
Expected: FAIL — `versionsNewer` is not exported.

- [ ] **Step 3: Implement**

Append to `src/shared/version.ts` (keep `versionsDiffer` exported — its tests remain):

```typescript
export function versionsNewer(a: string, b: string): boolean {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (va[0] !== vb[0]) return va[0] > vb[0];
  if (va[1] !== vb[1]) return va[1] > vb[1];
  return va[2] > vb[2];
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/shared/version.test.ts`
Expected: PASS (existing 4 + new 2).

- [ ] **Step 5: Wire into main**

First confirm remaining `versionsDiffer` usages: `rg "versionsDiffer" src/main/index.ts` — expected output: only the import line and the call site below.

In `src/main/index.ts`, update the import (line 10):

```typescript
import { parseVersion, versionsDiffer, versionsNewer } from '@shared/version';
```

and replace the return inside the `app:check-update` handler (~line 599):

```typescript
      return { latestVersion: latest, hasUpdate: versionsNewer(latest, app.getVersion()) };
```

(Keep `versionsDiffer` in the import ONLY if grep shows another usage besides line 599; otherwise drop it.)

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: typecheck/build pass; 121/121 tests.

- [ ] **Step 7: Commit**

```bash
git add src/shared/version.ts src/shared/version.test.ts src/main/index.ts
git commit -m "fix(update): only flag releases newer than the running version"
```

---

### Task 3: Multi-file "Abrir com" queue (bug #9)

Windows multi-select "Open with" passes every path via argv, but `extractMarkdownFromArgs` keeps only the first and `pendingOpenPath` is a single slot — files 2..n are silently dropped.

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/shared/api.ts:46`
- Modify: `src/preload/index.ts:15-16`
- Modify: `src/renderer/src/main.ts:824-830`

**Interfaces:**
- Produces: `consumePendingPaths(): Promise<string[]>` on MdApi (replaces `consumePendingPath`). Main holds `pendingOpenPaths: string[]`.

- [ ] **Step 1: Main — queue state**

Replace (line 38):

```typescript
let pendingOpenPath: string | null = null;
```

with:

```typescript
let pendingOpenPaths: string[] = [];
```

- [ ] **Step 2: Main — collect ALL argv markdown paths**

Replace `extractMarkdownFromArgs` (lines 259–276) with:

```typescript
function extractMarkdownPaths(argv: string[]): string[] {
  // Skip the executable; collect every arg ending with a Markdown extension.
  // Exclude flags (starting with "-") and the "." used in dev.
  const found: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || arg.startsWith('-')) continue;
    if (arg === '.') continue;
    if (isMarkdown(arg)) {
      try {
        found.push(path.resolve(arg));
      } catch {
        found.push(arg);
      }
    }
  }
  return found;
}
```

- [ ] **Step 3: Main — deliverOpenPath queues instead of overwriting**

Replace `deliverOpenPath` (lines 371–379):

```typescript
function deliverOpenPath(filePath: string): void {
  trustPath(filePath);
  if (!mainWindow || mainWindow.webContents.isLoading()) {
    if (!pendingOpenPaths.includes(filePath)) pendingOpenPaths.push(filePath);
    return;
  }
  mainWindow.webContents.send('app:open-path', filePath);
  focusMainWindow();
}
```

- [ ] **Step 4: Main — consume-pending drains the queue**

Replace the handler (lines 560–564):

```typescript
  ipcMain.handle('app:consume-pending', (): string[] => pendingOpenPaths.splice(0));
```

- [ ] **Step 5: Main — flush every queued path on did-finish-load**

Replace (lines 867–872):

```typescript
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const queued = pendingOpenPaths.splice(0);
    for (const filePath of queued) {
      mainWindow.webContents.send('app:open-path', filePath);
    }
  });
```

- [ ] **Step 6: Main — second-instance delivers every path**

Replace (lines 881–887):

```typescript
  app.on('second-instance', (_evt, argv) => {
    focusMainWindow();
    for (const filePath of extractMarkdownPaths(argv)) {
      deliverOpenPath(filePath);
    }
  });
```

- [ ] **Step 7: Main — startup captures every argv path**

Replace (lines 900–903):

```typescript
  // Capture initial argv at startup (Windows "Open with" may pass several files)
  const initialFromArgs = extractMarkdownPaths(process.argv);
  for (const filePath of initialFromArgs) {
    pendingOpenPaths.push(filePath);
  }
```

- [ ] **Step 8: API contract + preload**

`src/shared/api.ts` — replace line 46:

```typescript
  consumePendingPaths: () => Promise<string[]>;
```

`src/preload/index.ts` — replace lines 15–16:

```typescript
  consumePendingPaths: () =>
    ipcRenderer.invoke('app:consume-pending') as Promise<string[]>,
```

- [ ] **Step 9: Renderer — open everything queued**

Replace `consumePending` (renderer `main.ts:824–830`):

```typescript
async function consumePending(): Promise<void> {
  const paths = await api.consumePendingPaths();
  pendingClickConsumed = paths.length > 0;
  for (const filePath of paths) {
    await openPath(filePath);
  }
}
```

- [ ] **Step 10: Verify no stale references**

Run: `rg "pendingOpenPath\b|consumePendingPath\b|extractMarkdownFromArgs" src/`
Expected: no matches (all renamed). Fix leftovers if any appear.

- [ ] **Step 11: Verify**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: pass, 121/121.

- [ ] **Step 12: Manual packaged test**

Run: `npm run pack`, launch `release/win-unpacked/LiveMD.exe`. Select 3 `.md` files in Explorer → right-click → Open with → LiveMD.
Expected: 3 tabs open (previously only 1).

- [ ] **Step 13: Commit**

```bash
git add src/main/index.ts src/shared/api.ts src/preload/index.ts src/renderer/src/main.ts
git commit -m "fix(open-with): queue every argv path so multi-select opens all files"
```

---

### Task 4: Watch lifecycle redesign (bugs #2 + #5)

`file:read` starts a permanent chokidar watcher on EVERY read — global search reads up to 10 recents per keystroke, and repeated opens inflate `watchCounts` beyond the live-tab count, leaving orphan watchers after tabs close. Fix: reading never watches; the renderer explicitly requests a watch exactly once per NEW tab, restoring the invariant `watchCount[path] == liveTabs[path]`.

**Files:**
- Modify: `src/main/index.ts` (handlers + `did-finish-load`)
- Modify: `src/shared/api.ts` (add `watchFile`)
- Modify: `src/preload/index.ts` (add `watchFile`)
- Modify: `src/renderer/src/main.ts` (`openPath`, `openRecreated`, `openFiles`, `restoreSession`; global search untouched)

**Interfaces:**
- Produces: `watchFile(filePath: string): Promise<void>` on MdApi → invokes guarded `file:watch` channel.
- Invariant: main calls `startWatch` only from `file:open-dialog`→removed, `file:read`→removed, new `file:watch`; renderer calls `api.watchFile` only when a new tab object was created for that path.

- [ ] **Step 1: Main — stop watching on read/dialog**

In `file:open-dialog` handler, replace the loop (lines 409–412):

```typescript
    for (const filePath of candidates) {
      trustPath(filePath);
    }
```

In `file:read` handler (lines 427–440), delete the line `startWatch(resolved, win);` so it ends:

```typescript
  ipcMain.handle('file:read', async (_evt, filePath: unknown) => {
    if (typeof filePath !== 'string') throw new Error(t(currentLang, 'markdownOnly'));
    const resolved = path.resolve(filePath);
    if (!readablePaths.has(resolved)) throw new Error(t(currentLang, 'markdownOnly'));
    if (!isMarkdown(resolved)) throw new Error(t(currentLang, 'markdownOnly'));
    const { content, modifiedAt } = await readMarkdownFile(resolved);
    return {
      filePath: resolved,
      fileName: path.basename(resolved),
      content,
      modifiedAt
    };
  });
```

- [ ] **Step 2: Main — add guarded `file:watch` channel**

Insert right after the `file:allow-read` handler (after line 446):

```typescript
  // The renderer registers one watch per newly created tab. Guarded by the
  // same trust set as file:read so a compromised renderer cannot spy on
  // arbitrary paths via change events.
  ipcMain.handle('file:watch', (_evt, filePath: unknown) => {
    if (typeof filePath !== 'string') return;
    const resolved = path.resolve(filePath);
    if (!readablePaths.has(resolved)) return;
    if (!isMarkdown(resolved)) return;
    startWatch(resolved, win);
  });
```

- [ ] **Step 3: Main — reset counts when renderer reloads**

A renderer reload rebuilds `TabManager` while main's counts survive, which would leak. In `createWindow`, extend the `did-finish-load` block from Task 3:

```typescript
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // Renderer reload rebuilds its TabManager: restart per-path counting so
    // counts match the fresh session's tabs.
    watchCounts.clear();
    const queued = pendingOpenPaths.splice(0);
    for (const filePath of queued) {
      mainWindow.webContents.send('app:open-path', filePath);
    }
  });
```

- [ ] **Step 4: API contract + preload**

`src/shared/api.ts` — after the `readFile` line add:

```typescript
  watchFile: (filePath: string) => Promise<void>;
```

`src/preload/index.ts` — after the `readFile` line add:

```typescript
  watchFile: (filePath: string) =>
    ipcRenderer.invoke('file:watch', filePath) as Promise<void>,
```

- [ ] **Step 5: Renderer — watch exactly once per new tab**

Replace `openPath` (`main.ts:803–822`):

```typescript
async function openPath(filePath: string): Promise<void> {
  try {
    setStatus(t('openingFile', { file: basename(filePath) }), '');
    await api.allowRead(filePath);
    const isNewTab = !manager.hasPath(filePath);
    const file = await api.readFile(filePath);
    if (manager.hasOrphaned(file.filePath)) {
      // The disk version opens next to the frozen tab instead of silently
      // replacing the frozen content.
      manager.addCopy(file);
      await api.watchFile(file.filePath);
    } else {
      manager.add(file);
      if (isNewTab) await api.watchFile(file.filePath);
    }
    recordRecentFile(file.filePath);
    restoreZoomForPath(file.filePath);
    setStatus(t('openOk', { file: file.fileName }), 'ok');
  } catch (err) {
    removeRecentFile(filePath);
    setStatus(t('openError', { msg: errorMessage(err) }), 'err');
  }
}
```

Replace `openRecreated` (`main.ts:733–742`) — `addCopy` always creates a tab:

```typescript
async function openRecreated(filePath: string): Promise<void> {
  try {
    await api.allowRead(filePath);
    const file = await api.readFile(filePath);
    manager.addCopy(file);
    await api.watchFile(file.filePath);
    recordRecentFile(file.filePath);
  } catch (err) {
    setStatus(t('openError', { msg: errorMessage(err) }), 'err');
  }
}
```

Replace `openFiles` (`main.ts:580–596`) — `manager.add` dedupes internally, so gate on prior existence:

```typescript
async function openFiles(): Promise<void> {
  try {
    setStatus(t('opening'), '');
    const files = await api.openDialog();
    if (files.length === 0) {
      setStatus(t('cancelled'), '');
      return;
    }
    for (const file of files) {
      const isNewTab = !manager.hasPath(file.filePath);
      manager.add(file);
      if (isNewTab) await api.watchFile(file.filePath);
      recordRecentFile(file.filePath);
    }
    setStatus(t('openedCount', { n: files.length }), 'ok');
  } catch (err) {
    setStatus(t('errorPrefix', { msg: errorMessage(err) }), 'err');
  }
}
```

Extend `restoreSession` (`main.ts:843–873`) — after `manager.addMany(files, ...)`, add:

```typescript
  for (const file of files) {
    void api.watchFile(file.filePath).catch(() => {});
  }
```

(`refreshFromDisk` and the global-search recents loop need NO change — plain reads no longer spawn watchers.)

- [ ] **Step 6: Verify static checks**

Run: `rg "startWatch" src/main/index.ts`
Expected: definition + `file:watch` handler + error-log wrapper only (no `file:read`/dialog callers).
Run: `npm run typecheck && npm run build && npx vitest run`
Expected: pass, 121/121.

- [ ] **Step 7: Manual packaged test (live reload is the product core)**

Run: `npm run pack`, launch packaged exe, then:
1. Open `exemplo.md` via dialog → edit it externally in VS Code → content updates live.
2. Type in global search (Ctrl+Shift+F) across recents WITHOUT opening them → external edits still work for genuinely open tabs; app handles stable.
3. Reopen an already-open recent twice, then close its tab once → external edits STOP updating (count reached 0 — previously leaked).
4. Delete an open file externally, recreate it, click "Abrir em nova aba" → two tabs; close ONE → other tab still live-updates; close BOTH → watcher released.
5. Ctrl+R reload → restoreSession tabs still live-update.

- [ ] **Step 8: Commit**

```bash
git add src/main/index.ts src/shared/api.ts src/preload/index.ts src/renderer/src/main.ts
git commit -m "fix(watchers): explicit per-tab watch channel; reads never spawn watchers"
```

---

### Task 5: Single folder event (bug #13)

`watchFolder.notify` sends `folder:changed` AND `folder:event`; preload's `onFolderChanged` listens on both channels, so the sidebar refreshes twice per disk event.

**Files:**
- Modify: `src/main/index.ts` (`notify` inside `watchFolder`, lines 216–220)

**Interfaces:**
- Consumes: preload dual-channel listener (kept for compat — now receives exactly one message).

- [ ] **Step 1: Emit one event**

Replace the `notify` closure:

```typescript
  const notify = () => {
    if (win.isDestroyed()) return;
    win.webContents.send('folder:event', folderPath);
  };
```

(Preload keeps listening on both channels; `folder:changed` simply never fires anymore.)

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: pass.

- [ ] **Step 3: Manual packaged test**

Packaged exe with sidebar visible on a folder: save a file in that folder from an editor.
Expected: sidebar list updates once, no double-flicker.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "fix(sidebar): emit single folder event per disk change"
```

---

## Phase 2 — P1: data fidelity & resources

### Task 6: Export renders from source content (bug #3)

Export/PDF/copy currently serialize the LIVE DOM: user highlights (`<mark data-hl-id>`) leak in, Mermaid blocks are baked SVGs, and exporting during incremental render captures half a document. Render from `active.content` instead — none of those artifacts exist in a fresh sanitize pass.

**Files:**
- Modify: `src/renderer/src/main.ts` (`renderExportMenu`, lines 1220–1253)

**Interfaces:**
- Consumes: existing `getMarkdown()` async loader, `buildStandaloneHtml(contentHtml, theme, cssText)`, `fetchCssText()`, `manager.getActive()`.

- [ ] **Step 1: Rewrite the three actions**

Replace the body of `renderExportMenu` (lines 1220–1253):

```typescript
function renderExportMenu(): void {
  exportMenu.innerHTML = `
    <button class="recent-menu-item" data-act="pdf">${escapeHtml(t('exportPdf'))}</button>
    <button class="recent-menu-item" data-act="html">${escapeHtml(t('exportHtml'))}</button>
    <button class="recent-menu-item" data-act="copy">${escapeHtml(t('copyAsHtml'))}</button>`;
  const buildStandalone = async (): Promise<string | null> => {
    const active = manager.getActive();
    if (!active) return null;
    const css = await fetchCssText();
    const theme = document.documentElement.getAttribute('data-theme') || 'soft';
    // Render from the tab's SOURCE so exports exclude reader artifacts
    // (highlights, Mermaid SVG swaps) and can never capture a partially
    // rendered incremental document.
    const { renderMarkdown } = await getMarkdown();
    return buildStandaloneHtml(await renderMarkdown(active.content), theme, css);
  };
  exportMenu.querySelector<HTMLButtonElement>('[data-act="pdf"]')?.addEventListener('click', async () => {
    exportPopover.close();
    const active = manager.getActive();
    const html = await buildStandalone();
    if (!html || !active) return;
    const res = await api.exportPdf(html, active.filePath || 'document.md');
    if (res) toast.show({ message: t('toastSaved', { file: basename(res.savedPath) }) });
  });
  exportMenu.querySelector<HTMLButtonElement>('[data-act="html"]')?.addEventListener('click', async () => {
    exportPopover.close();
    const active = manager.getActive();
    const html = await buildStandalone();
    if (!html || !active) return;
    const res = await api.exportHtml(html, active.filePath || 'document.md');
    if (res) toast.show({ message: t('toastSaved', { file: basename(res.savedPath) }) });
  });
  exportMenu.querySelector<HTMLButtonElement>('[data-act="copy"]')?.addEventListener('click', async () => {
    exportPopover.close();
    const html = await buildStandalone();
    if (!html) return;
    await api.copyText(html);
    toast.show({ message: t('copied') });
  });
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: pass (export.test.ts covers buildStandaloneHtml only — unchanged signature).

- [ ] **Step 3: Manual packaged test**

Open a doc, highlight a sentence (Ctrl+H flow), then Export → HTML.
Expected: exported file contains NO `<mark data-hl-id>`; Mermaid blocks export as fenced code, not SVG.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/main.ts
git commit -m "fix(export): render standalone HTML from source instead of live DOM"
```

### Task 7: Exclusive folder watcher (bug #6)

Every folder listed in the sidebar spawns a chokidar directory watcher that lives until quit. The sidebar shows exactly ONE folder at a time (the active tab's), so keep at most one watcher.

**Files:**
- Modify: `src/main/index.ts` (`watchFolder`, lines 207–227)

**Interfaces:**
- Produces: invariant `folderWatchers.size <= 1` after any `folder:list` call.

- [ ] **Step 1: Close siblings before watching**

Replace the top of `watchFolder`:

```typescript
async function watchFolder(folderPath: string, win: BrowserWindow): Promise<void> {
  // Sidebar shows a single folder at a time: release every other folder
  // watcher instead of accumulating directory watchers until quit.
  for (const [other, watcher] of [...folderWatchers]) {
    if (other === folderPath) continue;
    void watcher.close();
    folderWatchers.delete(other);
  }
  if (folderWatchers.has(folderPath)) return;
  const chokidar = await getChokidar();
  if (folderWatchers.has(folderPath)) return;
```

(the rest of the function — watcher setup, `notify`, `set` — stays as-is)

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: pass.

- [ ] **Step 3: Manual packaged test**

Open files from two different folders alternately, toggling between their tabs several times.
Expected (Task Manager / handle count or `chokidar` debug): only one directory watch active at any moment.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "fix(sidebar): keep at most one folder watcher alive"
```

### Task 8: Single CSS injection path (bug #12)

Custom CSS is injected twice — `webContents.insertCSS` in main AND `<style id="custom-css">` in the renderer — with duplicated `enhanceSpecificity` copies. Keep the renderer path (it already serves custom themes too); main only writes the file and broadcasts change events.

**Files:**
- Modify: `src/main/index.ts` (delete `enhanceCssSpecificity`, `applyCustomCss`, `customCssKey`; simplify `watchCustomCss` + `customCss:save` handler)

**Interfaces:**
- Consumes: renderer `customCss.ts` `initCustomCss()` which loads + applies via style tag and listens to `custom-css:changed`.

- [ ] **Step 1: Delete main-side injection**

Remove these declarations (lines 45, 154–174):
- `let customCssKey: string | null = null;`
- entire `function enhanceCssSpecificity(...)`
- entire `async function applyCustomCss(...)`

- [ ] **Step 2: Simplify the file watcher callbacks**

Replace the three callback bodies inside `watchCustomCss` (lines 190–203):

```typescript
  const push = (css: string): void => {
    if (!win.isDestroyed()) win.webContents.send('custom-css:changed', css);
  };
  watcher.on('change', async () => push(await readCustomCssFile()));
  watcher.on('add', async () => push(await readCustomCssFile()));
  watcher.on('unlink', () => push(''));
```

- [ ] **Step 3: Simplify the save handler**

Replace `handleCustomCssSave` (lines 662–668):

```typescript
  const handleCustomCssSave = async (_evt: unknown, css: unknown): Promise<void> => {
    if (typeof css !== 'string') throw new Error('invalid css');
    await fs.mkdir(path.dirname(CUSTOM_CSS_FILE), { recursive: true });
    await fs.writeFile(CUSTOM_CSS_FILE, css, 'utf-8');
    if (!win.isDestroyed()) win.webContents.send('custom-css:changed', css);
  };
```

Also remove `unwatchAll`'s `customCssKey = null;` line (watcher cleanup itself stays).

- [ ] **Step 4: Verify**

Run: `rg "applyCustomCss|enhanceCssSpecificity|customCssKey" src/main/index.ts`
Expected: no matches. Run: `npm run typecheck && npm run build && npx vitest run` — pass.

- [ ] **Step 5: Manual packaged test**

Gear menu → custom theme: create one, switch built-in↔custom, restart app.
Expected: identical visuals to before (CSS applied exactly once via style tag).

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts
git commit -m "refactor(css): inject custom CSS only from the renderer style tag"
```

---

## Phase 3 — P2: polish

### Task 9: Migrate stored `light` theme to `soft` (bug #11)

`readStoredTheme` still accepts `'light'`; users holding it are stuck outside `THEME_CYCLE` and can't toggle away. AGENTS.md specifies migration to `soft` — implement it at init.

**Files:**
- Modify: `src/renderer/src/theme.ts` (`initTheme`)
- Test: `src/renderer/src/theme.test.ts`

**Interfaces:**
- Consumes: existing `getStoredTheme/setTheme/initTheme`; cycle `['dark','soft']` unchanged.

- [ ] **Step 1: Add failing test**

Read `src/renderer/src/theme.test.ts` (jsdom-based, sets localStorage). Append, matching its existing setup helpers for localStorage/documentElement:

```typescript
describe('light theme migration', () => {
  it('migrates a persisted light theme to soft on init', () => {
    localStorage.setItem('md-reader.theme', 'light');
    const applied = initTheme();
    expect(applied).toBe('soft');
    expect(localStorage.getItem('md-reader.theme')).toBe('soft');
    expect(document.documentElement.getAttribute('data-theme')).toBe('soft');
  });
});
```

(Adapt helper names to how existing tests in that file set up storage; the assertions above are the contract.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/renderer/src/theme.test.ts`
Expected: FAIL — initTheme applies `light`.

- [ ] **Step 3: Implement migration**

Replace `initTheme` in `theme.ts`:

```typescript
export function initTheme(): ThemeName {
  // One-time migration: legacy 'light' predates the two-theme policy and is
  // unreachable from THEME_CYCLE; land those users on the default.
  if (readStoredTheme() === 'light') {
    setTheme(DEFAULT_THEME);
    return DEFAULT_THEME;
  }
  const theme = getEffectiveTheme();
  applyTheme(theme);
  return theme;
}
```

(`DEFAULT_THEME` is already imported from `@shared/constants`.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/renderer/src/theme.test.ts`
Expected: PASS including new case.

- [ ] **Step 5: Verify all + commit**

Run: `npm run typecheck && npm run build && npx vitest run` — expected 122/122.

```bash
git add src/renderer/src/theme.ts src/renderer/src/theme.test.ts
git commit -m "fix(themes): migrate legacy light theme to soft on init"
```

### Task 10: escapeAttr hardening (bug #16)

`escapeAttr` escapes `"` but not `'`; every current attribute uses double quotes so it's latent, but one template slip away from breakage/injection-in-attribute.

**Files:**
- Modify: `src/renderer/src/util.ts:14-16`
- Create: `src/renderer/src/util.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/renderer/src/util.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { escapeAttr, escapeHtml } from './util';

describe('escapeAttr', () => {
  it('escapes double quotes, single quotes and angle brackets', () => {
    expect(escapeAttr('a"b')).toBe('a&quot;b');
    expect(escapeAttr("a'b")).toBe('a&#39;b');
    expect(escapeAttr('a<b>&c')).toBe('a&lt;&gt;&amp;c');
  });

  it('leaves safe text untouched', () => {
    expect(escapeAttr('plain text 123')).toBe('plain text 123');
  });
});

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml('<img src=x>')).toBe('&lt;img src=x&gt;');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/renderer/src/util.test.ts`
Expected: FAIL on the single-quote case (`a'b` unchanged today).

- [ ] **Step 3: Implement**

Replace `escapeAttr` in `util.ts`:

```typescript
export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/renderer/src/util.test.ts`
Expected: PASS.

- [ ] **Step 5: Full verify + commit**

Run: `npm run typecheck && npm run build && npx vitest run` — expected pass.

```bash
git add src/renderer/src/util.ts src/renderer/src/util.test.ts
git commit -m "fix(util): escape single quotes in attribute values"
```

### Task 11: Remove dead branch in Ctrl+P shortcut (bug #14)

The input-focused branch of Ctrl+P is empty — silent no-op behind a comment.

**Files:**
- Modify: `src/renderer/src/shortcuts.ts:58-66`

- [ ] **Step 1: Flatten the condition**

Replace the Ctrl+P block:

```typescript
    } else if (isCtrl && key === 'p' && !evt.shiftKey) {
      // Pin/unpin active tab — override browser Print (ignored while typing)
      const target = evt.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (!isEditable) {
        evt.preventDefault();
        deps.togglePin?.();
      }
    } else if (evt.key === 'Escape') {
```

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck && npm run build && npx vitest run` — pass.

```bash
git add src/renderer/src/shortcuts.ts
git commit -m "refactor(shortcuts): flatten empty branch in Ctrl+P handling"
```

### Task 12: Restore scroll for every session tab (bug #10)

Sessions persist `scrollTop` for ALL tabs but restore only the active one. Route restores through a per-path map consumed by `renderContent` as each tab activates.

**Files:**
- Modify: `src/renderer/src/main.ts`

**Interfaces:**
- Produces: `pendingScrollByPath: Map<string, number>` replaces scalar `pendingScrollTop` (its only writer was `restoreSession`, only consumer `renderContent` — verify with `rg pendingScrollTop` first; expected: declarations at ~151/152, consume at ~554, write at ~871).

- [ ] **Step 1: Swap the scalar for a map**

Replace declaration `let pendingScrollTop: number | null = null;` with:

```typescript
const pendingScrollByPath = new Map<string, number>();
```

- [ ] **Step 2: Consume per active tab in renderContent**

Replace the scroll block (lines 554–557):

```typescript
  const savedScroll = pendingScrollByPath.get(active.filePath);
  if (savedScroll !== undefined) {
    contentEl.scrollTop = savedScroll;
    pendingScrollByPath.delete(active.filePath);
  }
```

- [ ] **Step 3: Populate for all tabs in restoreSession**

Replace the tail of `restoreSession` (lines 869–872):

```typescript
  for (const tab of session.tabs) {
    if (tab.scrollTop > 0) pendingScrollByPath.set(tab.filePath, tab.scrollTop);
  }
```

- [ ] **Step 4: Verify**

Run: `rg "pendingScrollTop" src/renderer/src/main.ts`
Expected: no matches.
Run: `npm run typecheck && npm run build && npx vitest run` — pass.

- [ ] **Step 5: Manual packaged test**

Open 3 long docs, scroll each differently, quit, relaunch. Click through tabs.
Expected: each tab resumes its own scroll position (before: inactive tabs jumped to top).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/main.ts
git commit -m "fix(session): restore saved scroll position for every restored tab"
```

### Task 13: Re-cache HTML after async passes (bug #15)

`renderCache.set` stores pre-highlight/pre-Mermaid HTML, so returning to a tab repaints raw code then flashes through highlighting again. After the deferred passes finish, refresh the cache entry with the final DOM.

**Files:**
- Modify: `src/renderer/src/highlight.ts` (`highlightCodeBlocksInIdle` returns completion promise)
- Modify: `src/renderer/src/main.ts` (`scheduleHighlight`, tail of `renderContent`)

**Interfaces:**
- Produces: `highlightCodeBlocksInIdle(container: HTMLElement): Promise<void>` (was `void`) — resolves when all `[data-hljs]` blocks are processed. Existing fire-and-forget callers stay valid.

- [ ] **Step 1: Make the idle scheduler awaitable**

In `highlight.ts`, replace `highlightCodeBlocksInIdle` (lines 62–92):

```typescript
export function highlightCodeBlocksInIdle(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('[data-hljs]');
  if (blocks.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let index = 0;
    let done = false;
    const finish = (): void => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    const runSlice = (deadline?: { timeRemaining: () => number }): void => {
      const sliceEnd =
        performance.now() + Math.max(deadline?.timeRemaining() ?? IDLE_SLICE_MS, IDLE_SLICE_MS);
      let processed = 0;
      while (index < blocks.length && (performance.now() < sliceEnd || processed === 0)) {
        const block = blocks[index] as HTMLElement;
        index++;
        processed++;
        if (!block.isConnected) continue;
        highlightBlock(block);
      }
      if (index < blocks.length) {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(runSlice, { timeout: 500 });
        } else {
          setTimeout(() => runSlice(), IDLE_FALLBACK_MS);
        }
      } else {
        finish();
      }
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(runSlice, { timeout: 200 });
    } else {
      setTimeout(() => runSlice(), IDLE_FALLBACK_MS);
    }
  });
}
```

- [ ] **Step 2: Await highlight in scheduleHighlight**

Replace `scheduleHighlight` (`main.ts:487–491`):

```typescript
async function scheduleHighlight(container: HTMLElement): Promise<void> {
  if (!container.querySelector('[data-hljs]')) return;
  const { highlightCodeBlocksInIdle } = await import('./highlight');
  await highlightCodeBlocksInIdle(container);
}
```

- [ ] **Step 3: Re-cache final HTML after the passes settle**

In `renderContent`, replace the three fire-and-forget calls (lines 568–570):

```typescript
  refreshOutline(state.activeId ?? '', contentEl, btnOutline, outlineMenu);
  void (async () => {
    try {
      await scheduleHighlight(contentEl);
      await renderMermaid(contentEl);
      await renderMath(contentEl);
      // Cache the POST-pass markup so revisiting this tab replays finished
      // output instead of flashing raw code through highlight/Mermaid again.
      const article = contentEl.firstElementChild as HTMLElement | null;
      if (article?.isConnected) {
        renderCache.set(active.filePath, active.content, article.innerHTML);
        renderCache.flush();
      }
    } catch {
      /* cosmetic passes must never break rendering */
    }
  })();
  void applyHighlightsForFile(active.filePath);
  doRefreshSidebar(active.filePath);
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: pass — including `highlight.test.ts` (callers ignoring the promise are unaffected) and `mermaidMath.test.ts`.

- [ ] **Step 5: Manual packaged test**

Open a long doc with several js/bash blocks, switch to another tab and back.
Expected: second visit paints highlighted code immediately (no raw-code flash).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/highlight.ts src/renderer/src/main.ts
git commit -m "perf(render): cache post-highlight markup so tab switches skip repass"
```

---

## Final Verification (after all tasks)

- [ ] `npm run typecheck && npm run build && npx vitest run` — all green (≥122 tests).
- [ ] `npm run pack` and walk the full manual checklist: open dialog, drag-drop, global search, orphan/recreate flow, sidebar navigation, export PDF/HTML/copy, theme toggle + gear themes, Ctrl+R restore, multi-select "Abrir com", pause/resume live updates.
- [ ] Confirm no regression on the security surface: drop still filtered at `drop` (never during dragover), `will-navigate` still converts `file://` navigations, `file:watch` rejects untrusted paths.

## Deliberately out of scope

| Item | Reason |
|---|---|
| Bug #7 (vitest/jsdom failures) | Refuted — suite runs 119/119 on current tree |
| Bug #8 (Mermaid/KaTeX dead module) | Product decision needed: bundle mermaid+katex (~1 MB+) via proper dynamic chunks vs delete `mermaidMath.ts` + unused i18n keys. Requires brainstorming/spec first. |
| AGENTS.md drift (Electron version, light-theme note, missing Vitest mention) | Repo policy forbids editing AGENTS.md without an explicit user instruction ("Atualize o AGENTS.md"). |
