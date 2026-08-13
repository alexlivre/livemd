# Startup & Loading Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce time-to-window (ready-to-show) and time-to-restored-content without removing any feature.

**Architecture:** The renderer loads a single ~316 KB JS chunk (`out/renderer/assets/index-*.js`) whose bulk is the markdown pipeline (`marked` + `DOMPurify` + `highlight.js` core + 11 grammars), statically imported by `main.ts` and therefore parsed before first paint. The main process statically `require`s `chokidar` at boot even though it is only used once a file is opened. Session restore reads and re-renders every tab sequentially. We fix all four by (1) code-splitting the markdown pipeline behind a dynamic `import()`, (2) restoring sessions with parallel reads and a single batched render, (3) lazily loading `chokidar`, and (4) kicking the update check off before session restore.

**Tech Stack:** Electron 32, electron-vite 2 (Vite 5), TypeScript, vanilla DOM renderer, vitest.

## Global Constraints

- Do **not** rename any `localStorage` key (`md-reader.theme`, `md-reader.recent`, `md-reader.lang`, `md-reader.update-check`, `md-reader.session`) — silently losing user data is forbidden.
- Do **not** remove or weaken any feature (tabs, live reload, themes, recent files, i18n, search, update indicator, drag-drop, "Abrir com").
- Themes remain exactly `dark` and `soft`; CSP stays `script-src 'self'` (no inline scripts); `contextIsolation` on, `nodeIntegration` off.
- Code, comments and commit messages in English. Commit style: Conventional Commits (see `git log`).
- Verification = `npm run typecheck` + `npm test` (vitest) + `npm run build` + manual test in the **packaged** build (`npm run pack`, then `release/win-unpacked/LiveMD.exe`). Close the packaged app before re-packaging (EBUSY).
- Aliases `@shared/*`, `@renderer/*` are already configured; do not touch config files.

---

### Task 1: Code-split the markdown pipeline behind a dynamic import

This is the biggest win: `main.ts` statically imports `./markdown`, which pulls `marked`, `DOMPurify`, `highlight.js/lib/core` and 11 grammars into the initial chunk. `main.ts` executes its module body before first paint, so all of that JS is parsed even when no file is open. Moving it behind `import()` makes Vite emit a separate chunk that is only fetched/parsed on first render.

**Files:**
- Modify: `src/renderer/src/main.ts:5` (remove static import), `src/renderer/src/main.ts:212-216` (use lazy loader)
- No change: `src/renderer/src/markdown.ts` (stays as-is; its unit test keeps importing it statically)

**Interfaces:**
- Consumes: existing `renderMarkdown(source: string): Promise<string>` from `./markdown`.
- Produces: module-level `getMarkdown(): Promise<typeof import('./markdown')>` inside `main.ts` (private helper, not exported).

- [ ] **Step 1: Replace the static import with a lazy loader**

In `src/renderer/src/main.ts`, delete line 5:

```ts
import { renderMarkdown } from './markdown';
```

Add the lazy loader near the other module-level state (after the `RenderCache`/`scrollByPath` declarations, before `setStatus`):

```ts
let markdownPromise: Promise<typeof import('./markdown')> | null = null;

function getMarkdown(): Promise<typeof import('./markdown')> {
  markdownPromise ??= import('./markdown');
  return markdownPromise;
}
```

- [ ] **Step 2: Use the lazy loader in `renderContent`**

In `src/renderer/src/main.ts`, replace:

```ts
  let html = renderCache.get(active.filePath, active.content);
  if (html === null) {
    html = await renderMarkdown(active.content);
    renderCache.set(active.filePath, active.content, html);
  }
```

with:

```ts
  let html = renderCache.get(active.filePath, active.content);
  if (html === null) {
    const { renderMarkdown } = await getMarkdown();
    html = await renderMarkdown(active.content);
    renderCache.set(active.filePath, active.content, html);
  }
```

- [ ] **Step 3: Typecheck and run tests**

Run: `npm run typecheck`
Expected: no errors (the `import('./markdown')` type is resolved via `moduleResolution: "Bundler"`).

Run: `npm test`
Expected: all pass, including `markdown.test.ts` (it imports `./markdown` statically and still exercises the real `renderMarkdown`).

- [ ] **Step 4: Build and confirm a second chunk is emitted**

Run: `npm run build`
Expected: `out/renderer/assets/` now contains two JS files — a smaller entry (`index-*.js`) plus a new `markdown-*.js` (or similarly named) chunk. The entry should shrink from ~316 KB to well under 100 KB.

- [ ] **Step 5: Manual test in the packaged build**

Run: `npm run pack`, then open `release/win-unpacked/LiveMD.exe`.
Expected: app opens with the empty state; opening `exemplo.md` renders normally (headings, code blocks, syntax highlighting, copy buttons); live-reload still works. No console errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/main.ts
git commit -m "perf(renderer): lazy-load markdown pipeline behind dynamic import"
```

---

### Task 2: Restore sessions with parallel reads and a single batched render

Today `restoreSession` (`main.ts:312-328`) calls `await openPath(tab.filePath)` **sequentially** for every tab. Each `openPath` does an IPC read, then `manager.add` emits, which triggers `renderContent` — a full `renderMarkdown` for each intermediate tab even though only the last (active) tab is ever displayed. We add a `TabManager.addMany` that emits once, and rewrite `restoreSession` to read all files in parallel with `Promise.allSettled` (tolerating per-file failures like the current per-file `openPath` error handling).

**Files:**
- Modify: `src/renderer/src/tabs.ts` (add `addMany`, extract `OpenTabInput`)
- Modify: `src/renderer/src/main.ts:312-328` (`restoreSession`)
- Test: `src/renderer/src/tabs.test.ts` (add `addMany` cases)

**Interfaces:**
- Consumes: `TabData` (existing), `nextId()`, `emit()` from `tabs.ts`.
- Produces: `export interface OpenTabInput { filePath: string; fileName: string; content: string; modifiedAt: number }` and `TabManager.addMany(files: OpenTabInput[]): TabData[]`. Later `restoreSession` relies on `addMany` emitting a single update and setting `activeId` to the last added tab.

- [ ] **Step 1: Write failing tests for `addMany`**

In `src/renderer/src/tabs.test.ts`, append inside the existing `describe('TabManager', ...)` block:

```ts
  it('addMany adds all tabs and emits a single update', () => {
    const m = new TabManager();
    let emissions = 0;
    m.subscribe(() => {
      emissions += 1;
    });
    const added = m.addMany([file('/a.md'), file('/b.md'), file('/c.md')]);
    expect(added).toHaveLength(3);
    expect(m.getState().tabs).toHaveLength(3);
    expect(m.getState().activeId).toBe(added[2].id);
    expect(emissions).toBe(2); // 1 from subscribe's immediate call + 1 from addMany
  });

  it('addMany reuses existing tabs for repeated paths', () => {
    const m = new TabManager();
    m.add(file('/a.md'));
    const added = m.addMany([file('/a.md', '# changed'), file('/b.md')]);
    expect(m.getState().tabs).toHaveLength(2);
    expect(m.getState().tabs[0].content).toBe('# changed');
    expect(added[0].id).toBe(m.getState().tabs[0].id);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/tabs.test.ts`
Expected: FAIL — `m.addMany is not a function`.

- [ ] **Step 3: Add `OpenTabInput` and `addMany` to `TabManager`**

In `src/renderer/src/tabs.ts`, add the input type after `TabState`:

```ts
export interface OpenTabInput {
  filePath: string;
  fileName: string;
  content: string;
  modifiedAt: number;
}
```

Change `add`'s signature and add `addMany` (replace the current `add` body):

```ts
  add(file: OpenTabInput): TabData {
    return this.addMany([file])[0];
  }

  addMany(files: OpenTabInput[]): TabData[] {
    const added: TabData[] = [];
    for (const file of files) {
      const existing = this.tabs.find((t) => t.filePath === file.filePath);
      if (existing) {
        existing.content = file.content;
        existing.modifiedAt = file.modifiedAt;
        added.push(existing);
      } else {
        added.push({
          id: this.nextId(),
          filePath: file.filePath,
          fileName: file.fileName,
          content: file.content,
          modifiedAt: file.modifiedAt
        });
      }
    }
    for (const tab of added) {
      if (!this.tabs.includes(tab)) this.tabs.push(tab);
    }
    if (added.length > 0) this.activeId = added[added.length - 1].id;
    this.emit();
    return added;
  }
```

(Note: the `includes` guard pushes only genuinely new tabs; reused tabs stay in place. `addMany` always `emit()`s once, matching the existing single-emit-per-mutation behavior.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/tabs.test.ts`
Expected: PASS — all `TabManager` tests, including the two new ones. Existing tests still pass (they exercise `add`/`close`/`updateContent` unchanged).

- [ ] **Step 5: Rewrite `restoreSession`**

In `src/renderer/src/main.ts`, replace the current `restoreSession` (lines 312-328) with:

```ts
async function restoreSession(): Promise<void> {
  const session = loadSession();
  if (!session || session.tabs.length === 0) return;

  const results = await Promise.allSettled(
    session.tabs.map(async (tab) => {
      await api.allowRead(tab.filePath);
      return api.readFile(tab.filePath);
    })
  );

  const files: Awaited<ReturnType<typeof api.readFile>>[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      files.push(result.value);
      recordRecentFile(result.value.filePath);
    }
  }

  if (files.length === 0) return;

  manager.addMany(files);

  if (session.activePath) {
    const state = manager.getState();
    const target = state.tabs.find((t) => t.filePath === session.activePath);
    if (target) manager.activate(target.id);
  }

  const savedScroll = session.tabs.find((t) => t.filePath === session.activePath)?.scrollTop ?? 0;
  if (savedScroll > 0) {
    pendingScrollTop = savedScroll;
    void renderContent(manager.getState());
  }
}
```

Remove the now-unused `removeRecentFile` import if it becomes unreferenced elsewhere — **verify first** (`openPath` still uses it at line 290, so keep the import).

- [ ] **Step 6: Typecheck and run full test suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Manual test in the packaged build**

Run: `npm run pack`, open `release/win-unpacked/LiveMD.exe`.
Expected:
- Open 3+ files in tabs, close the app, reopen → all tabs restore, the previously active tab is active, scroll position preserved.
- Delete one restored file on disk before reopening → app still starts, the missing tab is skipped without an error dialog, remaining tabs restore.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/tabs.ts src/renderer/src/tabs.test.ts src/renderer/src/main.ts
git commit -m "perf(renderer): restore session with parallel reads and single render"
```

---

### Task 3: Lazy-load `chokidar` in the main process

`src/main/index.ts:6` imports `chokidar` at module top; it is only used in `watchFile`. The main bundle is CJS, so this becomes `require("chokidar")` at boot. Convert to a dynamic `import()` resolved only when the first file is opened.

**Files:**
- Modify: `src/main/index.ts:6` (import), `src/main/index.ts:99-138` (`watchFile`), `src/main/index.ts:194` and `src/main/index.ts:212` (callers)

**Interfaces:**
- Consumes: `FSWatcher` type from `chokidar` (type-only import stays).
- Produces: `getChokidar(): Promise<typeof import('chokidar')>` (module-private). `watchFile` becomes `async ... : Promise<void>`.

- [ ] **Step 1: Change the import to type-only and add the lazy loader**

In `src/main/index.ts`, replace line 6:

```ts
import chokidar, { type FSWatcher } from 'chokidar';
```

with:

```ts
import type { FSWatcher } from 'chokidar';
```

Add the loader next to the `watched` map (after line 13):

```ts
let chokidarPromise: Promise<typeof import('chokidar')> | null = null;

function getChokidar(): Promise<typeof import('chokidar')> {
  chokidarPromise ??= import('chokidar');
  return chokidarPromise;
}
```

- [ ] **Step 2: Make `watchFile` async and lazy-load**

Replace `watchFile` (lines 99-138) with:

```ts
async function watchFile(filePath: string, win: BrowserWindow): Promise<void> {
  if (watched.has(filePath)) return;

  const chokidar = await getChokidar();
  if (watched.has(filePath)) return;

  const watcher = chokidar.watch(filePath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 30 }
  });

  watcher.on('change', async () => {
    try {
      const { content, modifiedAt } = await readMarkdownFile(filePath);
      win.webContents.send('file:event', {
        kind: 'changed',
        filePath,
        content,
        modifiedAt
      });
    } catch (err) {
      win.webContents.send('file:event', {
        kind: 'error',
        filePath,
        message: err instanceof Error ? err.message : String(err)
      });
    }
  });

  watcher.on('unlink', () => {
    win.webContents.send('file:event', { kind: 'removed', filePath });
  });

  watcher.on('error', (err) => {
    win.webContents.send('file:event', {
      kind: 'error',
      filePath,
      message: err.message
    });
  });

  watched.set(filePath, watcher);
}
```

(The `watched.has` re-check after the `await` prevents a duplicate watcher if two opens race.)

- [ ] **Step 3: Await the two callers**

In `src/main/index.ts`, change line 194 from `watchFile(filePath, win);` to `await watchFile(filePath, win);`, and line 212 from `watchFile(resolved, win);` to `await watchFile(resolved, win);`. Both call sites are already inside `async` `ipcMain.handle` callbacks.

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: `out/main/index.js` no longer contains a top-level `require("chokidar")`; it now appears inside a lazily-invoked `Promise.resolve().then(() => require("chokidar"))` only within the `watchFile` code path.

- [ ] **Step 5: Manual test in the packaged build**

Run: `npm run pack`, open `release/win-unpacked/LiveMD.exe`, open `exemplo.md`, edit it in an editor and save.
Expected: live reload still fires (the file reloads automatically). No errors in the main process.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts
git commit -m "perf(main): lazy-load chokidar on first watched file"
```

---

### Task 4: Kick the update check off before session restore

`checkForUpdate` is already fire-and-forget (`void checkForUpdate(...)`), but it is scheduled *after* `await restoreSession()`. Moving it before the restore lets the (once-per-day, 8s-timeout) GitHub request overlap with session restoration instead of adding to the perceived tail latency.

**Files:**
- Modify: `src/renderer/src/main.ts:548-556` (move the block above the restore)

**Interfaces:**
- Consumes: `checkForUpdate(api, { onUpdate })` from `./update`; `applyStaticStrings`, `btnAbout` (module state).
- Produces: none.

- [ ] **Step 1: Move the update check**

In `src/renderer/src/main.ts`, in `bootstrap()`, delete the trailing block:

```ts
  await restoreSession();

  void checkForUpdate(api, {
    onUpdate: (v) => {
      updateVersion = v;
      applyStaticStrings();
      btnAbout.classList.add('has-update');
    }
  });
```

and insert the update check immediately after `applyStaticStrings()` (right after the `manager.subscribe(...)`/`subscribeLang(...)` wiring is fine too — anywhere after i18n init and before `await restoreSession()`). Final shape of the relevant region:

```ts
  applyStaticStrings();

  void checkForUpdate(api, {
    onUpdate: (v) => {
      updateVersion = v;
      applyStaticStrings();
      btnAbout.classList.add('has-update');
    }
  });

  manager.subscribe((state) => {
    renderTabbar(state);
    void renderContent(state);
    snapshotSession();
  });

  subscribeLang(() => {
    applyStaticStrings();
    refreshUi();
  });

  api.onFileEvent(handleFileEvent);
  bindUi();

  contentEl.addEventListener(
    'scroll',
    debounce(() => {
      const active = manager.getActive();
      if (active) scrollByPath.set(active.filePath, contentEl.scrollTop);
      snapshotSession();
    }, 300)
  );

  await restoreSession();
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual test in the packaged build**

Run: `npm run pack`, open `release/win-unpacked/LiveMD.exe` with a session that has several tabs.
Expected: tabs restore as before; if an update exists the About button dot still appears.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/main.ts
git commit -m "perf(renderer): start update check before session restore"
```

---

## Self-Review

**Spec coverage** — the four improvement points from the analysis are each covered: (1) code-split markdown → Task 1; (2) parallel restore + single render → Task 2; (3) lazy chokidar → Task 3; (4) update-check timing → Task 4. The theme-FOUC item was intentionally dropped: the window is created with `show: false` and only shown on `ready-to-show` (after first paint), and `initTheme()` runs synchronously during module evaluation — so no flash can occur and no change is needed.

**Placeholder scan** — every code step includes the exact final code; commands include expected output; no TODOs.

**Type consistency** — `OpenTabInput` (Task 2, `tabs.ts`) matches the shape `restoreSession` passes (`OpenedFile` from `api.readFile` has `filePath`/`fileName`/`content`/`modifiedAt`). `addMany` returns `TabData[]` and is used as such. `getMarkdown()` and `getChokidar()` names are consistent between their definition and call sites. `renderMarkdown` is unchanged, so `markdown.test.ts` remains valid.

**Ordering** — Tasks 1, 2 and 4 all edit `src/renderer/src/main.ts` but touch disjoint regions (imports + `renderContent`; `restoreSession`; `bootstrap`), so each task compiles and tests green independently. Task 3 is main-process only. Recommended order: 1 → 2 → 3 → 4.
