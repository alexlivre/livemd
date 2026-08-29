# Test Log

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
