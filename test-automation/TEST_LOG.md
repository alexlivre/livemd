# Test Log

## 2026-09-03 - Comprehensive Audit Fixes & Enhancements

- **Suite**: Vitest (Unit & Integration)
- **Status**: Passed (0 failures)
- **Test Files**: 21 passed (21 total)
- **Tests**: 133 passed (133 total)
- **Coverage**: Passed
- **Typecheck**: Passed (`tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json`)
- **Build**: Passed (`electron-vite build`)

### Summary of Changes:
- Restored GFM task lists / checkboxes in `src/renderer/src/markdown.ts` by allowing `<input>` and attributes (`type`, `checked`, `disabled`) in DOMPurify.
- Fixed off-by-one bug in `TabManager.reorder()` in `src/renderer/src/tabs.ts` when moving tabs forward/to the right.
- Added missing `trustPath` call in `file:save-as` in `src/main/index.ts` to ensure saved files can be watched/read.
- Cleaned up active Chokidar watchers and reset sets on `did-finish-load` in `src/main/index.ts` to prevent handle leaks.
- Persisted pinned tab status in session snapshot and restoration in `src/renderer/src/session.ts` and `src/renderer/src/main.ts`.
- Lowered `RenderCache` capacity to 1 MB in `src/renderer/src/renderCache.ts` to eliminate `QuotaExceededError` risk on `localStorage`.
- Eliminated dead DOM tree-walking and textContent concatenation in `src/renderer/src/mermaidMath.ts` when libraries are absent.
- Disconnected `activeObserver` at outline start and reset button active states in `src/renderer/src/outline.ts`.
- Added Windows syntax highlighting support for PowerShell, DOS/Batch, C#, C/C++, and INI/TOML in `src/renderer/src/highlight.ts`.
- Stored active theme and configured `BrowserWindow` `backgroundColor` from stored theme in `src/main/index.ts` to eliminate startup flash with Dark theme.
- Fixed accidental native browser print dialog invocation on `Ctrl+P` in editable fields in `src/renderer/src/shortcuts.ts`.
- Added missing i18n keys for sidebar empty/error states and theme editor in `src/shared/i18n.ts`.
- Added accessibility attributes and keyboard event listener (`tabindex="0"`, `Enter`/`Space`) to tab close button.
- Registered `.mdx` file extension in NSIS installer script (`build/installer.nsh`).

## 2026-08-29 - PDF & HTML Export Fixes

- **Suite**: Vitest (Unit & Integration)
- **Status**: Passed (0 failures)
- **Test Files**: 21 passed (21 total)
- **Tests**: 128 passed (128 total)
- **Coverage**: Passed
- **Typecheck**: Passed (`tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json`)
- **Build**: Passed (`electron-vite build`)

### Summary of Changes:
- Fixed standalone HTML and PDF export limitation where only the first page was visible/printed due to `html, body { height: 100%; overflow: hidden; }` inherited from app layout styles.
- Added standalone style overrides (`height: auto !important`, `overflow: visible !important`, `user-select: text !important`) to ensure full-document scrolling in exported HTML files and proper multi-page pagination in PDF exports.
- Added `@media print` rules with proper page-break handling (`break-inside: avoid` on code/tables/images, `break-after: avoid` on headings) and hidden UI elements (`.code-copy`).
- Synchronously highlighted code blocks in `buildStandalone` prior to export so exported HTML and PDF documents preserve syntax coloring.
- Enhanced `fetchCssText` to preserve custom CSS in exports.
- Added unit tests in `src/renderer/src/export.test.ts`.
