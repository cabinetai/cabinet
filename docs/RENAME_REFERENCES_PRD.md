# PRD — Rename That Keeps Links Alive

Status: in development
Owner: hilash
Last updated: 2026-05-18

## 1. Problem

Cabinet has a wiki-link system: `[[Page Name]]` in markdown is rendered as a
link that resolves to a page by slug (`#page:<slug>`, slug = lowercased,
non-alphanumeric → `-`). Resolution is by the **last path segment** of a page
(`findPageBySlug` in `editor.tsx`), with a sibling-of-current-page preference
when several pages share a slug.

Renaming a page or folder today (`renamePage` in `page-io.ts`) does exactly two
things: it renames the directory on disk and rewrites the page's own
frontmatter `title`. **Every `[[Old Name]]` elsewhere silently breaks** — the
old slug no longer resolves to anything. There is no backlink index, so the
user gets no warning and no way to find the now-dead links.

For a linked-notes product this is a correctness bug, not a missing nicety.
Obsidian / Notion / Roam all repair links on rename; users expect the same.

## 2. Goal

Renaming a page or folder updates every wiki-link that pointed at it, with
zero added friction in the common case, and is fully reversible.

Non-goals (explicitly out of scope for this iteration):

- A persistent backlink index / "Linked references" panel. We do an
  on-demand scan at rename time. (The scan is structured so a future index can
  reuse it.)
- A per-link review checklist UI ("select some / select all"). Decided
  against: renaming and wanting *some* links left pointing at a dead slug is
  essentially never intended. Friction tax on a ~100%-yes decision. May be
  revisited only if users ask.
- Alias syntax (`[[target|label]]`). Not currently supported by the parser;
  unchanged here.

## 3. Solution

### 3.1 Auto-update by default

On rename, after the directory is moved and frontmatter updated:

1. Snapshot the page list **before** the move (paths + names) so resolution
   reflects pre-rename reality.
2. Walk every `*.md` under the data dir (skipping hidden/ignored dirs, same
   rules as the tree builder).
3. For each `[[X]]` occurrence: if `slugify(X)` equals the renamed page's
   **old** slug, replay the exact resolution logic (`findPageBySlug`,
   including sibling preference, evaluated from the file that contains the
   link). Rewrite the occurrence's inner text to the new name **only if it
   resolves to the page being renamed**.
4. Pages that share the old slug but are *not* the rename target keep their
   links untouched — those links still resolve correctly because that other
   page still owns the old slug.

This precision matters: blind text replacement would repoint links that
legitimately targeted a different same-slug page. We only rewrite links that
actually resolved to the renamed page.

### 3.2 Toast + Undo (no blocking dialog)

After a successful rename the sidebar shows a single toast:

> Renamed "Old" → "New" · updated **N** links in **M** pages   **[Undo]**

- The count is the trust signal. It is computed from writes that actually
  landed, after the disk writes succeed — never optimistic.
- If zero links were affected, the toast omits the "updated …" clause
  (just confirms the rename) — no Undo needed for a no-op rewrite, though
  Undo still reverts the rename itself.
- Actionable toasts dwell longer (~10s) than the default (4.5s) because Undo
  is a real decision.
- **Undo is real, not cosmetic.** It reverses the directory rename *and*
  restores every rewritten file to its exact pre-rename bytes. Undo state is
  held server-side (in-memory, last 8 renames, 10-min TTL) so large file
  contents never round-trip through the client.

### 3.3 Open-editor reconciliation

The editor holds page content in memory; a rename mutates files underneath it.

- If the **renamed page itself** is open → the editor navigates to the new
  path and reloads.
- If an **open page is one of the rewritten referrers** and has no unsaved
  edits → it is reloaded so the corrected `[[New Name]]` shows immediately
  and a later autosave can't overwrite the fix with stale `[[Old Name]]`.
- If that open referrer *has* unsaved edits → it is left alone (we never
  clobber unsaved work); the on-disk copy is still correct.

## 4. Edge cases

| Case | Behaviour |
|---|---|
| Slug unchanged (e.g. "Foo" → "Foo ") | Early return, no scan, no toast churn. |
| Two pages share old slug, link targeted the *other* one | Not rewritten (resolution check fails). |
| Two pages share old slug, link targeted the renamed one via sibling preference | Rewritten; new name re-slugs and still resolves. |
| `[[foo bar]]`, `[[Foo  Bar]]`, `[[FOO-BAR]]` all point at it | All matched (compared by slug, not raw text). |
| Link inside a code fence / inline code | Treated like any other text (matches current renderer behaviour, which also linkifies them). Documented limitation, not regressed. |
| Folder (no `index.md`) rename | Same path: child pages move with it; links that resolved to the folder's slug are updated identically. |
| A referrer write fails mid-batch | Successful writes still counted; failures surfaced; Undo reverts whatever landed. |
| Undo token expired / already used | Undo button reports it can no longer undo; no partial state. |

## 5. Implementation map

- `src/lib/markdown/wiki-links.ts` — canonical `slugifyPageName`, wiki-link
  occurrence parser. Shared by renderer and rename logic.
- `src/lib/storage/references.ts` — page scan, server-side
  `resolvePageBySlug` mirroring `editor.tsx#findPageBySlug`, rename rewrite.
- `src/lib/storage/rename-undo.ts` — in-memory undo registry.
- `src/lib/storage/page-io.ts` — `renamePage` returns
  `{ newPath, references }`.
- `src/app/api/pages/[...path]/route.ts` — PATCH returns `references`.
- `src/app/api/references/undo/route.ts` — `POST { token }` → inverse.
- `src/lib/api/client.ts` — `renamePageApi` returns references; `undoRenameApi`.
- `src/stores/tree-store.ts` — toast w/ Undo + editor reconciliation.
- `src/components/layout/system-toasts.tsx` — optional action button + dwell.

## 6. Acceptance

1. Page B contains `[[Alpha]]`; rename "Alpha" → "Alpha Prime". B now contains
   `[[Alpha Prime]]` and the link resolves. Toast shows "1 link in 1 page".
2. Undo on that toast restores `[[Alpha]]`, the original slug/directory, and
   B's bytes exactly.
3. Two pages slug `notes` in different folders; a sibling link to one is
   rewritten on its rename, the link to the other is untouched.
4. Renaming with no inbound links shows only the rename confirmation.
5. Renaming the currently-open page keeps it open at the new path.
6. `npm test` passes (new `test/rename-references.test.ts`); `npm run lint`
   and typecheck clean.
7. Verified live via Chrome DevTools against the running app.
