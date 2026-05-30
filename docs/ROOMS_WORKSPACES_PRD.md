# PRD — Rooms (Workspaces) & the Home Switcher

**Status:** Shipped (v3 — true sibling rooms). Three known gaps tracked in §10.
**Author:** hilash · **Last updated:** 2026-05-27
**Driver:** A home-button switcher next to the logo that moves you between *rooms* (office, study,
research, personal…), where each room is its own isolated workspace — and lets you open any room in
its own window.

> **This is now the single source of truth.** The former `docs/ROOMS_V3_TRUE_ISOLATION_PLAN.md`
> (the v3 implementation companion) has been merged into this document; the file at that path is
> kept only as a stub redirect.

> **Version history.**
> - **v1 (draft):** flatten into `data/<room>/` with a destructive migration and "nothing shared."
> - **v2 (draft):** *lighter* — keep `data/` as both the root cabinet *and* the parent of all rooms,
>   surface the existing per-cabinet isolation, **no migration**.
> - **v3 (shipped, this doc):** v2's "root is the default room" turned out to be the bug, not a
>   feature — the root cabinet was simultaneously a room *and* the physical parent of every other
>   room, so isolation could only be faked with a UI filter. v3 makes `data/` a neutral **home
>   container** and every room a true **sibling cabinet**, so isolation is structural. There *is* a
>   migration, but it is safe and idempotent.

---

## 1. Summary

Cabinet's analogy is *your home*. v3 makes the file system match it literally: **`data/` is the home
container** (it holds your rooms but is not itself a working cabinet), and **each room is a
self-contained, isolated cabinet** at `data/<room>/` — its own pages, agents, tasks, jobs, chat,
skills, search index, and look. No room is the parent of another, so **Personal and Work never mix**.

You are always *inside a room*. The **home-button switcher** (the room's icon next to the `cabinet`
logo) lets you switch rooms, customize a room (name / icon / color / theme), add a room, or open a
room in its own window. Within a room, nested sub-cabinets still work exactly as before (roll-up
visibility own / +1 / +2 / all); across rooms there is zero knowledge.

## 2. Goals & non-goals

**Goals (all shipped)**
- One click on the room icon → a switcher: current room, list, switch, customize, add, open-in-window.
- Each room is a **structurally isolated** top-level cabinet (own subtree + own search DB). No room
  parents another.
- Per-room **identity**: icon + accent color + theme, stored in the room's `.cabinet` manifest.
- **Theme** and **search** follow the active room. Theme applies on switch; search is scoped to the room.
- A window's scope is a `cabinetPath`, so **open any room in its own window** works (Electron + web),
  each window keeping its own room and theme.
- A **safe, idempotent migration** for existing installs; **onboarding** creates rooms natively.

**Non-goals (this pass)**
- Cross-room search or cross-room agent roll-up. (Rooms are hard isolation boundaries.)
- A full retire of the `"."`-as-root code path everywhere (see §8 — we kept a thin empty "home"
  cabinet instead, on purpose).
- A dedicated home/launcher *screen* (you land directly in the default room; the switcher is the home UX).
- Templated room-types onboarding picker beyond what already exists.

## 3. Decisions (shipped)

| Question | Decision |
|---|---|
| What is a room? | A **top-level cabinet**: a direct child of `data/` with a `.cabinet` manifest (`kind: room`). Plain folders are **not** rooms (they are content inside a room). |
| What is `data/`? | The neutral **home container**. It carries a thin `.cabinet` (`kind: home`) marker + `data/.home/home.json`, but holds **no content/agents/tasks** of its own. |
| Isolation | **Structural.** Each room is a separate subtree with its **own `.cabinet.db`**. The tree is rooted per room; search is room-scoped; roll-up never crosses a room boundary (the home rolls up nothing). |
| Default room | `data/.home/home.json` `defaultRoom` (set at onboarding/migration). The app lands inside it. Renameable in the switcher. |
| Home button | The room's **icon + color** next to the logo; the dropdown switches / customizes / adds / opens-in-window. The room name shows in the drawer + main header. |
| Per-room identity | `icon` + `color` + `theme` under `room:` in each cabinet's `.cabinet` manifest. New rooms get a distinct icon/color automatically. |
| Theme | Per-room. Applied on switch and on load via `RoomThemeSync`; falls back to the global theme when unset. Lives only in the DOM, so each window themes independently. |
| Search | One `.cabinet.db` **per room**; queries are scoped to the active room (pages/agents/tasks filtered by room prefix). No cross-room leak. |
| Creation | **Add room** (switcher) → a new top-level isolated room (`kind: room` + auto icon/color). **New Cabinet** (sidebar) → a sub-cabinet *inside the current room* (`kind: child`). |
| `.global-agents` | Kept as the one opt-in **cross-room** agents location (default empty). |
| Multi-window | A window's scope is its URL hash (`#/cabinet/<room>`). Electron spawns a native `BrowserWindow` reusing the backend; web uses `window.open`. Each window keeps its own room + theme. |
| Migration | **Yes, but safe** — idempotent + git-checkpointed (`scripts/migrate-rooms-v3.mjs`). Onboarding creates rooms natively, so new installs need no migration. |

---

## 4. The model

- **`data/` is a neutral container ("home"), not a working cabinet.** Marked with a thin
  `kind: home` manifest so `"."`-as-root code paths resolve to a valid but empty scope; carries no
  content, agents, or tasks of its own.
- **A room is a top-level cabinet: `data/<room>/`,** fully self-contained — its own `.cabinet`,
  `index.md`, `.agents/`, `.jobs/`, `.cabinet-state/`, `.chat/`, and **its own search DB**
  (`.cabinet.db`). No room is the parent of another.
- **Within a room,** nested sub-cabinets work exactly as today (roll-up visibility own / +1 / +2
  / all). **Across rooms: zero knowledge.** Isolation is structural (different subtree, different
  DB), not a UI filter.
- **There is always an active room.** The first path segment of `section.cabinetPath` *is* the
  room (`work`, `work/projects/acme`). The home itself surfaces no content.
- **One intentional cross-room thing stays:** `data/.global-agents/` (opt-in shared agents,
  default empty). Everything else is per-room.

### 4.1 Target on-disk layout

```
data/                         ← home container (NOT a working cabinet)
├── .cabinet                  ← thin kind:home marker (keeps "." a valid empty scope)
├── .home/home.json           ← { defaultRoom, lastActiveRoom }
├── .agents/.config/          ← GLOBAL app config: user, providers, onboarding-complete, integrations
├── .global-agents/           ← opt-in cross-room agents (default empty)
├── .cabinet-state/           ← machine/app state (ports, disclaimer-ack, file-schema)
├── .git/                     ← one repo for the whole home (history preserved across rooms)
├── work/                     ← a room: an isolated, self-contained cabinet
│   ├── .cabinet              ← kind:room + room:{icon,color,theme}
│   ├── .cabinet.db           ← this room's own search index
│   ├── .agents/  .jobs/  .chat/  .cabinet-state/
│   ├── getting-started/  index.md  …content…
│   └── …nested sub-cabinets (kind:child) roll up within the room…
├── personal/                 ← another room, fully isolated from `work`
└── …more sibling rooms…
```

### 4.2 What changed vs. v2

| Concern | v2 (was) | v3 (shipped) |
|---|---|---|
| `data/` | the root cabinet **and** the container | container only (thin `kind:home` marker) |
| A room | top-level dir, *or the root* | top-level dir **with `.cabinet`** only |
| Folders without `.cabinet` | listed as rooms | **not** rooms (they're content of a room) |
| Isolation | UI filter + default "own" visibility | **structural** (separate subtree + separate DB) |
| Search | one shared `data/.cabinet.db` | **one DB per room** |
| Root room | special, parents everything | **gone**; all rooms are equal siblings |
| `section.cabinetPath` `"."` | the root cabinet | the home (empty scope); rooms start at a slug |

---

## 5. What lives where (authoritative classification)

The migration's move-list, derived from the real `data/` on 2026-05-23.

**Moves INTO the room** (`data/<rootSlug>/`) — these belonged to the old root cabinet:

| Item | Why | New location |
|---|---|---|
| `data/.cabinet` | the cabinet manifest | `data/<root>/.cabinet` |
| `data/.cabinet.db` (+ `-shm`, `-wal`) | the cabinet's search index | `data/<root>/.cabinet.db*` |
| `data/.agents/<persona>/` | the cabinet's team | `data/<root>/.agents/<persona>/` |
| `data/.agents/.conversations`, `.memory`, `.messages`, `.runtime` | per-cabinet agent runtime | `data/<root>/.agents/…` |
| `data/.agents/.config/company.json`, `workspace.json` | **per-room** workspace identity | `data/<root>/.agents/.config/` |
| `data/.chat/` | the room's team chat | `data/<root>/.chat/` |
| `data/index.md` | the cabinet entry page | `data/<root>/index.md` |
| `data/getting-started/`, `data/songs/`, etc. (no `.cabinet`) | the cabinet's **content** | `data/<root>/…` |
| any other plain top-level folder/file | the cabinet's content | `data/<root>/…` |

**STAYS at the container** (`data/`):

| Item | Why |
|---|---|
| `data/.git/` | one repo for the whole home; moving files inside it preserves history |
| `data/.global-agents/` | cross-room shared agents, by design |
| `data/.cabinet-state/` | machine/app-level runtime (ports, disclaimer-ack, file-schema) |
| `data/.cabinet-meta/audit.log` | app-level audit (could split per-room later) |
| `data/.agents/.config/{user,providers,onboarding-complete,integration-environments}.json` | **global app config** |

**Stays in place, becomes a sibling room**: existing top-level cabinets (`salesons`, `dauther`,
`fff`, …) already have `.cabinet`. No move; they stop being "children of the root room" once the
root cabinet is gone. They get a fresh per-room `.cabinet.db` on first search (lazy reindex). The
migration backfills a `room:` block + `kind: room`.

> **The split that bites:** `data/.agents/.config/` mixed per-room identity (`company`,
> `workspace`) with **global app config** (`user`, `providers`, `onboarding-complete`,
> `integration-environments`). Migration splits it; every reader of those globals already points
> at the home location.

---

## 6. Where things live in the code

| Concern | Implementation |
|---|---|
| Room list | `listRooms()` (`src/lib/cabinets/rooms.ts`) — top-level dirs with a `.cabinet`, excluding `kind:home`. |
| Default room | `resolveDefaultRoom()` + `data/.home/home.json`; returned by `/api/rooms`. |
| Rooms store (client) | `src/stores/rooms-store.ts` — cached fetch from `/api/rooms`. |
| Switcher UI | `src/components/sidebar/room-switcher.tsx` (+ `room-icons.tsx`, `room-edit-dialog.tsx`). |
| Landing | `app-shell.tsx` redirects the bare home section into the default room; `handleWizardComplete` refreshes the rooms store post-onboarding. |
| Tree scope | Rooted per active room (`tree-view.tsx` uses the room's subtree). |
| Search scope | `server/search/*` filters pages/agents/tasks by the active room prefix; `cabinet` param threaded `palette → /api/search → daemon`. |
| Roll-up cap | `overview.ts` returns no descendants for the home (`DATA_DIR`), so no parent can see another room. |
| Per-room theme | `src/components/layout/room-theme-sync.tsx` (mounted in `layout.tsx`). |
| Creation | `/api/cabinets/create` (room vs child by `parentPath`); `cabinet-scaffold.ts` (`kind` union incl. `room`/`home`). |
| Onboarding | `/api/onboarding/setup` scaffolds the first room at `data/<slug>/`, writes the home marker, keeps global config at the container. |
| Multi-window | `src/lib/cabinets/room-window.ts`; Electron `cabinet:open-window` IPC (`electron/main.cjs`) + `preload.cjs` `CabinetDesktop.openWindow`. |
| Migration | `scripts/migrate-rooms-v3.mjs` (idempotent, guarded by `data/.home/home.json`). |

### 6.1 Container config — `data/.home/home.json`

```jsonc
{
  "schemaVersion": 1,
  "kind": "home",
  "defaultRoom": "work",      // slug of the room to open on launch
  "lastActiveRoom": "work"    // last room the user was in (per machine)
}
```

Global app config (`user.json`, `providers.json`, `onboarding-complete.json`,
`integration-environments.json`) stays at `data/.agents/.config/` — the home container scope, not
inside any room. `data/.cabinet-state/` (machine state) also stays at the container.

---

## 7. Migration (existing installs)

Pre-v3 installs have a root cabinet at `data/` that parents the other rooms.
`scripts/migrate-rooms-v3.mjs` (idempotent, git-checkpointed):

1. No-ops if `data/.home/home.json` already exists.
2. Preflight: refuses to run if the search DB is locked (daemon holds it).
3. Git-checkpoints `data/` ("pre rooms-v3 migration") + writes a filesystem journal
   (`data/.home/migration-journal.json`) listing every planned move (resume/rollback).
4. Derives `rootSlug` from `data/.cabinet` `name`; de-collides against existing top-level dirs.
5. `git mv` (history-preserving) every item from §5's "moves INTO the room" list to
   `data/<rootSlug>/`.
6. Splits `.agents/.config/`: per-room files go into the room; global files stay at the container.
7. Writes `data/<rootSlug>/.cabinet` with `kind: room` + a `room:` block (backfills icon/color/theme).
8. For each existing top-level cabinet: backfills `kind: room` + `room:` block in its `.cabinet`.
9. Writes `data/.home/home.json` (`defaultRoom: <rootSlug>`, `kind: home`).
10. Commits ("rooms v3 migration"). Drops stale `.cabinet.db-shm/-wal`; the room reopens/reindexes.

**Safety:** the pre-migration commit is the rollback point (`git reset --hard`). Migration is
fully idempotent. Partial failure leaves the journal; on next start, resume or roll back from it.
Ships as `cabinetai doctor --migrate-rooms` for manual invocation. New installs skip all of this —
onboarding creates the first room directly.

---

## 8. Pragmatic deviations (notes from implementation)

- **Why a thin `kind:home` cabinet instead of deleting `data/.cabinet`.** ~114 call sites default
  an absent `cabinetPath` to the root (`"."`). Rather than a risky full retire-`.` refactor, `data/`
  keeps a thin, **content-less** `kind:home` cabinet so those sites resolve to a valid but empty
  (leak-free) scope. Isolation still holds: the home has no content/agents and rolls up nothing.
- **Cold-load theme flash (minor).** On a fresh load the global theme paints before the room
  theme, which resolves after the async rooms fetch. Acceptable; not blocking.
- **Verification.** The model, isolation, theme-on-switch, multi-window, and from-scratch
  onboarding were all verified via Chrome DevTools + filesystem inspection (see `PROGRESS.md`,
  2026-05-23).

---

## 9. Phased plan — status

- **Phase 1 — Switcher + room identity.** ✅ Shipped.
- **Phase 2 — Per-room theme.** ✅ Shipped (apply on switch + load, global fallback).
- **Phase 3 — Scoped search.** ✅ Shipped (per-room DB scope by prefix).
- **Phase 4 — Add / Edit / Create (room vs sub-cabinet).** ✅ Shipped.
- **Phase 5 — Multi-window.** ✅ Shipped (Electron native window + web `window.open`).
- **Phase 6 — Onboarding.** ✅ Shipped (creates `data/<slug>/` rooms + home marker).
- **Migration + structural isolation (the v3 core).** ✅ Shipped (`migrate-rooms-v3.mjs`).

---

## 10. Known gaps & follow-ups (2026-05-27)

Three regressions / missing affordances surfaced after the v3 ship. Tasks are tracked separately;
this section is the design intent.

### 10.1 Rooms list goes stale relative to disk

**Symptom.** The switcher's room list reflects the *first* `/api/rooms` fetch and never
self-refreshes. Adding/removing rooms outside the in-app dialogs (e.g. another window, the CLI, a
manual `mkdir`/`rm`, the migration script), or deleting a folder's `.cabinet`, leaves the dropdown
showing stale entries until a full page reload. Observed 2026-05-27 with the switcher listing
`Cabinet` + `bla` while disk also held `temp` (room) and `hilss-home` (folder without `.cabinet`,
also the `defaultRoom` — itself a separate problem).

**Root cause.** `useRoomsStore.load()` (`src/stores/rooms-store.ts`) early-returns when
`loaded === true` unless `force` is passed. The switcher mounts a single `useEffect(() => load())`
and only forces a reload after the in-app Add / Edit dialogs close. There is no:

- refresh on window focus / visibility change,
- refresh on cross-window broadcast (Electron IPC or `BroadcastChannel`) when another window adds
  or edits a room,
- refresh when the server emits the existing tree/file-system events (rooms are top-level dirs;
  most tree-watcher events would imply they should re-check).

**Required behavior.**
1. The switcher refetches when its dropdown opens (cheap, deterministic, fixes the reported case).
2. The store refetches on `visibilitychange` → visible, and on `focus`, with a small debounce so
   tab-switching doesn't thrash.
3. Cross-window: emit a `rooms:invalidated` signal (Electron IPC broadcast + web
   `BroadcastChannel('cabinet-rooms')`) from PATCH/POST/DELETE handlers; all open windows refetch.
4. `resolveDefaultRoom` should *not* return a slug that has no `.cabinet` on disk — if the
   configured `defaultRoom` no longer points at a real room, fall through to first-alphabetical
   and (best-effort) heal `home.json`.

### 10.2 Editing the room name is unreliable

**Symptom.** Renaming a room in `RoomEditDialog` writes the new name into the manifest, but the
visible name in the switcher / drawer / main header sometimes does not update until reload, and on
some flows reverts. The dialog state and the rooms store can disagree about which room is "active"
after a save.

**Suspected causes** (investigate before fixing).
- `room-edit-dialog.tsx` calls `reloadRooms(true)` *then* `onSaved(data.room)` *then* `onClose()`.
  The switcher's `editing` state and `active` derivation key off `room.path`, not `name` — but the
  drawer / header subscribe via other paths (tree-store, app-store) that may have cached the old
  name from `cabinet-overview` or the manifest read during the last tree refresh.
- `updateRoomMeta` writes only the `name` field in the manifest, not the directory name. That is
  by design (renaming the directory would break agent/task/job paths and the search index), but
  the *promise* "edit the room name" might lead users to expect the slug to change too. Either
  the UI label needs to clarify "display name" or we need a separate (heavier) "rename slug"
  action that migrates paths.
- After save, the active section is not re-set, so any component reading `section.cabinet*` from
  app-store may still hold a stale handle.

**Required behavior.**
1. The new name updates in the switcher trigger, the drawer header, and the main page header
   without a reload.
2. Manifest writes are atomic (write-temp + rename) so a save can't half-apply.
3. The dialog stays open with an inline error if the PATCH fails; today the error string lives in
   state but the dialog also closes some flows on `onSaved`, hiding the failure.
4. UI copy distinguishes **display name** (manifest `name`) from **slug** (directory). A separate
   "Rename room (advanced)" action — out of scope for this fix — would handle slug changes with a
   path-migration job.

### 10.3 No way to delete a room

**Symptom.** The switcher has Add / Customize / Open-in-window but no Delete. A user with a
half-set-up room or an experimental room must either ignore it forever, leave the app and
`rm -rf` on the command line (which leaves dangling references in `home.json` and possibly the
search DB), or migrate-then-clean manually.

**Required behavior.**

1. **Switcher entry.** "Delete room…" inside the per-room customize menu (not at the top level —
   it must be deliberate). Disabled for the last remaining room.
2. **Confirmation dialog.** Names the room, lists what will be deleted (pages, agents, jobs, chat,
   search index, the room's `.cabinet.db`), and requires the user to type the room slug to confirm
   — same pattern as GitHub-style destructive confirmations. No checkboxes, no "skip confirmation"
   memory.
3. **What happens on confirm** (server, new endpoint `DELETE /api/rooms`):
   - Stop any running agents/jobs scoped to that room (best-effort; abort their tasks).
   - Close the room's `.cabinet.db` handle (search daemon).
   - Move the directory to `data/.trash/<slug>-<timestamp>/` (don't delete from disk in this
     pass) so the operation is reversible by hand for one release cycle. Document the trash
     location.
   - Update `data/.home/home.json`: if the deleted room was `defaultRoom` or `lastActiveRoom`,
     clear/repoint it.
   - Commit the move (`git mv` if tracked, else `git add -A && commit`) — "delete room <slug>".
   - Emit `rooms:invalidated` (see §10.1).
4. **Client.** If the deleted room was the active room, switch to the new default room before the
   request returns (optimistic UX) and clear tree-store / editor-store selections.
5. **Guard rails.**
   - Refuse to delete if the path is not a direct child of `data/` (path-traversal guard).
   - Refuse to delete the home container.
   - Refuse if the room is open in another window (Electron only; check via IPC). Surface "Close
     other windows of this room first."
6. **Out of scope (this pass).** A full restore-from-trash UI; a global "Trash" page; multi-room
   bulk delete. The trash location is documented and `rm -rf` from a terminal is the recovery
   path, deliberately friction-free for the team but not promoted to end users.

---

*Decision source: product Q&A 2026-05-23 (true sibling rooms with migration; full design before
implementation). v1 (flatten) and v2 (lighter) are superseded; their intent is preserved in §
version-history for context.*
