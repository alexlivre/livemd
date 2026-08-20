# Phase 2 Implementation Plan — Highlights + Palette + Mermaid/Math

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add highlights (persistent), command palette (Ctrl+K), and progressive Mermaid/Math rendering.

**Architecture:** `highlights.ts` + `palette.ts` + `mermaidMath.ts` (dynamic imports) + IPC `highlights:load/save` + `context-menu` Highlight item; vanilla DOM, reuse `createPopover`, `debounce`, `t`, `escapeHtml`.

**Tech Stack:** Electron 43, TypeScript, marked/DOMPurify, vitest, no hard new deps.

## Global Constraints

- sandbox true, contextIsolation true, nodeIntegration false
- CSP default-src 'self'; style-src 'unsafe-inline'
- Two themes dark/soft (Fase 2 keeps 2, Fase 3 adds third)
- Never rename localStorage keys md-reader.*
- No new runtime deps (mermaid/katex optional dynamic import with fallback)
- i18n pt/en/es parity

---

### Task 1: Highlights persistence + IPC

**Files:**
- Modify: `src/main/index.ts` (add HIGHLIGHTS_FILE, ipc handlers)
- Modify: `src/shared/api.ts` (add loadHighlights/saveHighlights)
- Modify: `src/preload/index.ts` (wire)
- Modify: `src/shared/i18n.ts` (add highlight keys)
- Test: `npm run typecheck`

- [ ] Step 1: Add i18n keys `highlight`, `highlightRemove`, `highlightColor`, `palettePlaceholder`, `paletteEmpty` etc to en/pt/es (keep existing)
- [ ] Step 2: Extend MdApi with `loadHighlights(filePath):Promise<Highlight[]>`, `saveHighlights(filePath,list):Promise<void>`, `onHighlightAdd`
- [ ] Step 3: Preload wire to ipc
- [ ] Step 4: Main handlers for highlights:load/save reading/writing userData/highlights.json (atomic, catch file not found)
- [ ] Step 5: Also extend context-menu handler to add Highlight item when selection 2-300 chars (click -> send highlight:add)
- [ ] Step 6: Verify typecheck PASS
- [ ] Step 7: Commit `feat(highlights): persistence IPC`

### Task 2: Highlights renderer

**Files:**
- Create: `src/renderer/src/highlights.ts` (addHighlight, renderHighlights, load/save wrappers)
- Test: `src/renderer/src/highlights.test.ts` (pure: addHighlight logic, renderHighlights wrapping)
- Modify: `src/renderer/src/main.ts` (call renderHighlights after renderContent, bind Ctrl+H)
- Modify: `src/renderer/src/style.css` (mark[data-hl-id] styles)
- Test: typecheck+build

- [ ] Step 1: Write failing test for highlights pure (addHighlight creates id, renderHighlights wraps)
- [ ] Step 2: Implement highlights.ts (text node walk, Range wrap, unwrap prior, save via api)
- [ ] Step 3: Wire in main.ts: after renderContent refreshOutline, call applyHighlights; bind Ctrl+H
- [ ] Step 4: CSS for marks
- [ ] Step 5: Verify typecheck/build PASS, commit

### Task 3: Palette

**Files:**
- Create: `src/renderer/src/palette.ts` (registry, fuzzy filter, open/close)
- Modify: `src/renderer/index.html` (add #palette-backdrop modal)
- Modify: `src/renderer/src/main.ts` (register commands, bind Ctrl+K)
- Modify: `src/renderer/src/shortcuts.ts` (add palette shortcuts)
- Modify: `src/renderer/src/style.css` (palette styles)
- Test: `src/renderer/src/palette.test.ts` (filter logic)

- [ ] Step 1: Write failing test for filter
- [ ] Step 2: Implement palette.ts
- [ ] Step 3: Add modal HTML
- [ ] Step 4: Wire commands in main.ts
- [ ] Step 5: Verify, commit `feat(palette): command palette Ctrl+K`

### Task 4: Mermaid/Math progressive

**Files:**
- Create: `src/renderer/src/mermaidMath.ts` (renderMermaid, renderMath with dynamic import fallback)
- Modify: `src/renderer/src/main.ts` (call after scheduleHighlight)
- Test: `src/renderer/src/mermaidMath.test.ts` (fallback when import fails)

- [ ] Step 1: Write failing test (when mermaid not installed, leaves code block)
- [ ] Step 2: Implement mermaidMath.ts with try import('mermaid') catch fallback, same for katex
- [ ] Step 3: Wire in main.ts renderContent
- [ ] Step 4: Verify typecheck/build, commit `feat(mermaid): progressive render`

### Task 5: Docs

- [ ] Update README bullets, verify typecheck+test+build, commit `docs: fase2`
