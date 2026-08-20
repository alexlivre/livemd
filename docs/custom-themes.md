# Custom Themes — LiveMD

Create your own themes for LiveMD with a single CSS file. No rebuild, no fork.

> **File:** `userData/custom.css`  
> Windows: `%APPDATA%\LiveMD\custom.css` (e.g. `C:\Users\<you>\AppData\Roaming\LiveMD\custom.css`)  
> **Editor:** Titlebar gear button (⚙) → *Custom CSS* → textarea + Save/Clear  
> **Hot-reload:** The main process watches `custom.css` with `chokidar` and re-injects it via `insertCSS`; changes appear instantly, also when you edit the file externally.

---

## How it works

1. LiveMD ships three built-in themes in `src/renderer/src/style.css`:
   `:root[data-theme='dark']`, `:root[data-theme='soft']` (default), `:root[data-theme='light']`
2. You pick one with `Ctrl+Shift+T` (cycles `dark → soft → light`) or the sun/moon button. The choice is stored in `localStorage` `md-reader.theme`.
3. `custom.css` is **layered on top** of the active theme. It is injected with `win.webContents.insertCSS(css)` in the main process and also as `<style id="custom-css">` in the renderer, so it wins over the built-in tokens.
4. All colors are CSS variables (tokens). Override any token and every component follows — no hardcoded colors in new UI.

CSP is `style-src 'self' 'unsafe-inline'` so inline `<style>` is allowed. No JS is allowed from `custom.css`.

---

## Tokens you can override

Copy any block below and tweak. Variables are defined in `src/renderer/src/style.css:1-140`.

```css
/* Core surfaces */
--bg-app: #1a1d23;            /* app background */
--bg-titlebar: #14161b;
--bg-tabbar: #16191f;
--bg-tab-active: #1f242c;
--bg-tab-hover: #1c2027;
--bg-content: #0f1115;
--bg-code: #14171c;
--bg-elevated: #1f242c;

/* Borders */
--border: #262b33;
--border-strong: #323844;

/* Text */
--text: #e6e8eb;
--text-strong: #f3f4f6;
--text-emphasis: #d4d7dd;
--text-dim: #9aa3b1;
--text-muted: #6b7383;
--text-on-accent: #0f1115;

/* Accent */
--accent: #7aa2f7;
--accent-hover: #92b6f9;
--accent-strong: #6c94e8;
--accent-soft: rgba(122,162,247,0.15);

/* Semantic */
--success: #9ece6a; --warning: #e0af68; --danger: #f7768e;

/* Markdown */
--md-inline-code: #e0af68;
--md-table-alt-row: rgba(255,255,255,0.025);

/* Highlight.js via tokens */
--hljs-keyword: #ff7b72; --hljs-string: #a5d6ff; --hljs-comment: #8b949e;
/* Scrollbar */
--scrollbar-thumb: #323844;
```

Only override what you need — unspecified tokens keep the active theme's value.

---

## Minimal example — Sepia (apply on any base theme)

```css
/* custom.css — Sepia warm theme */
:root {
  --bg-app: #f8f3e8;
  --bg-titlebar: #f8f3e8;
  --bg-tabbar: #efe6d5;
  --bg-content: #fdf8ef;
  --bg-code: #f3ead9;
  --bg-elevated: #ffffff;
  --border: #e8dcc6;
  --border-strong: #d6c7a8;
  --text: #3c2f1e;
  --text-strong: #1e160d;
  --text-dim: #6b5d45;
  --text-muted: #8a7d68;
  --accent: #b45309;
  --accent-hover: #92400e;
  --accent-soft: rgba(180,83,9,0.12);
  --hljs-string: #0a3069;
  --hljs-keyword: #cf222e;
}
```

Save → `custom.css` hot-reloads, even while LiveMD is open.

---

## More examples

### 1. Nord-inspired dark

```css
:root[data-theme='dark'] {
  --bg-app: #2e3440;
  --bg-titlebar: #2e3440;
  --bg-content: #3b4252;
  --bg-code: #434c5e;
  --bg-elevated: #3b4252;
  --text: #eceff4;
  --text-dim: #d8dee9;
  --accent: #88c0d0;
  --accent-hover: #81a1c1;
  --accent-soft: rgba(136,192,208,0.15);
  --border: #4c566a;
}
```

### 2. High-contrast light (accessibility)

```css
:root[data-theme='light'] {
  --bg-app: #ffffff;
  --bg-content: #ffffff;
  --text: #000000;
  --text-strong: #000000;
  --border: #000000;
  --border-strong: #000000;
  --accent: #0000ff;
  --accent-soft: rgba(0,0,255,0.08);
}
```

### 3. Dracula

```css
:root {
  --bg-app: #282a36;
  --bg-tabbar: #21222c;
  --bg-content: #282a36;
  --bg-code: #343746;
  --text: #f8f8f2;
  --text-dim: #bd93f9;
  --accent: #ff79c6;
  --accent-hover: #ff92d0;
  --accent-soft: rgba(255,121,198,0.15);
  --hljs-keyword: #ff79c6;
  --hljs-string: #f1fa8c;
  --hljs-comment: #6272a4;
}
```

### 4. Focus only the Markdown body

```css
.markdown-body {
  max-width: 780px;
  font-size: 17px;
  line-height: 1.8;
}
.markdown-body h1 { border-bottom: 2px solid var(--accent); }
.markdown-body a { text-decoration: underline; }
```

### 5. Sidebar accent

```css
#sidebar { background: var(--bg-elevated); border-right: 2px solid var(--accent); }
.sidebar-item.is-active { background: var(--accent-soft); font-weight: 600; }
```

---

## Tips

- **Scope to a theme:** Prefix with `:root[data-theme='dark']` / `soft` / `light` to override only that theme; plain `:root` applies to all.
- **Per-theme files:** You can keep three snippets commented and uncomment the one you want, or swap themes via `Ctrl+Shift+T` and see your global overrides adapt.
- **Invalid CSS is ignored** — the watcher catches `insertCSS` errors and shows a toast, your file is not deleted.
- **Location:** Run `Open` → gear button shows the resolved path (`%APPDATA%\LiveMD\custom.css`) in the modal footer; copy it to edit externally in VS Code.
- **Remove:** Clear the textarea → Save, or delete `custom.css` on disk — LiveMD removes the injected style instantly.
- **No rebuild needed:** Share your `custom.css` with others; they drop it into `userData` and restart LiveMD.

---

## Reference

- Built-in themes: `src/renderer/src/style.css` — three `:root[data-theme='...']` blocks (search `/* Theme tokens */`).
- Custom CSS logic: `src/renderer/src/customCss.ts` + `src/main/index.ts` (`CUSTOM_CSS_FILE`, `applyCustomCss`, `watchCustomCss`, `customCss:load/save`).
- Variables are applied everywhere because new UI must use tokens, never hardcoded colors (see `src/renderer/src/style.css` — every component uses `var()`).

Happy theming!
