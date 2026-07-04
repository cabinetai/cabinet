# PRD — Cabinet Visual Design (Manila Arc)

**Status:** Shipped on `feat/manila-arc-borderless-ui`; this is the single source of truth for Cabinet's visual system.
**Author:** hilash · **Last updated:** 2026-07-04
**Driver:** Make Cabinet feel like a native desktop app, not a website — a borderless, content-first surface where bright "sheets" of content float on a manila **desk**, the chrome recedes into the background, and every file type reads as one coherent system.

> **Supersedes** the "removed the sheet-like rounded container" direction noted in `CABINET_UI_WORK_SUMMARY.md` (2026-04-12). That was an intermediate flat phase; the floating-sheet model below is the current, deliberate language.

---

## 1. Vision & principles

Cabinet is a desk. You put bright sheets of paper (pages, code, tables, diagrams, apps) on it, and the desk — a warm manila surface — shows around and behind them. The app frame, toolbars, tabs, and rails all live *on the desk*, in its muted tone, so nothing competes with the content.

Five principles drive every surface:

1. **Content leads.** The bright content sheet is the only thing at full contrast. Chrome is muted and sits *outside* the sheet.
2. **No borders — use elevation and tone.** We do not draw boxes around things. Separation comes from (a) a soft drop shadow lifting the sheet off the desk, (b) the tone contrast between the manila desk and the bright sheet, and (c) generous rounded corners. A 1px border is a last resort, never the default container.
3. **One system.** Every file viewer — markdown, code, CSV, image, PDF, mermaid, notebook, office, an embedded app — wears the same chrome in the same place, in the same tone. A user should never be able to tell "which viewer built this toolbar."
4. **Rounded, soft, physical.** Corners are large and consistent; the sheet feels like a real object floating a few millimetres above the desk. Motion is gentle (fades, short slides), never mechanical.
5. **Theme-aware.** The desk/sheet relationship holds in every theme — the desk is always *slightly* darker than the sheet, even for pure-white themes, so the sheet always reads as lifted.

---

## 2. The desk & sheet model (the core metaphor)

The app is a full-viewport **desk** (`--gutter`). It never scrolls. Inside it, each view's main content floats on an elevated **ContentSheet**:

- **Rounded:** `border-radius: var(--sheet-radius)` (= `--radius-2xl`, ~18px).
- **Lifted:** `box-shadow: var(--sheet-shadow)` — a soft, diffuse drop shadow (dark themes add an inset top highlight so the sheet reads as lifted, not smeared).
- **Inset on all four sides** so the desk gutter breathes around every corner. The desk supplies the top + inline-end padding (app shell); the sheet supplies its own inline-start + bottom margin (`10px` each). Result: the sheet floats free, all four rounded corners visible.
- **No border.** The shadow + the gutter/sheet tone difference do all the separating.

```
┌─────────────────────────────────────────────┐  ← desk (--gutter, manila)
│  breadcrumb · badge          toolbar actions │  ← chrome ON the desk (transparent)
│  ╭─────────────────────────────────────────╮ │
│  │                                          │ │  ← ContentSheet (--background,
│  │            the content                   │ │     rounded + soft shadow, inset)
│  │                                          │ │
│  ╰─────────────────────────────────────────╯ │
│  ● Online · File history · 2 uncommitted …    │  ← status bar ON the desk, below the sheet
└─────────────────────────────────────────────┘
```

**Rule:** Chrome (toolbars, tabs, breadcrumbs, the status bar, the daemon-health banner) lives *outside* the sheet, on the desk. Only content goes inside the sheet.

---

## 3. Chrome lives on the desk

Everything that isn't content is rendered on the transparent desk, in the muted tone, so it never competes:

- **Breadcrumb + file badge** — top-left, muted; the leaf is the only emphasized (foreground) token, like the page's identity.
- **Toolbar actions** — top-right, muted (see §4).
- **Folder tabs** — on the desk, connecting *down* into the sheet (see §5).
- **Status bar** — below the sheet, on the desk (server status, file history, uncommitted count, sync, terminal, stars, share).
- **Daemon-down banner** — a floating, themed rounded card on the desk, not a full-width stripe.

The markdown editor and folder views established this pattern; **every other viewer now follows it** via `ViewerLayout` (§4).

---

## 4. The unified toolbar

Three components, one look:

### `ViewerLayout` — the scaffold
`{toolbar on the desk}` + `<ContentSheet>{body}</ContentSheet>`. Every file viewer renders through it, so the toolbar is always on the desk and only the body floats. Viewers that use it are listed in app-shell's `bareLayout` so they opt out of the shell's whole-view sheet (otherwise the body would be double-sheeted and the toolbar would sit back on the bright page).

### `ViewerToolbar` — the shared shell
A single `md:h-10` row: `[breadcrumb + badge + sublabel]` on the left, `[viewer-specific actions] · [search] · [New Chat]` on the right. It reserves an inline-start gap for the collapsed-sidebar toggle via `--sidebar-toggle-offset` (§6).

### `ToolbarButton` — the one button
Every toolbar affordance (per-viewer actions **and** the global search/exit-browse) is a single component so the tone can't drift:

- **Muted by default:** `text-muted-foreground/70`, hover → `bg-accent` + `text-foreground` (the same style the markdown formatting bar uses).
- **Icon-first.** Common actions are icon-only with a tooltip (e.g. *Open in new tab* is just `↗`). Labels are kept only where the icon isn't self-evident (Wrap, Raw, Code, SVG, Reveal).
- **Toggle state** via `active` (subtle `bg-muted`, not a brand color).
- Renders a `<button>` or an `<a>` (for download / open-raw links) from the same props.

**The one exception:** the split **New Chat** CTA (`NewTaskButton`) stays the brand-primary (rust) button. It is the single call-to-action per surface; everything else recedes. Nothing else in the toolbar is at full contrast.

---

## 5. Folder tabs

When a folder page has both an `index.md` and children, a **Page / Files** tab strip renders on the desk directly above the sheet — real-world file-folder tabs:

- `border-radius: 9px` on the top corners only.
- The **active** tab shares the sheet's fill (`--background`) and overlaps the sheet's top edge by 1px (`-mb-px`) so the two read as one continuous folder.
- **Inactive** tabs recede — muted fill, shorter, behind the active one.
- A small start-pad (`ps-2`) keeps the first tab from sitting flush against the sheet's rounded corner.

Same component (`FolderTabs`) is reused by the Tasks board and Agents views, so the tab language is identical everywhere.

---

## 6. The sidebar (rail merges into the desk)

- The sidebar rail is painted in **the same color as the desk** (`--sidebar` == `--gutter`) with **no dividing border** — it *is* part of the desk. The content sheet floating to its right is what creates the separation.
- Collapsing animates only the `<aside>` width (the tree never reflows mid-animation).
- **When collapsed**, a single expand toggle floats at the top-left. It sits in the *same band as the toolbar* (desk `paddingTop` 10px + the `h-10` toolbar row), vertically centered, styled as a muted toolbar button — so it reads as the first toolbar button, not a floating orphan. `ViewerToolbar` reserves the matching inline-start gap so the breadcrumb never slides under it.
- `--traffic-clearance` (80px on LTR desktop/Electron builds) reserves room for the macOS traffic-light buttons in the sidebar header.

---

## 7. The right-click menu is the home for meta actions

To keep toolbars minimal, per-file *meta* actions moved off the chrome and into the sidebar right-click menu (`tree-node`). The menu has two groups — **"Add to this item"** (Add Sub Page, New Folder, Create New File, Import File/Folder, Connect Knowledge, Create Cabinet Here) and **"This item"** — with destructive actions (Delete / Unlink) last. Recent additions to "This item":

- **File history** — the per-file timeline slide-over (was a toolbar button; now a globally-mounted panel opened from here or the cabinet dashboard).
- **Search** — opens the ⌘K palette (also stays in the toolbar).
- **Download ▸** — a submenu mirroring the editor's Export menu: for markdown pages, *Copy as Markdown / Copy for LLMs / Copy as HTML / Download Markdown*; for any other file, *Download file* (raw). Both the toolbar Export menu and this submenu call the same `page-export` actions.

Linked ("Connect Knowledge") nodes swap **Rename → Edit Symlink** and **Delete → Unlink**.

---

## 8. Design tokens

| Token | Value | Meaning |
|---|---|---|
| `--radius` | `0.625rem` (10px) | Base radius; a scale runs `--radius-sm`(0.6×) … `--radius-4xl`(2.6×). |
| `--sheet-radius` | `--radius-2xl` (~18px) | The floating content sheet's corner radius. |
| `--sheet-shadow` | `0 10px 28px -6px rgb(0 0 0 / .14)` | The sheet's lift (dark themes add an inset top highlight + deeper shadow). |
| `--gutter` | `color-mix(oklch, background 90%, foreground 10%)` | The desk. Always slightly darker than the sheet so the sheet reads as lifted. Paper theme overrides it with a warm manila `oklch(0.925 0.026 79)`; dark themes mix toward black. |
| `--sidebar` | `== --gutter` | The rail merges into the desk. |
| `--sidebar-toggle-offset` | `2.25rem` when collapsed, else `0` | Inline-start gap the toolbar reserves for the floating expand toggle. |
| `--traffic-clearance` | `80px` (LTR desktop) | Room for macOS window controls. |
| Desk inset | `10px` | Gutter around the sheet (top + inline-end from the shell; inline-start + bottom from the sheet). |
| Task-rail gutter | `30px` | Inline-end reserve when the task rail is open (the app shrinks into the remaining width). |

`--gutter` **must** be defined as a CSS rule in `globals.css`, not as an inline theme variable — an inline var on the theme root wouldn't cascade to the desk correctly (the paper theme learned this the hard way).

---

## 9. Responsive & platform

- **Mobile:** the floating-sheet model collapses to **full-bleed** — the ContentSheet drops its radius, shadow, and insets and fills the viewport (no desk showing). Chrome shifts to a bottom nav.
- **Desktop / Electron:** full desk with insets; `--traffic-clearance` reserves the traffic-light zone; the desk itself never scrolls (only the sheet body and the sidebar rail do).
- **Task rail open:** the whole app shrinks into `viewport − 30px` and the fixed, full-height rail lives in that inline-end gutter.

---

## 10. Component inventory (where it lives)

| Concept | File |
|---|---|
| Desk + shell layout, `bareLayout` list | `src/components/layout/app-shell.tsx` |
| The floating sheet | `src/components/layout/content-sheet.tsx` |
| Viewer scaffold (toolbar on desk + body in sheet) | `src/components/layout/viewer-layout.tsx` |
| Shared toolbar shell | `src/components/layout/viewer-toolbar.tsx` |
| The one toolbar button | `src/components/layout/toolbar-button.tsx` |
| Global search affordance | `src/components/layout/header-actions.tsx` |
| Markdown editor toolbar (Export menu) | `src/components/layout/header.tsx` |
| Folder tabs | `src/components/layout/folder-tabs.tsx` |
| Sidebar rail + collapse toggle | `src/components/sidebar/sidebar.tsx` |
| Right-click menu (history, search, download submenu) | `src/components/sidebar/tree-node.tsx` |
| Export actions (shared toolbar + menu) | `src/lib/markdown/page-export.ts` |
| Asset / content URL resolution | `src/lib/cabinets/asset-url.ts` |
| Status bar | `src/components/layout/status-bar.tsx` |
| Tokens | `src/app/globals.css`, `src/lib/themes.ts` |

---

## 11. Status & open items

**Shipped:** the desk/sheet model, chrome-on-desk, all 14 file viewers migrated to `ViewerLayout`, unified `ToolbarButton` tone, folder tabs, collapsed-sidebar toggle alignment, file-history/search/download moved into the right-click menu.

**Known open items (not yet unified):**
- **Dark viewer canvases.** The image, media, and code bodies still paint a near-black backdrop inside their (now floating) sheets. Intentional for now, but a candidate for a theme-aware surface / subtle checkerboard.
- **Cabinet dashboard (`cabinet-view`).** The cabinet overview is a distinct surface, not a file viewer, and hasn't been folded into `ViewerLayout`. Its toolbar still carries an inline history button.
- **Markdown toolbar overflow.** The full formatting bar can still overflow at narrow widths (scroll-chevron). A future pass may collapse rarely-used controls into a "Format ▾" popover.

---

## 12. Rules for adding a new surface

1. **Render your toolbar on the desk, your body in a `ContentSheet`.** Use `ViewerLayout` — do not wrap your whole view in a sheet.
2. **Add your view's type flag to `bareLayout`** in `app-shell` so the shell doesn't sheet you again.
3. **Every button is a `ToolbarButton`.** Don't hand-roll a toolbar button; you'll drift the tone. Icon-only unless the icon isn't obvious. Exactly one brand CTA per surface (usually the shared New Chat).
4. **No borders.** Separate with the sheet's elevation + the desk tone. Reach for a 1px line only when elevation genuinely can't express the relationship.
5. **Meta actions go in the right-click menu**, not the toolbar — history, export/download, path copies. Keep the toolbar to what you *do to the content in view*.
6. **Test collapsed sidebar + mobile.** The toggle must land on the toolbar band; the sheet must go full-bleed on mobile.
