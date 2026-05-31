# Sidebar — design notes & plan

Living document for the left sidebar (`src/components/sidebar/`). Captures the UX decisions, data model, and architecture so the next person (or model) doesn't have to reverse-engineer it.

---

## Goals

1. Sidebar is the primary navigation surface — must read at a glance, scan well, and stay quiet so cabinet content + agent state are the visual focus.
2. Reorganizing knowledge (move + reorder) should feel as easy as in a desktop file manager — drag-and-drop with clear feedback, plus a keyboard/discoverability fallback.
3. Every drag, drop, or move is observable. Silent failures are not acceptable.

---

## Visual hierarchy

Section landmarks:

- `AGENTS / TASKS / DATA` headers: `text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`. These are the only "loud" labels.
- List items (agent rows, page rows): `text-[12px] text-foreground/75`. Hover lifts to `text-foreground` and adds `bg-foreground/[0.03]` (very slight — must not compete with selected-row treatment).
- Selected row: `bg-accent text-accent-foreground font-medium`.
- Cursor: wildcard `[&_button]:cursor-pointer` on the `<aside>`; tree rows override with `!cursor-grab active:!cursor-grabbing` since they're draggable.

Indentation:

- `pad(depth) = depth * 16 + 8` pixels of left padding.
- `TreeNode` and the section headers in `tree-view.tsx` use the same formula so children align under their parents.
- Initial `TreeNode` depth is `1` (sections are depth `0`).

Agent rows:

- Single-line layout: `[colored chip] Name • status-dot`.
- Chip: 20×20 rounded, tinted with `getAgentColor(slug)` from `src/lib/agents/cron-compute.ts` (8-color muted palette, hash-mapped per slug). Same palette the schedule uses, so sidebar matches the heartbeat timeline.
- Status dot: `bg-green-500` if active, `bg-muted-foreground/30` otherwise. No tooltips — quiet by design.

Section + button affordance (`+` on `AGENTS`/`TASKS`/`DATA`):

- Hidden by default; revealed on group hover with **0.2s delay** before showing (`opacity-0 group-hover:opacity-100 group-hover:delay-200`), instant fade-out. Reveal-only, not hide.
- Each routes to its section first, then dispatches a `CustomEvent` to open the right dialog:
  - `cabinet:open-add-agent` (consumed by `agents-workspace.tsx`)
  - `cabinet:open-create-task` (consumed by `tasks-board.tsx`)
  - DATA `+` opens `kbSubPageOpen` directly (or clicks the hidden `[data-new-page-trigger]` for root scope).

Scrollbar:

- 8px wide, gap on the **content side** (between content and scrollbar, not between scrollbar and viewport edge). Scoped via Tailwind arbitrary selectors so other `ScrollArea`s in the app are untouched:
  ```tsx
  [&_[data-slot=scroll-area-scrollbar]]:w-2
  [&_[data-slot=scroll-area-scrollbar]]:pl-1
  [&_[data-slot=scroll-area-scrollbar]]:pr-0
  [&_[data-slot=scroll-area-scrollbar]]:border-l-0
  ```

---

## File layout

```
src/components/sidebar/
  sidebar.tsx              — Shell: header, resize handle, settings button, mobile overlay
  tree-view.tsx            — All sections (Cabinet/Agents/Tasks/Data), MoveTo + dialogs, Cmd+Shift+M
  tree-node.tsx            — Recursive page node: drag/drop, context menu, insertion lines
  move-to-dialog.tsx       — Cmd+K-style searchable folder picker
  new-page-dialog.tsx      — KB page creation (footer button)
  new-cabinet-dialog.tsx   — Cabinet creation (footer button + context menu)
  link-repo-dialog.tsx     — Linked-repo metadata
```

Supporting:

- `src/stores/tree-store.ts` — Zustand: `nodes`, `selectedPath`, `expandedPaths`, `dragOverPath`, `dragOverZone`, `movingPaths`, plus `loadTree`, `movePage`, `createPage`, `deletePage`, `renamePage`.
- `src/lib/storage/order-store.ts` — Frontmatter + sidecar I/O for the `order` field.
- `src/lib/storage/tree-builder.ts` — Walks `/data`, merges sidecar orders, sorts by `(order ?? Infinity, title)`.
- `src/components/layout/system-toasts.tsx` — Listens for `cabinet:toast` `CustomEvent`s.

---

## Move & reorder

The user complaint that drove this: "I find it complicated to move and order files and folders." The previous DnD only supported drop-onto (re-parent); no reordering, no Move-To affordance, silent failures.

### Data model — `order` field

- Markdown-backed nodes (file / directory / cabinet / app / website with `index.md`): `order` lives in the YAML frontmatter of `index.md` or `<name>.md`.
- Non-markdown leaves (PDF / CSV / image / code / video / audio / mermaid / unknown): order lives in a single per-directory sidecar `.cabinet-order.yaml` (hidden from listings via `isHiddenEntry`).
- Indexing: integers with **gap of 100** (10, 110, 210…). Insertion picks the midpoint between the two neighbors. When the gap closes (no integer fits), the directory's siblings are renumbered in one pass.
- Sort fallback: `(order ?? Number.POSITIVE_INFINITY, localeCompare(title))` — items without an order sort alphabetically *after* ordered ones.
- New items (created via `createPage`) get `max(siblingOrders) + 100` so they append at the end.
- First reorder in a directory with legacy unordered items triggers a one-time renumber so future midpoint inserts are stable.

### `order-store.ts` API

```ts
// Read/write a single entry's order — dispatches between frontmatter and sidecar.
getEntryOrder(parentVirtualPath, name): Promise<number | null>
setEntryOrder(parentVirtualPath, name, order): Promise<void>
removeSidecarEntry(parentVirtualPath, name): Promise<void>

// List all orderable siblings (sorted), used for midpoint computation and renumber.
listOrderedSiblings(parentVirtualPath): Promise<{ name, order }[]>

// Renumber an entire directory's siblings: 100, 200, 300…
renumberSiblings(parentVirtualPath): Promise<void>

// Compute a new order value for an item being placed between prev/next.
// Triggers renumber if a referenced neighbor has a null order or the midpoint gap is closed.
computeInsertOrder(parentVirtualPath, prevName, nextName, selfName?): Promise<number>

// Append at end of dir (used by createPage and cross-dir moves with no neighbors).
appendOrder(parentVirtualPath): Promise<number>
```

### Drag-and-drop hit zones

`tree-node.tsx` splits each row into three vertical zones based on `e.clientY` vs `getBoundingClientRect()`:

- **Containers** (directory / cabinet): top 25% = `before` (insert above), middle 50% = `into` (nest), bottom 25% = `after` (insert below).
- **Leaves** (file / pdf / csv / image / code / etc.): top 50% = `before`, bottom 50% = `after` (no `into`).

Visual feedback:

- `before` / `after`: 2px primary-color insertion line at the row's top or bottom, indented to match content (`left: depth * 16 + 8`, `right: 1.5 * 4`).
- `into`: existing `bg-primary/10 ring-1 ring-primary/30 ring-inset` treatment.
- The `dragOverZone` lives in the tree store alongside `dragOverPath` so only one row shows feedback at a time.

`siblings: TreeNodeType[]` is passed from `tree-view.tsx` (root) and from each parent's recursive render. On drop, the drop handler:

1. Filters self out of `siblings` (cross-dir drops where source != target dir don't filter — there's no overlap).
2. Finds the target's index in `visible`.
3. Computes `insertIndex` (`zone === "before"` → target's index, `zone === "after"` → target's index + 1).
4. Resolves `prev` / `next` from `visible[insertIndex - 1]` and `visible[insertIndex]`.
5. Calls `movePage(fromPath, targetParent, { prevName, nextName })`.

### Drag image (rounded ghost)

Browsers screenshot the dragged element by default — that gives rectangular corners and a faded look. To get a themed, rounded preview:

```ts
const ghost = source.cloneNode(true) as HTMLDivElement;
ghost.style.position = "fixed";
ghost.style.top = "-1000px";
ghost.style.borderRadius = "8px";
ghost.style.background = "var(--popover)";
ghost.style.border = "1px solid var(--border)";
ghost.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18) ...";
ghost.style.padding = "4px 8px";
document.body.appendChild(ghost);
e.dataTransfer.setDragImage(ghost, 12, 12);
// Cleaned up in onDragEnd.
```

### "Move to…" dialog

`move-to-dialog.tsx` — Cmd+K-style picker for keyboard / discoverability:

- Triggered from the tree-node context menu ("Move to…" with `ArrowRightLeft` icon) and via `Cmd+Shift+M` on the currently selected node (handler in `tree-view.tsx`).
- Flattens the tree into a list of valid targets: only `directory` and `cabinet` types, excludes the source and any descendant of the source.
- Includes a "Root" (`Home` icon) entry at the top.
- Fuzzy filter is a simple substring match against `title + path`.
- Arrow keys + Enter to select; the source's current parent is shown but disabled with a "current" label.

### API surface

`PATCH /api/pages/[...path]` accepts:

```ts
{
  toParent?: string;        // virtual path of destination parent (or "" for root)
  prevName?: string | null; // name of sibling that should land directly above
  nextName?: string | null; // name of sibling that should land directly below
  rename?: string;          // alternative branch — pure rename, no move
}
```

The server resolves order *after* `fs.rename` so neighbor lookups happen in the destination directory. If neither `prevName` nor `nextName` is given, the moved item appends at the end.

### EXDEV fallback

`fs.rename` throws `EXDEV` when source and destination are on different filesystems — common when a "sister cabinet" is actually a linked external folder on another volume. `page-io.movePage` catches this and falls back to `fs.cp({ recursive: true })` + `fs.rm({ recursive: true, force: true })` so the move still succeeds. Without this fallback, the rename silently failed and the user saw nothing change.

### Move feedback

Tree store tracks `movingPaths: Set<string>`. The `movePage` action:

1. Adds `fromPath` to `movingPaths`, triggering the spinner overlay on the affected row (`Loader2`, opacity 60%, `pointer-events-none`).
2. Calls `movePageApi`. On success:
   - Refreshes the tree (`loadTree`).
   - Auto-expands the destination parent and selects the moved item so it's visible.
   - Dispatches `cabinet:toast` info event ("Moved to <parent>").
3. On error:
   - Dispatches `cabinet:toast` error event with the actual server message (forwarded from `movePageApi` which now reads `body.error`).
4. Always: removes `fromPath` from `movingPaths` in `finally`.

### Toast system

`SystemToasts` (`src/components/layout/system-toasts.tsx`) is a generic listener for `cabinet:toast` `CustomEvent`s with `{ kind: 'info' | 'success' | 'error', message: string }`. Mounted in `app-shell.tsx` next to `NotificationToasts`. Distinct from `NotificationToasts` (which is conversation-completion-specific) — this one is the catch-all for system feedback.

---

## Conventions, gotchas, future

- **Path conventions:** standalone `.md` files have their `.md` stripped from `node.path` in `tree-builder.ts:240`. This is a known wart — the `movePage` flow works for directories and non-md leaves but standalone-`.md` moves resolve to a path without `.md` and `fs.rename` would 404. Out of scope here; flagged for a future cleanup.
- **Sidecar lifecycle:** when a non-md file moves, `removeSidecarEntry(fromParent, name)` cleans the source. The destination's order is written by `setEntryOrder`. Empty sidecars are auto-deleted in `writeSidecar`.
- **Concurrency:** the order computation reads sibling orders, computes a midpoint, and writes — there's no mutex. Two simultaneous reorders in the same directory could race. Acceptable risk for a single-user desktop app; revisit if multi-client.
- **Hit-zone math** depends on `getBoundingClientRect` per-event — fine at sidebar scale (dozens of rows), would want throttling on a virtualized 10k-row tree.
- **Visibility filtering:** when inside a cabinet view, `visibleTreeNodes = activeCabinet.children` — sibling cabinets are not in the rendered tree, so dropping on a sister cabinet only works from the root view. This is by design but worth knowing.
- **Cmd+Shift+M** binds against the currently selected node (`useTreeStore.getState().selectedPath`). If nothing is selected, the shortcut is a no-op.

### Possible follow-ups

- Multi-select drag-drop (shift-click range, ctrl-click toggle).
- Undo for the last move (the move is destructive on disk — currently relies on `git` history).
- Server-side mutex per parent dir if order races become observable.
- Surface the `+` add-affordance on every directory row, not only on the section headers.
- Drag autoscroll when dragging near the top/bottom edge of the scroll area.
