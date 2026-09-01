# Update dialog: never block work — design

**Date:** 2026-07-16
**Status:** Approved, pending implementation plan
**Scope:** Fix the in-app update dialog so no update state can trap the user. The Electron-native
auto-update path (`electron/main.cjs`) is out of scope for its own behaviour, but **not** for its
side effects: it writes the same status file the in-app dialog reads, and that is a direct cause of
the bug. See [ADR-0002](../../adr/0002-update-dialog-must-never-block-work.md).

## Context

Reported symptom: "when there is a new version update, the window doesn't close."

Cabinet has two update mechanisms. They are **not** independent: they share one status file.

**A. Electron-native (packaged desktop, macOS only).** `configureAutoUpdates()` in
`electron/main.cjs:521-610` returns immediately unless `process.platform === "darwin"` (`:522-524`).
It shows a native `dialog.showMessageBox` on `update-downloaded` (`:587-604`) and calls
`autoUpdater.quitAndInstall()` (`:607`). The native dialog dismisses itself. **Not the bug on its
own** — but it writes `state: "restart-required"` first (`:580-585`), which is what latches the
in-app dialog. See "Double-prompt on macOS".

**B. In-app React dialog.** This is where the bug lives.

The `whats-new-card` (`src/components/help/whats-new-card.tsx`, touched by PR #251) is a separate
dismissible home-screen card with no window-close responsibility. **Not the bug** either — ruled out.

## Verified facts

Everything in this section was confirmed firsthand against the code on **2026-07-16**. Four claims in
the previous draft of this spec turned out to be **false** — see [Corrections](#corrections).

**Root-cause code (verified, line numbers exact):**

- `src/components/layout/app-shell.tsx:788-800` — the derived-open expression, quoted below.
- `src/components/layout/app-shell.tsx:718-729` — `handleUpdateLater()`.
- `src/components/layout/app-shell.tsx:1199` — `open={effectiveUpdateDialogOpen}`.
- `src/components/layout/app-shell.tsx:1206-1212` — `onOpenChange` routes every close to
  `handleUpdateLater()`.
- `src/components/layout/app-shell.tsx:1221` — `onLater={handleUpdateLater}`.
- `src/components/layout/app-shell.tsx:142` — `DISMISSED_UPDATE_STORAGE_KEY = "cabinet.dismissed-update-version"`.
- `src/components/layout/app-shell.tsx:251-259` — `updateDialogOpen` / `dismissedUpdateVersion` state.

**The complete `UpdateState` union has nine members, not seven** (`src/types/update.ts:7-16`):

```ts
export type UpdateState =
  | "idle" | "checking" | "available"
  | "starting" | "backing-up" | "downloading" | "applying"
  | "restart-required" | "failed";
```

`idle`, `checking`, and `available` are absent from `hasPersistentUpdateState` and therefore never
latch. The six that do latch are exactly the six listed in the expression. The default status is
`{ state: "idle" }` (`src/lib/system/update-status.ts:7-9`).

**Both mechanisms write the same file. Verified:**

| Writer | Path expression |
| --- | --- |
| Next.js / in-app | `UPDATE_STATUS_PATH` = `DATA_DIR/.cabinet-state/update-status.json` (`src/lib/storage/path-utils.ts:7,11`) |
| Electron main | `path.join(managedDataDir, ".cabinet-state", "update-status.json")` (`electron/main.cjs:143`) |

`DATA_DIR = getManagedDataDir()` — the same directory. `electron/main.cjs` defines its **own**
`writeUpdateStatus` (`:170`); it does not import the TS module. The in-app dialog reads this file via
`/api/system/update` → `getUpdateCheckResult()` (`src/lib/system/update-service.ts:48-83`) →
`readUpdateStatus()`.

**No update surface has a restart action.** This is the most important correction. A generic
restart-by-exit route (`POST /api/system/restart`) does exist, but nothing in the update flow calls it
and none of its targets swap an app bundle — see §4. Searched `update-summary.tsx`, `update-dialog.tsx`,
`app-shell.tsx`, `electron/preload.cjs`:

- `src/components/system/update-summary.tsx:159-207` renders exactly four buttons: "Check now",
  "Open data folder", "Create backup copy", and "Update now". **"Update now" is explicitly hidden
  when the state is `restart-required`** (`:195`: `update.canApplyUpdate && state !== "restart-required"`).
- `src/components/layout/update-dialog.tsx:74-92` renders a footer of "Later" and an optional
  "Release notes" link. Nothing else.
- `electron/preload.cjs:44-127` exposes `CabinetDesktop` with browser-view methods, `uninstallApp`,
  `openLocalFile`, `openExternal`, `getPreferredLanguages`, `openWindow`. **No restart/quit channel.**
- `autoUpdater.quitAndInstall()` exists only at `electron/main.cjs:607`, inside the `update-downloaded`
  handler closure. It is unreachable from the renderer and applies **only to the native macOS path**.

So at `restart-required` the in-app dialog presents a title saying "Restart Cabinet to finish
updating" (`update-dialog.tsx:50-51`, key `chrome:update.restartTitle`, `src/i18n/locales/en.json:2106`)
and **zero forward actions** — the update button is hidden and the restart button never existed. The
only two controls are "Later" (a no-op, per the root cause) and an external link. The trap is total.

**A non-blocking reminder already exists.** `src/components/layout/status-bar.tsx:777-795` already
renders two update affordances, both `onClick={() => setSection({ type: "settings" })}`:

| Condition | Copy (i18n key) |
| --- | --- |
| `updateStatus.state === "restart-required"` | `status:misc.restartToFinishUpdate` → "Restart to finish update" |
| `updateAvailable && state !== "restart-required" && latest` | `status:update2.updateAvailable` → "Update available {{version}}" |

`StatusBar` already calls `useCabinetUpdate()` (`status-bar.tsx:298`) and is mounted in the shell at
`app-shell.tsx:1181` (hidden in `focusMode`, desktop only). It does **not** cover `failed` or any
in-progress state.

## Root cause

`src/components/layout/app-shell.tsx:788-800`:

```ts
const hasPersistentUpdateState =
  update?.updateStatus.state === "restart-required" ||
  update?.updateStatus.state === "failed" ||
  update?.updateStatus.state === "starting" ||
  update?.updateStatus.state === "backing-up" ||
  update?.updateStatus.state === "downloading" ||
  update?.updateStatus.state === "applying";
const shouldPromptForUpdate =
  update?.updateAvailable === true &&
  !!update.latest?.version &&
  dismissedUpdateVersion !== update.latest.version;
const effectiveUpdateDialogOpen =
  updateDialogOpen || hasPersistentUpdateState || shouldPromptForUpdate;
```

Every close path routes to `handleUpdateLater()` (`:718-729`), which sets `updateDialogOpen = false`
and records `dismissedUpdateVersion`. **It never addresses `hasPersistentUpdateState`.** Once the
status is `restart-required`, the second term stays `true` forever. "Later", the X, and Esc are all
no-ops.

Note the ordering bug within `handleUpdateLater` too: `setUpdateDialogOpen(false)` runs
unconditionally, but the dismissal record is only written `if (latestVersion)` (`:720`). With no
manifest, "Later" writes nothing at all.

**Two distinct paths reach `restart-required`:**

1. **Source-managed installs.** `applyUpdate()` (`src/hooks/use-cabinet-update.ts:102-121`) POSTs
   `/api/system/update/apply`, which spawns a detached `cli/index.cjs upgrade` child
   (`src/app/api/system/update/apply/route.ts:43-71`) after writing `state: "starting"` (`:33-41`).
   The CLI drives the status to `restart-required`. The hook then polls every 1500ms while the state
   is active (`use-cabinet-update.ts:14-21,156-166`).
2. **Packaged macOS.** `electron/main.cjs:580-585` writes it directly on `update-downloaded`.

## Double-prompt on macOS (verified)

On a packaged macOS build both surfaces fire from one event. `autoUpdater.on("update-downloaded")`
(`electron/main.cjs:579`):

1. writes `state: "restart-required"` to the shared status file (`:580-585`), then
2. shows the native message box (`:602-604`).

The renderer's next poll or focus-refresh (`use-cabinet-update.ts:138-154`, `autoRefresh: true` at
`app-shell.tsx:206`) reads that state and latches the in-app dialog open. **The user gets a native
dialog and a permanently-stuck React dialog for the same update.** If they choose "Later" in the
native box (`:589` `cancelId: 1`), the native prompt closes and the in-app dialog remains, with no
restart button. This is the most likely shape of the reported bug on packaged desktop.

**`failed` is worse.** `autoUpdater.on("error")` (`:569-577`) writes `state: "failed"` on *any*
Electron updater error — including the routine "not signed / not packaged" failures on dev and
unsigned builds, and any transient network error during a background check that runs every 4 hours
(`:530`). That latches the in-app dialog with no user action of any kind having occurred.

**And "Try again" cannot work there.** `canApplyUpdate` requires `installKind === "source-managed"`
(`update-service.ts:58-61`), which is false for `electron-macos`. The apply route returns **409** for
such installs (`apply/route.ts:21-30`). A "Try again" button that calls `applyUpdate()` on a packaged
macOS build would always fail.

## Design

The governing rule: **no update state may hard-lock the dialog.** Every state is dismissible; the
information survives in the existing status-bar reminder instead of a modal.

### 1. Per-status dismissal, not per-version

`dismissedUpdateVersion` is insufficient because it only neutralises `shouldPromptForUpdate`.
Dismissal must also suppress the persistent-state branch.

Replace the stored bare version with a dismissal record keyed by **version + state**, so that
dismissing `restart-required` for v0.5.4 does not also silently swallow a later `failed` for the same
version:

```ts
// localStorage: cabinet.dismissed-update.v2 -> { "version": string | null, "state": UpdateState }
```

`effectiveUpdateDialogOpen` becomes:

```ts
const dismissed =
  !!dismissedUpdate &&
  dismissedUpdate.version === (update?.latest?.version ?? null) &&
  dismissedUpdate.state === update?.updateStatus.state;
const effectiveUpdateDialogOpen =
  updateDialogOpen || (!dismissed && (hasPersistentUpdateState || shouldPromptForUpdate));
```

`updateDialogOpen` stays deliberately unguarded as the first term: an explicit user action (Settings,
status-bar click) must always be able to open the dialog regardless of the record.

Keying on state means a *state change* (e.g. `applying` → `failed`) legitimately re-surfaces the
dialog. That is new information, not a re-trap.

**Extract the expression as a pure function** — `src/lib/system/update-dialog-visibility.ts`,
exporting something like
`isUpdateDialogOpen({ update, dismissed, manuallyOpened }): boolean`. The bug is a boolean-logic
defect in a 1,300-line client component that has no test coverage and cannot get any (see Testing).
Extraction is what makes the regression testable at all, so it is part of the fix, not a nicety.

### 2. Storage migration (exact)

Current: `DISMISSED_UPDATE_STORAGE_KEY = "cabinet.dismissed-update-version"` (`app-shell.tsx:142`)
holds a **bare version string** (e.g. `0.5.3`), written at `:722`, read raw at `:255`.

**Use a new key (`cabinet.dismissed-update.v2`) rather than reinterpreting the old one.** Reasons:

- `JSON.parse("0.5.3")` returns the *number* `0.5` — it does not throw. A parse-and-sniff migration
  on the old key would silently produce a garbage record instead of failing loudly. (`JSON.parse("0.5.4")`
  → `0.5`; a version like `1.0.0` → `1`.) This is a real trap; do not write `try { JSON.parse(old) }`.
- The old value's semantics are strictly weaker (version-only, prompt-only). There is nothing worth
  carrying forward.

**Migration behaviour for users with the old value on disk:** the new key is absent → nothing is
dismissed → if an update is still available they see the prompt **once** more, and dismissing it
writes the v2 record. This is the correct trade: one extra prompt, and it is dismissible for real
this time.

Delete `cabinet.dismissed-update-version` on read of the new key (best-effort, inside the existing
`try/catch`) so it does not linger. Removing the old constant entirely is fine — no other module
references it (verified: the only four hits are all in `app-shell.tsx`).

### 3. Behaviour per state

All nine states, exhaustively:

| State | Latches today? | Dialog | Primary action | On dismiss |
| --- | --- | --- | --- | --- |
| `idle`, `checking`, `available` | No | Not opened by state (`available` may still prompt via `updateAvailable`) | "Update now" when `canApplyUpdate` | Records `{version, state}` |
| `starting`, `backing-up`, `downloading`, `applying` | **Yes** | Dismissible (minimize) | none — shows progress | Collapses to status-bar reminder, work keeps running |
| `restart-required` | **Yes** | Dismissible | "Restart now" — **must be built, see §4** | Collapses to status-bar reminder |
| `failed` | **Yes** | Dismissible | "Try again" → `applyUpdate()`, **only when `canApplyUpdate`** | Collapses to status-bar reminder |

In-progress states are **minimizable, not blocking**. This is deliberate: "these are brief" is an
assumption, and a stuck `applying` would otherwise trap the user permanently. The 1500ms poll
(`use-cabinet-update.ts:156-166`) keeps running while minimized, so the reminder stays live.

`failed` with `canApplyUpdate === false` (every packaged macOS build) shows the error text and **no**
"Try again" — the button would 409. Show the `updateStatus.error` and the release-notes link only.

### 4. The restart action does not exist and must be built

`restart-required` is the reported state, and it is the one state with no forward action. Dismissibility
alone leaves the user with a reminder that leads nowhere.

**What exists (verified 2026-07-16):** `POST /api/system/restart`
(`src/app/api/system/restart/route.ts`) is restart-by-exit — it asks a process to exit and lets the
supervisor respawn it. It accepts `target: "daemon" | "app" | "all"` (`:24`). This is the button the
`electron/main.cjs:249` comment refers to. Its **only caller** is
`status-bar.tsx:272-283` (`requestBackendRestart`), which always sends `target: "daemon"`. **No UI ever
sends `target: "app"`, and no update surface calls this route at all.**

Crucially, **none of its targets swap an Electron app bundle**:

| Install | `target: "app"` behaviour | Correct for `restart-required`? |
| --- | --- | --- |
| Source-managed (bare) | `supervised()` false → **400** (`:42-47`) | No — refuses |
| Source-managed under Electron | Next child exits, Electron main respawns it → picks up upgraded files on disk | **Yes** |
| Packaged macOS (Squirrel) | Restarts the Next child only; the `.app` bundle is untouched | **No** — needs `quitAndInstall()` |

So the two paths need different actions:

- **(a) Source-managed under Electron** → `POST /api/system/restart` with `target: "app"`. The route
  already supports it; only a caller is missing. Bare source installs get a 400 and must be told to
  restart manually ("restarting there stays a terminal affair", per the route's own comment).
- **(b) Packaged macOS** → requires a new IPC channel (e.g. `cabinet:restart-to-update`) in
  `electron/preload.cjs` + a main handler calling `autoUpdater.quitAndInstall()`. Today `quitAndInstall`
  is trapped inside the `update-downloaded` closure (`main.cjs:607`); it would need hoisting to a
  module-scope handler guarded on an update actually having downloaded.

**Do not wire "Restart now" to `target: "app"` on packaged macOS.** It would return `{ ok: true }`,
bounce the Next server, leave the old bundle running, and the status file would still say
`restart-required` — a button that reports success and changes nothing. Branch on `installKind`
(available on `UpdateCheckResult`) to pick (a) or (b).

**Do not ship "Restart now" as a no-op or a `window.location.reload()`** either. Reloading the renderer
does not swap the bundle and would present a lie. If (b) is out of scope for this change, the honest
interim is: dismissible dialog + reminder + explicit copy telling the user to quit and reopen Cabinet.
That is strictly better than today's trap.

### 5. Reminder: extend the status bar, do not add a component

The previous draft proposed a new `src/components/layout/update-reminder-pill.tsx`. **That component
already exists in substance** at `status-bar.tsx:777-795` (see Verified facts). Extend it instead:

- Add a `failed` branch → "Update failed".
- Add an in-progress branch (`starting`/`backing-up`/`downloading`/`applying`) → "Updating…" with a
  spinner (`Loader2`, already imported in `update-summary.tsx`; check the status-bar imports).
- Keep `restart-required` and `updateAvailable` as they are.

**Click target.** All existing branches call `setSection({ type: "settings" })`, which is a reasonable
destination (Settings renders `UpdateSummary` via `useCabinetUpdate()` at `settings-page.tsx:455`).
Reopening the *dialog* instead requires reaching `updateDialogOpen`, which is local `useState` in
`app-shell.tsx:251` and not visible to `StatusBar`. Two viable routes:

- **CustomEvent** — matches existing precedent: `cabinet:open-editor-chat` is dispatched from
  `tree-node.tsx:481` / `new-file-dialog.tsx:142` and handled in `app-shell.tsx:690-691`.
- **Lift to the app store** (`useAppStore`) — heavier, but typed.

Prefer the CustomEvent; it is the established pattern for exactly this shell-reaching case. Keeping
`setSection({ type: "settings" })` is also acceptable and is the smallest change.

The reminder is a **required companion** to dismissibility (ADR-0002) — without it, a dismissed update
is invisible until the next launch. It already exists for two of the states; this change must not land
without the other two.

### 6. `handleUpdateLater()`

Rewrite to record `{ version: latest?.version ?? null, state }` **unconditionally** (fixing the
`if (latestVersion)` gap at `:720`) and close. It becomes the single dismissal path for every state, so
`onOpenChange` (`:1206-1212`) and `onLater` (`:1221`) need no change beyond continuing to call it.

### 7. Copy and i18n

New copy needs keys in the `status:` and `chrome:update` namespaces. `src/i18n/locales/` holds **39
locale files**; `en.json` is the source of truth (existing keys at `:2106-2107`). Follow whatever the
repo's established fallback behaviour is for untranslated keys rather than hand-editing 39 files.

**CLAUDE.md rule 17: no em-dashes in user-facing copy.** "Restart to finish update", "Update failed",
"Updating…" all comply.

## Error handling

- **Unreadable/corrupt localStorage record** → treat as "not dismissed" and show the dialog. Failing
  open is correct: a missed dismissal is an annoyance, a missed update prompt is a stale install.
  Guard `JSON.parse` and validate that `state` is one of the nine union members before trusting it.
- **`update.latest?.version` absent while a persistent state is live.** Real, not hypothetical:
  `latest` is `ReleaseManifest | null` (`types/update.ts:83`), and `fetchLatestReleaseManifest()` can
  fail offline while `update-status.json` still says `restart-required` from a previous session.
  Normalise the missing version to `null` **on both sides** of the comparison (as in §1) so a dismissal
  recorded with `version: null` matches on the next read. Getting this wrong re-traps the offline user,
  which is precisely the reported bug.
- **`update === null`** (first render, before the deferred idle-callback fetch at
  `use-cabinet-update.ts:123-136`) → `UpdateDialog` early-returns on `!update` (`update-dialog.tsx:41`),
  so no dialog. No change needed; do not regress this.
- **"Try again" while already `applying`** → the action only renders for `state === "failed"`, which
  makes double-submit unreachable by construction. `applyPending` (`use-cabinet-update.ts:28`) still
  gates the button.

## Testing

**Infrastructure (verified 2026-07-16):**

- `npm test` → `node scripts/run-unit-tests.mjs`, which seeds an isolated `CABINET_DATA_DIR` from
  `test/support/fixtures/seed-cabinet` and runs `node:test` + `tsx` over collected files in **`test/`
  and `src/`**.
- Pattern: `import test from "node:test"; import assert from "node:assert/strict";` — see
  `test/update-system.test.ts` (the existing home for update-system unit tests: `compareVersions`,
  `readBundledReleaseManifest`, `detectInstallKind`, `inferElectronInstallKind`).
- Colocated `src/**/*.test.ts` is also an established pattern (e.g. `src/lib/storage/page-io.test.ts`,
  `src/lib/auth/kb-auth.test.ts`).
- **There is no React component test infrastructure.** No `@testing-library/*`, no `jsdom`, no
  `happy-dom` in `package.json`; no test file in the repo renders a component. The previous draft's
  "Component: for each state, the dialog can be closed via X, Esc…" is **not implementable** without
  adding a test stack, which is out of scope.
- E2E is Playwright (`npm run test:e2e`, `e2e/*.spec.ts`).

**Therefore:**

1. **Unit (this is the regression that matters).** Add to `test/update-system.test.ts`, or colocate as
   `src/lib/system/update-dialog-visibility.test.ts` next to the extracted function from §1: a truth
   table over **all nine** `UpdateState` members × {not dismissed, dismissed same version+state,
   dismissed same version different state, dismissed different version, record corrupt} ×
   {`updateAvailable` true/false} × {`latest: null`}. Assert the six latching states are all closable.
2. **Unit.** Dismissing `applying`, then transitioning to `failed`, re-opens (state-keyed dismissal).
3. **Unit.** `version: null` dismissal matches a subsequent `version: null` read (the offline case).
4. **Unit.** Migration: a legacy `cabinet.dismissed-update-version` value of `"0.5.3"` is never fed to
   `JSON.parse` and never yields `0.5`; the new key governs.
5. **Regression (the reported path).** `updateAvailable` → apply → status becomes `restart-required` →
   "Later" → **dialog closes and stays closed** across a re-render and a poll tick.
6. **Manual (packaged macOS only, cannot be unit-tested).** With `update-status.json` hand-set to
   `restart-required`, confirm exactly one prompt survives and the in-app dialog is dismissible.

## Corrections

Claims in the previous draft of this spec, corrected against the code on 2026-07-16:

| Previous claim | Reality |
| --- | --- |
| "all seven states" | `UpdateState` has **nine** members (`types/update.ts:7-16`). Six latch. |
| `restart-required` → "Restart now" → **existing restart path** | **No update surface has a restart action.** `POST /api/system/restart` exists but is called only by the status bar with `target: "daemon"`, and no target swaps a macOS app bundle. The action must be built, and must branch on `installKind` (§4). |
| `failed` → "Try again" → re-runs `applyUpdate()` | Only valid when `canApplyUpdate`. On `electron-macos` the apply route returns 409 (§Double-prompt). |
| New component `update-reminder-pill.tsx` | Already exists at `status-bar.tsx:777-795`; extend it (§5). |
| Native and in-app prompts "duplicate intent on macOS" (a follow-up) | They share one status file and the native path **causes** the in-app latch. Promoted from follow-up to root cause. |
| "The state string originates from `writeUpdateStatus` (`electron/main.cjs:581`)" | `:581` is the `state:` property; `main.cjs` defines its own `writeUpdateStatus` at `:170`. The source-managed path writes via `src/lib/system/update-status.ts` and the detached `cli/index.cjs upgrade` child. |

## Follow-ups (out of scope)

- **`autoUpdater.on("error")` writing `failed` to the shared status file** (`main.cjs:569-577`) is
  arguably wrong: a background updater error on an unsigned/dev build is not a user-facing update
  failure. Dismissibility contains the damage; suppressing the write is the real fix.
- Unifying the native (`main.cjs`) and in-app update prompts into one surface. Once the in-app dialog
  is dismissible the double-prompt is survivable, but it is still two dialogs for one event.
- Windows portable builds never auto-update (`update-service.ts:21-27`) and `configureAutoUpdates()`
  is macOS-only (`main.cjs:522`); Windows users only ever see the in-app prompt.
