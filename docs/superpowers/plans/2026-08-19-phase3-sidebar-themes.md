# Phase 3 Implementation Plan — Sidebar + Themes/CSS + Session/Pin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sidebar file tree, third theme + custom CSS, and pin/reorder/zoom session.

**Architecture:** `sidebar.ts`, `customCss.ts`, `theme.ts` extension, `tabs.ts` pin/reorder, IPC folder:list, customCss load/save, vault in userData.

**Tech Stack:** Electron 43, vanilla DOM, chokidar for folder, vitest.

## Global Constraints

- sandbox true, CSP, 2->3 themes (dark/soft/light), never rename localStorage keys, no new deps, i18n parity

---

### Task 1: Sidebar IPC + main

**Files:**
- Modify: `src/main/index.ts` (folder:list handler, watchFolder, customCss handlers)
- Modify: `src/shared/api.ts`, `src/preload/index.ts`
- Test: typecheck

- [ ] Add IPC folder:list (readdir, isMarkdown, max 100), customCss:load/save (read/write userData/custom.css), watch via chokidar

### Task 2: Sidebar renderer

**Files:**
- Create: `src/renderer/src/sidebar.ts`
- Modify: `src/renderer/index.html` (add #sidebar), `src/renderer/src/main.ts` (bind, toggle Ctrl+B), `src/renderer/src/style.css`

- [ ] Implement sidebar list, toggle, refresh on active file folder, click to open

### Task 3: Theme third + custom CSS

**Files:**
- Modify: `src/renderer/src/theme.ts` (add 'light', cycle 3)
- Modify: `src/renderer/src/style.css` (add :root[data-theme='light'])
- Create: `src/renderer/src/customCss.ts` (load/save)
- Modify: `src/renderer/index.html` (settings modal for CSS editor)
- Modify: `src/main/index.ts` (insertCSS on load/change)

- [ ] Extend theme, add editor modal

### Task 4: Pin/reorder/zoom

**Files:**
- Modify: `src/renderer/src/tabs.ts` (pinned, reorder)
- Modify: `src/renderer/src/main.ts` (renderTabbar sort pinned, drag handlers, Ctrl+P pin, per-file zoom map)
- Modify: `src/renderer/src/style.css` (.tab.is-pinned)

- [ ] Implement pin/unpin, drag reorder, zoom persistence via localStorage md-reader.zoom and settings.json

### Task 5: Docs + verification

- [ ] Update README, run typecheck+test+build, commit

