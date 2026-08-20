# Fase 3 Task 1 Report — Sidebar + CustomCss IPC

**Status:** DONE

**Commit:** `feat(sidebar): folder and customCss IPC`
- Files: `src/main/index.ts` (modified), `src/shared/api.ts` (modified), `src/preload/index.ts` (modified)

## Changes

### src/main/index.ts
- Added `CUSTOM_CSS_FILE = path.join(app.getPath('userData'),'custom.css')` at `src/main/index.ts:42`
- Added state: `customCssKey`, `customCssWatcher`, `folderWatchers` Map
- Added helpers:
  - `readCustomCssFile()` — reads `custom.css` if exists else ''
  - `applyCustomCss(win, css)` — `removeInsertedCSS` previous key + `insertCSS`, handles invalid CSS and destroyed window
  - `watchCustomCss(win)` — chokidar watch on `CUSTOM_CSS_FILE` (ignoreInitial, awaitWriteFinish), on `change`/`add`/`unlink` re-reads, `insertCSS`, sends `custom-css:changed`
  - `watchFolder(folderPath, win)` — chokidar watch depth 0, on any add/unlink/change sends `folder:changed` + `folder:event`, deduplicated via Map
- Extended `unwatchAll()` to close `folderWatchers` and `customCssWatcher`, clear `customCssKey`
- Inside `registerIpc(win)` added handlers:
  - `folder:list` — validates `folderPath` is string, `fs.readdir`, `filter(isMarkdown)`, `path.join`, `slice(0,100)`, `watchFolder` fire-and-forget, returns `[]` on error
  - `customCss:load` / `custom-css:load` — `readCustomCssFile()`
  - `customCss:save` / `custom-css:save` — validates string, `mkdir -p`, `writeFile`, `applyCustomCss`, `send('custom-css:changed')`
  - Starts watchers + injects existing css on register: `watchCustomCss` + `readCustomCssFile().then(applyCustomCss)`

### src/shared/api.ts
- Extended `MdApi` at `src/shared/api.ts:59-62`:
  - `listFolder(folderPath: string) => Promise<string[]>`
  - `loadCustomCss() => Promise<string>`
  - `saveCustomCss(css: string) => Promise<void>`
  - `onCustomCssChanged(handler: (css:string)=>void) => () => void`
  - `onFolderChanged(handler: (folderPath:string)=>void) => () => void`
  - Optional aliases `onCustomCssChange?` / `onFolderEvent?` for plan/spec naming compatibility

### src/preload/index.ts
- Wired at `src/preload/index.ts:63-100`:
  - `listFolder` → `ipcRenderer.invoke('folder:list')`
  - `loadCustomCss` → `invoke('customCss:load')`
  - `saveCustomCss` → `invoke('customCss:save', css)`
  - `onCustomCssChanged` listens `custom-css:changed`
  - `onFolderChanged` listens both `folder:changed` and `folder:event`, unsubscribes both
  - Aliases `onCustomCssChange` / `onFolderEvent` same listeners

## Verification

```
npm run typecheck
tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json
PASS (exit 0, no output)
```

- No new deps, sandbox/CSP unchanged, themes not touched.

## Notes
- `folder:list` does not recurse, max 100, filtered via `MARKDOWN_EXT_RE.test` (`isMarkdown`), matches spec.
- Custom CSS watcher uses same `getChokidar` lazy import and `awaitWriteFinish` thresholds as `watchFile`.
- Dual channel names (`customCss:load` + `custom-css:load`) ensure renderer spec variations both work.
