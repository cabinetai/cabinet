# PRD — Sidebar Context Menu, File Creation & Knowledge Links

**Status:** In progress · **Author:** hilash · **Date:** 2026-05-22
**Driver:** Direct user feedback on the sidebar right-click menu (see screenshot in the originating thread).

---

## 1. Summary

The sidebar context menu (`src/components/sidebar/tree-node.tsx`) is Cabinet's primary
file-management surface, but it under-explains what its actions do, exposes only a sliver
of Cabinet's file-type support, and the tree it lives in feels janky when dragging items.

This PRD covers six connected improvements:

1. **Knowledge-link clarity** — make it obvious that "Load Knowledge" creates a *symlink*,
   rename it to **Connect Knowledge**, and add an **Edit Symlink** action that shows the
   real on-disk target and lets the user re-point it.
2. **Import Folder** — add folder import alongside file import, and standardise the `…`
   (ellipsis = "opens a picker/dialog") convention.
3. **Create New File of Type** — a visual picker that exposes *every* file type Cabinet
   supports (native, Office, Google), so users discover capabilities and create files
   directly from the tree.
4. **Chat-editor handoff** — after a new file is created, open it in the editor *and* pop
   the AI composer pre-seeded with a friendly, file-aware prompt ("Hi Jane — what would
   you like to do in this file?").
5. **Finder-parity menu + keyboard shortcuts** — restructure the menu to feel like macOS
   Finder and attach shortcuts to most actions.
6. **Smooth drag-and-drop** — kill the jank: optimistic moves (no full tree refetch),
   memoised rows, throttled drag-over.

## 2. Goals & non-goals

**Goals**
- The menu *teaches*: every action's effect is legible at a glance.
- Creating any supported file type is one right-click away.
- Linked ("knowledge") nodes are inspectable and editable, not opaque.
- Dragging a node feels instant.

**Non-goals (this pass)**
- In-app editing of Office formats (.docx/.pptx/.xlsx stay read-only viewers; edits happen
  externally via *Open in Finder*).
- Creating real Google Docs via the Google API/OAuth (we create a `google:` frontmatter
  stub; full provisioning is future work).
- Tree virtualization (deferred; memoisation + optimistic moves address the reported jank
  first — revisit if very large trees still stutter).

## 3. Decisions (from product Q&A, 2026-05-22)

| Question | Decision |
|---|---|
| Build scope | **Everything** — all six areas, in incremental commits. |
| New-file types | Native (Markdown/Code/Mermaid/CSV) **+ blank Office** (.docx/.pptx/.xlsx) **+ Google stubs** (Doc/Sheet/Slides). |
| Chat editor | After create → open editor → open the AI composer with a friendly, file-aware **placeholder**. Reuses the existing AI/`editor`-agent surface. |
| Edit Symlink | **View + re-point + metadata** — show KB path & resolved target, allow choosing a new target folder, edit name/description. |
| "Load Knowledge" naming | Rename to **Connect Knowledge**, with a muted **Symlink** tag in the menu row. |

---

## 4. Current state (as built)

- **Menu** lives in `tree-node.tsx` (rows hardcoded, mostly not i18n'd) with a sibling root
  menu in `tree-view.tsx`. Sections: *Add to this item* / *This item* / Delete.
- **Knowledge links**: "Load Knowledge" → `LinkRepoDialog` → `POST /api/system/link-repo`
  → `fs.symlink(target, "dir"|"junction")`, writes `.cabinet-meta` (+ `.repo.yaml` for git
  repos). Node carries `isLinked` (from `entry.isSymbolicLink()`), shows `Link2` icon,
  deletes as "Unlink" via `unlinkSymlink()`. **No target display or edit today.**
- **File types** (`tree-builder.ts` `classifyFile`): md, code, image, video, audio, mermaid,
  csv, pdf, docx, xlsx, pptx, notebook, website, app, unknown. Office = read-only viewers
  (`docx-preview`/SheetJS/`pptx-preview`). Google = `google:` frontmatter iframe embed.
  **Creation today is markdown-only** (Add Sub Page) + folders.
- **Import**: `useFileImport` → HTML `<input type=file multiple>` → `POST /api/upload/...`.
  **No folder import.**
- **Shortcuts**: only Rename (F2), Move (⌘⇧M), Delete (⌘⌫) — via `src/lib/keys.ts`.
- **DnD**: custom HTML5; after every move `tree-store.movePage` calls `loadTree()` (full
  refetch + full re-render). `TreeNode` is **not** memoised; `setDragOver` fires on
  drag-over zone changes.

---

## 5. Feature specs

### F1 — Knowledge-link clarity

**F1.1 Rename + tag.** "Load Knowledge" → **Connect Knowledge** with a right-aligned muted
`Symlink` tag so users learn the action creates a symbolic link. `LinkRepoDialog` title and
copy updated to match. (Keep `/api/system/link-repo` route name for compatibility.)

**F1.2 Edit Symlink dialog.** For `isLinked` nodes, the *This item* section shows
**Edit Symlink…** (replacing the generic Rename for these nodes) opening a dialog that:
- Shows the **KB path** (virtual) and the **resolved on-disk target** (read-only, copyable).
- Lets the user **re-point** to a new folder via the system picker (delete + recreate the
  symlink, preserving the KB location and metadata).
- Lets the user edit **name** + **description** (writes `.cabinet-meta`).
- Surfaces a broken-target warning if `readlink` resolves to a missing path.

**API.**
- `GET  /api/system/symlink?path=<kbPath>` → `{ kbPath, target, exists, meta }`.
- `PATCH /api/system/symlink` `{ path, newTarget?, name?, description? }` → re-point and/or
  rewrite `.cabinet-meta`; `autoCommit`.

### F2 — Import Folder + ellipsis convention

**F2.1 Import Folder…** new row under *Add to this item*. In Electron, use the existing
`POST /api/system/pick-directory` to choose a source folder, then `POST /api/system/import-folder`
`{ source, parentPath }` recursively copies it in (skips junk: `.git`, `node_modules`,
`.DS_Store`, dotfiles by default; respects the upload blocklist for executables; caps total
size). Outside Electron, fall back to `<input type=file webkitdirectory>`.

**F2.2 Ellipsis convention.** `…` means "opens further UI (picker/dialog)". Apply
consistently: *Import File…*, *Import Folder…*, *Connect Knowledge…*, *Create New File…*,
*Edit Symlink…*, *Move to…*. Actions that execute immediately (Copy paths, Open in Finder,
Add Sub Page) get **no** ellipsis. Document in code comment.

### F3 — Create New File of Type

**F3.1 Picker.** New row **Create New File…** under *Add to this item* opens a dialog with a
responsive **icon grid** grouped by category, reusing `src/lib/ui/page-type-icons.tsx` for
visual consistency:
- **Native (editable in Cabinet):** Markdown Page, Code File (asks extension/name),
  Mermaid Diagram, CSV Table.
- **Office (blank, edit externally):** Word `.docx`, Excel `.xlsx`, PowerPoint `.pptx`.
- **Google (link stub):** Google Doc, Google Sheet, Google Slides.

Each card: icon + label + one-line "what this is". Selecting → name prompt (pre-filled
sensible default) → create → see F4.

**F3.2 Creation backend.** `POST /api/system/create-file`
`{ parentPath, type, name, ext?, googleUrl? }`:
- Native text types: write file with minimal starter content (`.md` via existing
  `createPage`; `.mermaid`/`.csv`/code as plain files).
- Office: generate a **valid blank** file. `.xlsx` via SheetJS (already a dep). `.docx` /
  `.pptx` via minimal OOXML built with `jszip` (new dep) in `src/lib/storage/office-templates.ts`.
- Google: create a `.md` page whose frontmatter carries `google: { kind, url }`. If no URL
  is supplied, store a stub the embed viewer prompts to fill.

**F3.3 Discovery.** The picker is also reachable from the empty-tree CTA and the root data
menu, so first-run users meet Cabinet's file-type breadth early.

### F4 — Chat-editor handoff

After **any** create flow (sub-page, new-file picker), the tree:
1. Selects + loads the new node in the editor (existing behaviour).
2. Dispatches `window.dispatchEvent(new CustomEvent("cabinet:open-editor-chat", { detail: { pagePath, fileName } }))`.
3. `app-shell` listens and opens the **right-side chat panel** (the same compose drawer the
   editor's "Ask AI" button uses) via `openTaskPanelCompose({ source: "editor",
   pinnedPagePath, defaultAgentSlug: "editor", greeting })`, where `greeting` is
   **"Hi {name} — what would you like to do in {fileName}?"** (`{name}` from the user's stored
   display name, else a generic friendly form). The composer opens empty and inviting; it
   never auto-submits.

This reuses the existing page-editing `editor` agent and the right-side chat drawer rather
than the centered task-prompt modal (per user feedback, the modal popup is not wanted here).

### F5 — Finder-parity menu + keyboard shortcuts

**F5.1 Structure** (macOS Finder-inspired ordering):
- *Add to this item*: Add Sub Page · New Folder · Create New File… · Import File… ·
  Import Folder… · Connect Knowledge… · Create Cabinet Here
- *This item*: Rename / **Edit Symlink…** (for linked) · Move to… · Copy Relative Path ·
  Copy Full Path · Open in Finder
- Delete / Unlink

**F5.2 Shortcuts** (rendered via `formatShortcut`, wired on the selected row mirroring the
existing F2/Del pattern; all guard `isEditableTarget`):

| Action | macOS | Win/Linux |
|---|---|---|
| Add Sub Page | ⌘N | Ctrl+N |
| New Folder | ⇧⌘N | Ctrl+Shift+N |
| Rename / Edit Symlink | F2 | F2 |
| Move to… | ⌘⇧M | Ctrl+Shift+M |
| Copy Relative Path | ⌥⌘C | Ctrl+Alt+C |
| Copy Full Path | ⇧⌥⌘C | Ctrl+Shift+Alt+C |
| Open in Finder | ⌘↵ | Ctrl+Enter |
| Delete / Unlink | ⌘⌫ | Del |

(Conservative: only bind keys that don't collide with editor/global shortcuts; render the
hint on every row even when the active-row listener is what fires it.)

### F6 — Smooth drag-and-drop

Root cause of jank: full `loadTree()` refetch after every move + unmemoised recursive rows
+ drag-over state churn.

- **Optimistic move** in `tree-store.movePage`: mutate the in-memory tree (remove from old
  parent, insert at target) and update `selectedPath` immediately; reconcile with the server
  result in the background; only `loadTree()` on error (rollback) — removing the
  blocking refetch from the hot path.
- **Memoise `TreeNode`** with `React.memo` (+ stable callbacks) so unaffected rows don't
  re-render on every drag-over tick.
- **Throttle drag-over**: already only sets state on zone change; additionally short-circuit
  when dragging over self/descendant.
- Verify with a large tree; if rows still stutter at scale, virtualization is the documented
  next step.

---

### F7 — Per-type file settings (added 2026-05-22)

Typed files that carry config get an **editable settings surface**, reached via a new
type-aware **Settings…** context item (shown only when the node has settings).

- **Google embeds** (markdown page with `google:` frontmatter): edit **kind**
  (docs/sheets/slides/forms/drive) + **URL**, with an "Open in Google" link. Saves by
  rewriting the page frontmatter.
- **Web apps / websites** (`index.html` dir): a **Page view ↔ Web App** toggle that *is* the
  "convert an HTML page into a web app" action — it writes/removes the empty `.app` marker
  (full-screen mode). Files are never changed.
- Extensible: the same dialog/endpoint can host settings for future typed files.

**API.** `POST /api/system/file-settings` `{ path, op: "google"|"appMode", … }`.

Also: the **Create New File** picker now shows each type's extension on its card (`.md`,
`.mermaid`, `.csv`, `.docx`… ; dynamic for code; a "Google" tag for embeds) plus a
"just type the name — Cabinet adds the extension" hint, so users don't double-type it.

## 6. Cross-cutting

**i18n.** New/!changed menu strings move into a `contextMenu` namespace (plus `newFile`,
`editSymlink`, `importFolder`) in `en.json`, wired with `t()`. `fallbackLng` covers the other
38 locales until a translation pass (`npm run i18n:translate`) runs — tracked as follow-up,
consistent with prior incremental i18n.

**New dependency.** `jszip` (pure-JS, ~100 KB) for minimal OOXML generation of blank
`.docx`/`.pptx`. `.xlsx` reuses the existing SheetJS dependency.

**Safety.** Re-pointing a symlink and importing a folder both touch the filesystem; both
`autoCommit` and validate paths via `resolveContentPath`. Re-point shows the old + new target
before applying. Folder import respects the executable blocklist and skips VCS/dependency dirs.

## 7. Phasing

1. PRD (this doc).
2. F1.1 + F5 — menu restructure, Connect Knowledge + Symlink tag, shortcuts, i18n.
3. F1.2 — Edit Symlink dialog + `/api/system/symlink`.
4. F2 — Import Folder + `/api/system/import-folder`.
5. F3 — Create New File picker + `/api/system/create-file` + office templates.
6. F4 — chat-editor handoff (`initialPlaceholder`, `cabinet:open-editor-chat`).
7. F6 — DnD performance.

Each phase keeps `npm run lint` + `tsc --noEmit` green.

## 8. Future / open

- Real Google Doc/Sheet/Slides provisioning via the Google integration (OAuth).
- Tree virtualization for very large data folders.
- Inline (in-editor) chat surface instead of the modal composer, if user testing prefers it.
- Translating the new `contextMenu` strings into all locales.
