# Logging & File Edit History — PRD

**Status:** Final (2026-06-12 — all open questions resolved in review, see §7)
**Owner:** hilash
**Scope:** Two related observability gaps: (1) app diagnostics — when something breaks, users have nothing to look at or send us; (2) file edit history — users want to know *who* (them, or which agent/task) touched *what* file, *when*.

---

## 1. Problem

### 1.1 Diagnostics

Cabinet today has ~149 ad-hoc `console.*` call sites across four processes
(Electron main, Next server, cabinet-daemon, renderer) with inconsistent
`[bracket]` prefixes and **zero persistence**:

- In dev, output goes to the terminal and scrolls away.
- In packaged builds, the Next server and daemon are spawned with
  `stdio: "inherit"` (`electron/main.cjs:229-261`) — their output is
  effectively lost. There is no crash reporter and no log file.
- The daemon's `uncaughtException`/`unhandledRejection` handlers
  (`server/cabinet-daemon.ts:2118-2127`) print to console and emit an
  `error.unhandled` telemetry event that — by design (`TELEMETRY.md`) —
  carries **no message, stack, or path**. So when a user reports "it broke",
  neither they nor we have anything to look at.

Recent real-world cost: the symlink-discovery bug (commit `946150d`) and the
stuck-composer bug (commit `21adf12`) each took a live debugging session with
the developer watching the terminal. A user hitting the same bugs would have
had nothing to send.

What exists and works (keep, don't replace):

| Stream | Where | Notes |
| --- | --- | --- |
| Per-conversation `events.log` | `.agents/.conversations/<id>/` | JSONL, seq-numbered, powers SSE replay. Domain events, not diagnostics. |
| `audit.log` | `$DATA_DIR/.cabinet-meta/` | Plain text, frontend-posted UI actions. |
| `feedback.jsonl` | `$DATA_DIR/.cabinet-meta/` | In-app feedback records. |
| Telemetry | `src/lib/telemetry/` | Anonymous, allowlisted, **never** carries stacks/paths. Stays as-is. |

### 1.2 File edit history

Two actors mutate user content, and only one is half-tracked:

- **User edits** funnel through one choke point — every API route calls
  `src/lib/storage/fs-operations.ts` / `page-io.ts`, which call
  `autoCommit()` (`src/lib/git/git-service.ts:31`). A git repo is
  auto-initialized at `$DATA_DIR/.git`. History/diff/restore plumbing
  already exists (`getPageHistory`, `getDiff`, `restoreFileFromCommit`).
- **Agent edits** happen in external CLI processes (`claude -p` etc., cwd
  inside the cabinet) and **bypass the entire app layer**. They are never
  committed. The only record is the self-reported `ARTIFACT:` block parsed
  into `artifacts.json` — best-effort and frequently incomplete.

Worse, the existing `autoCommit` has two defects that actively corrupt
attribution:

1. Every commit is authored `Cabinet <kb@cabinet.dev>` — there is no "who".
2. It stages `git add .` — so the first user edit *after* an agent run
   silently sweeps all the agent's changes into a commit labeled
   `Update <some-page>`. History is not just missing, it's **wrong**.

And one structural gap: cabinets mounted via directory symlink (e.g.
`data/<home>/cabinet-data -> external checkout`) are stored by git as a
symlink entry — the DATA_DIR repo versions **nothing** behind them. The
chokidar watcher also runs `followSymlinks: false`. (Same class of bug as
the discovery fix in `946150d`.)

---

## 2. Goals / Non-goals

**Goals**

- G1: Every process writes structured, rotated, size-capped log files a user
  can find, read, and export — without configuration.
- G2: One-click "Export diagnostics" bundle from Settings, safe to share
  (no secrets, no file contents).
- G3: Every content mutation is attributable: *user* vs *agent `<slug>`*
  (with conversation/task id), visible per-file and as a global activity
  feed, with diff + restore.
- G4: Hard, predictable disk ceilings. Logging must never be the reason the
  disk fills (see the `~/.cabinet/app` bloat incident).

**Non-goals**

- No remote log shipping, no auto-upload, no automatic crash reporting.
  Local-first: log content leaves the machine only by explicit user
  action — exporting a bundle (§3.4) or checking "Attach recent logs" on
  a feedback report (§3.5).
- No realtime per-keystroke versioning; git-commit granularity is enough.
- No replacement of `events.log`/`audit.log`/`feedback.jsonl`.
- No syncing/merging of histories across machines.

---

## 3. Design — Pillar A: Diagnostic logging

### 3.1 One tiny logger, four processes

A zero-dependency module, `src/lib/log/logger.ts` (plus a small CJS twin for
`electron/main.cjs`), used by Next server, daemon, and Electron main. No
pino/winston — we need ~120 lines: level filter → JSONL line → rotating
append, tee to console.

```ts
const log = createLogger("conversation-runner");
log.info("run finalized", { conversationId, exitCode });
log.error("finalize failed", err, { conversationId });
```

**Line format** (JSONL, one file per process):

```json
{"ts":"2026-06-12T14:44:49.849Z","lvl":"error","proc":"daemon","scope":"finalize","msg":"meta.json missing/unreadable","data":{"sessionId":"…"},"err":{"name":"Error","message":"…","stack":"…"}}
```

**Location:** `$DATA_DIR/.cabinet-state/logs/{next,daemon,electron,renderer}.log`
— `.cabinet-state` is already established internal state, already in
`INTERNAL_PATH_PATTERNS` (git-service.ts:186) so it never pollutes the
uncommitted count, works identically in dev and packaged builds, and is
trivially included in the support bundle. Nothing new in `$HOME`.

**Rotation:** size check on write; at 5 MB rename `x.log` → `x.1.log`
(deleting any prior `x.1.log`). 4 streams × 2 generations × 5 MB =
**40 MB absolute ceiling**, no rotation daemon, no cron.

**Levels:** `error | warn | info | debug`. Default `info`. `debug` enabled
by `CABINET_LOG_LEVEL=debug` or a Settings → Advanced toggle ("Verbose
logging"), and surfaced in the bundle metadata so we know what we're reading.

### 3.2 Capturing the existing 149 call sites without a migration

We do **not** rewrite every `console.*` call. At each server entrypoint
(daemon boot, Next `instrumentation.ts`, Electron main) we wrap the global
console: the original still prints (dev terminal experience unchanged), and
a copy lands in the process log file with `scope: "console"`. Existing
`[bracket]` prefixes are parsed into the scope field when present.

New/edited code adopts `createLogger(scope)` opportunistically; the wrapper
guarantees we never again have an error that only existed in a lost stdout.

### 3.3 Crashes and rejections

- **Daemon:** extend the existing handlers to also write `log.error` with
  full stack (locally — telemetry stays scrubbed).
- **Next server:** register the same pair in `instrumentation.ts`.
- **Electron main:** `process.on("uncaughtException")` + write to
  `electron.log`; on fatal, the next launch shows "Cabinet closed
  unexpectedly last time — Export diagnostics?".
- **Renderer:** `window.onerror` + `unhandledrejection` + a `console.error`
  hook, batched (max 20 entries / 10 s, deduped by message) to a new
  `POST /api/system/client-log`, which appends to `renderer.log` through the
  same rotating writer. Rate-limited server-side; silently drops when the
  server is unreachable (never block or break the UI over logging).

### 3.4 Export diagnostics bundle (Settings → Advanced)

One button → save dialog → `cabinet-diagnostics-<date>.zip` (jszip is
already a dependency) containing:

- `logs/` — the 4–8 rotated log files.
- `system.json` — app version, platform/arch, OS version, Node version,
  ports from `runtime-ports.json`, data-dir *path shape* (home-relativized),
  log level, locale, theme.
- `integrations.json` — MCP server **names** and connection state only.
  Never env values; never `.cabinet.env` content (existing rule: key names /
  last4 at most — the bundle includes neither).
- `audit-tail.txt` — last 200 lines of `audit.log`.
- `conversations-index.json` — id/status/timestamps/exitCode of the 20 most
  recent conversations. **No transcripts, no prompts, no file contents.**

**Redaction pass** before zipping: home directory → `~`; any token matching
common secret shapes (`sk-…`, `xox…`, `ghp_…`, 32+ char hex/base64 after
`token|key|secret=`) → `[redacted]`. Defense-in-depth on top of "we never
log values" discipline.

### 3.5 Error feedback — one click, logs optional

Every user-facing error surface (error toasts, the composer's send-failure
banner, task-failed states, the crash-on-last-launch prompt) gets a
**Feedback** button at the bottom. Clicking it opens the existing feedback
dialog, pre-filled with context the user shouldn't have to retype:

- the error message and scope (e.g. `conversation-runner`, `daemon`),
- app version, platform, and — when relevant — the conversation id.

Below the text field, one checkbox: **"Attach recent logs"** (checked by
default — the user is explicitly reporting a problem — with a *preview*
link showing exactly what will be sent). When checked, the submission
includes the **redacted tail** of the relevant log streams: last ~500
lines per process, §3.4 redaction pass applied, gzipped, hard-capped at
1 MB. Unchecked → not a single log byte leaves the machine.

Transport reuses the existing feedback path unchanged: always written
locally to `.cabinet-meta/feedback.jsonl` first, then best-effort POST to
the feedback backend; the log attachment rides along only on the POST
(the local jsonl records `logsAttached: true`, not the bytes). Offline →
queued exactly like feedback is today.

This is deliberately *not* automatic crash reporting: nothing is sent
without the user pressing the button, and the checkbox + preview keep the
log attachment visible and revocable per report.

### 3.6 What gets logged where (policy)

- `error`: anything that surfaces to the user as a failure, all caught
  exceptions at API boundaries, daemon session spawn/finalize failures.
- `warn`: degraded fallbacks (port collision fallback, stale meta
  escape-hatch, discovery cache misses on known cabinets).
- `info`: lifecycle (boot, port bound, session start/exit with id + exit
  code, run finalize, sweeper actions, MCP config writes — names only).
- `debug`: per-request traces, poll loops, watcher events.
- **Never, at any level:** secret values, full prompts, page contents,
  message bodies. Paths are allowed (local file, unlike telemetry).

### 3.7 Telemetry (minimal, allowlisted)

Four new events join the allowlist in `src/lib/telemetry/catalog.ts` (and
the `TELEMETRY.md` table) — same privacy rules as every other event: no
paths, no content, no stacks:

| Event | Payload keys | Why |
| --- | --- | --- |
| `crash.detected` | `proc` (`next`/`daemon`/`electron`/`renderer`) | the one signal we can't get any other way |
| `diagnostics.exported` | — | are users actually using the escape hatch |
| `history.restored` | `source` (`panel`/`activity`) | is restore earning its place |
| `history.tier` | `tier` (`large`/`journal-only`) | how often real installs hit the §4.8 ladder |

---

## 4. Design — Pillar B: File edit history

### 4.1 Principle: git is the ground truth, a journal is the index

We already have versioning, diff, and restore on the DATA_DIR repo. The
missing pieces are **attribution**, **agent coverage**, and a **cheap query
path**. So:

- **Git** stores content history (delta-compressed, `git gc` handles
  overflow — no homegrown snapshot store).
- A new **journal** stores one event per mutation with actor metadata, and
  is what the UI reads (fast, no git subprocess per render). It is
  **per-room**: `<cabinetRoot>/.cabinet-state/file-history.jsonl`
  (implementation note: NOT `.cabinet-meta` as originally drafted —
  `.cabinet-meta` is the link-metadata FILE in linked cabinets, so a
  directory by that name collides; `.cabinet-state` is the existing
  per-room internal-state convention) — matching
  Rooms v3 isolation (rooms are sibling cabinets; one room's activity must
  not leak into another) and the per-root git repos of §4.4, so a
  symlink-mounted cabinet's history travels with it. A cross-room feed, if
  ever wanted, aggregates the per-room files on demand:

```json
{"ts":"…","op":"write","path":"dev/notes/launch.md","actor":{"kind":"agent","slug":"cto","cabinetPath":"hilas-home/cabinet-data/Development/dev","conversationId":"2026-06-12T…-cto-manual"},"commit":"a1b2c3d"}
{"ts":"…","op":"rename","path":"dev/notes/plan.md","from":"dev/notes/draft.md","actor":{"kind":"user","id":"local","name":"hilash"},"commit":"e4f5a6b"}
```

#### Actor identity model

Exactly **two kinds of actor**: a *person* did it, or *Cabinet did it via an
agent*. No surface-level actor names ("Editor", "Sidebar", "Upload" are not
identities — at most quiet metadata).

**Person.** Today that's the single local user; the schema is multi-user
from day one so orgs/companies slot in without a migration:

```json
{"kind":"user","id":"local","name":"hilash"}
```

- `id` is `"local"` in single-user installs. When accounts/orgs arrive it
  becomes the org user id, and `name`/`email` come from the signed-in
  identity. Nothing else in the design changes.
- Display: **You** (single-user) → the member's name + avatar (org mode).
- Identity source: the **existing user profile** —
  `.agents/.config/user.json` (`src/lib/user/profile-io.ts`), already
  captured during onboarding (name, optional email, avatar) and editable
  in Settings. `displayName || name` + `email` (fallback
  `<name>@local`) feed display and git authorship; the org account
  identity supersedes it later. No new profile UI needed.

**Agent.** A slug is **not** an identity — slugs are only unique *per
cabinet* (`persona-manager.ts` reads them from each cabinet's `.agents/`
dir); a tree can hold a `cto` in `dev/` and another in `marketing/`. So the
record is always fully qualified, including the runtime that executed it:

```json
{"kind":"agent","slug":"cto","cabinetPath":"…/dev","conversationId":"2026-06-12T…-cto-manual","runtime":"claude-code","trigger":"manual"}
```

- Display: persona `displayName` || `name` + room chip — **Steve · dev** —
  which disambiguates same-named agents by room. Hover/detail reveals
  runtime (claude code, gemini, …) and trigger (manual / scheduled /
  telegram), linking to the conversation.
- Resolution rule: `(cabinetPath, slug)` → persona lookup for avatar and
  name at render time; if the persona was deleted since, fall back to the
  recorded slug + room so old history never breaks. Names are never baked
  into records.

The optional `via` field (`editor` / `sidebar` / `upload`) may ride along
on user events for debugging, but it never appears in names, authorship, or
the default UI.

Rotation: at 5 MB, keep the newest ~half (rewrite). Git remains the
authoritative long-term record; the journal is a regenerable index.

### 4.2 Fix attribution at the existing choke point (user edits)

`autoCommit(pagePath, action)` becomes `autoCommit(paths, action, actor)`:

1. **Stage only the affected paths** — never `git add .`. This single change
   stops user commits from swallowing agent edits (and stops sweeping any
   unrelated dirty state into mislabeled commits).
2. **Per-commit author** via `--author` — git authorship is used exactly
   the way git designed it: the human or bot who made the change.
   - Person: their real identity from `readUserProfile()` —
     `<displayName || name> <email || name@local>` (e.g.
     `hilash <hilash@local>`), and in org mode the signed-in member's
     name/email. This is precisely the multi-user story: a shared repo
     where each member's commits already carry their identity needs no
     schema change at all.
   - Agent: `<displayName || name> (<room>) <agent@cabinet.local>`, e.g.
     `Steve (dev) <agent@cabinet.local>` — so even raw `git log` output
     distinguishes the `cto` in `dev/` from the one in `marketing/`.
   The repo's `user.name = Cabinet` stays as committer; author carries the
   actor.
3. **Agent commits only** get two machine-readable trailers (person
   commits need none — the author line *is* the identity):
   ```
   Cabinet-Agent: <cabinetPath>#<slug>
   Cabinet-Run: <conversationId>
   ```
   These make the journal fully **regenerable from git alone** — important
   for multi-user later, where the repo syncs between machines but local
   journal files don't.
4. Keep the 5 s debounce, but **per-actor buckets** (a user bucket and one
   per finishing run) so debouncing can't merge actors into one commit.

All API routes already pass through here; they additionally append the
journal event (same code path, one helper: `recordMutation(event)` does
journal + commit scheduling).

### 4.3 Cover agent edits (the real gap)

Agent CLIs write straight to disk, so we capture at **run boundaries**, in
the run-finalize path (where conversation meta/artifacts are already
persisted — `finalizeSessionConversation` and the Next-side completion
handler):

1. On finalize, run `git status --porcelain` over the conversation's
   cabinet root.
2. Stage the dirty *content* paths (respecting `INTERNAL_PATH_PATTERNS` and
   a size guard, §4.7) and commit with the qualified agent author (§4.2),
   message `agent(<slug>): <task title>` + the `Cabinet-Agent` /
   `Cabinet-Run` trailers. The run's conversation meta already carries both
   `agentSlug` and `cabinetPath`, so the qualified identity is free at this
   point.
3. Union the committed path list with the self-reported `ARTIFACT:` paths;
   write one journal event per file. This replaces "trust the agent's
   ARTIFACT block" with "observe the filesystem, keep ARTIFACT as a hint".

**Known imprecision, accepted for v1:** a user edit made *during* an agent
run inside the same cabinet can land in the run-end commit. The 5 s user
debounce makes the window small; per-path staging means it can only happen
for files the user touched while the run was live. Documented, revisitable
with mtime-window heuristics if it bites.

**Process coordination:** both Next (user commits) and the daemon
(run-end commits) touch the same repo from different processes. Git's
`index.lock` already serializes them; we add a small retry-with-backoff
(3 × 250 ms) around staging/commit instead of any cross-process lock of our
own. Commits are rare (debounced / per-run), so contention is negligible.

### 4.4 Symlinked cabinets

`getGit()` becomes cabinet-aware: `getGitFor(cabinetRoot)` resolves the
**realpath** and finds the nearest enclosing repo:

- Inside the DATA_DIR repo → use it (today's behavior).
- Behind a symlink with **its own repo** (e.g. a mounted dev checkout):
  **do not auto-commit into a repo we didn't create.** Journal events are
  still recorded (attribution still works); commits are skipped unless the
  user opts in per cabinet. Marker: `git config cabinet.managed true` is set
  only on repos Cabinet itself initialized, and auto-commit requires it.
- Behind a symlink with no repo → init one at the cabinet root with
  `cabinet.managed = true`, then proceed normally.

This mirrors the discovery-symlink fix: same realpath resolution, same
"don't trample what you don't own" stance as the HOME-dir bootstrap guard.

### 4.5 UI

- **Per-file:** the **existing Version History panel** (clock icon →
  restore from git) is extended, not duplicated: entries gain an actor
  chip — *You* (the member's name + avatar in org mode), or the agent's
  avatar + `displayName` + room (e.g. *Steve · dev*) linking to the
  conversation — and journal-backed events (e.g. heavy files that were
  never committed) appear inline. Diff/restore stay exactly where users
  already know them; a sidebar right-click → **History** opens the same
  panel. One surface, no parallel UI.
- **Global:** an **Activity** view (per room) — reverse-chron journal feed,
  filterable by actor and path prefix. This is also the natural answer to
  "what did that agent just do to my files?".
- **Task detail:** the artifacts list upgrades from "paths the agent
  claimed" to "files the run actually changed", with per-file diff links.

### 4.6 Multi-user / org readiness — and why git still wins

Question raised during review: once companies/orgs use Cabinet (multiple
humans editing one tree), is git history still the right structure?

**Yes — it gets *more* right, not less.** "Many humans plus bots editing a
shared file tree, with per-change attribution, diffs, restore, and history
that syncs between machines" is literally the problem git was built for:

- **Attribution scales for free.** Per-commit author *is* the multi-user
  model. Single-user installs author as the local profile; org mode swaps
  in the signed-in identity. Zero schema change (§4.2).
- **Sync comes with it.** Whatever shape org sync takes (a git remote, a
  backend that pushes/pulls, server-hosted cabinets), commits carry their
  history with them. A bespoke journal format would need its own sync +
  merge protocol; git's already exists and is battle-tested.
- **The journal stays local-only.** It's a regenerable index (authors +
  `Cabinet-Agent`/`Cabinet-Run` trailers reconstruct it), so multi-machine
  setups never need to merge journal files — each machine rebuilds its own.
- **Conflict semantics exist.** Two members editing the same file offline
  is a merge — a solved (if sometimes manual) problem, vs. undefined
  behavior in any homegrown event log.

The honest boundary: git versions *saves*, it does not do **live
co-editing** (two cursors in one document needs CRDT/OT and is a separate,
much bigger project). For "who touched what file, when, show me the diff,
let me restore" — the actual requirement here — git remains the best
structure through the org stage.

### 4.7 Disk ceilings (G4)

- Logs: 40 MB hard cap (§3.1). Journal: 5 MB cap (§4.1).
- Git: content deltas only; `git gc --auto` after every ~100 auto-commits.
  **Binary versioning is a per-cabinet setting** (Settings → room):
  `off` (default) / `≤ 2 MB` / `≤ 5 MB`. At the default, only text files
  are committed; with a threshold, small binaries (page screenshots,
  embedded images) are versioned too so a page restore brings its images
  back. Everything above the threshold is journaled but **not
  committed** — and added to an auto-managed exclude file
  (`.git/info/exclude`, not the user-visible `.gitignore`) so git never
  even *enumerates* it in status scans. The journal records
  `{op, path, actor, skipped: "size"}` — attribution always survives.
  Raising the threshold applies to *future* commits only (no backfill).
- Settings → Advanced shows current usage (logs / journal / `.git`) with a
  "compact now" action (gc + journal trim).

### 4.8 Scale: what happens at 200 GB?

Vanilla git *tracking* 200 GB of content would be a disaster — binaries
don't delta (the object store roughly doubles disk usage), packing/gc
would take hours, and Microsoft needed VFS-for-Git to make their 300 GB
repo usable. **So the design never lets git see the 200 GB.** Two
deliberate separations make it hold:

1. **Git only ever holds the text core.** A 200 GB cabinet is in practice
   ~99% media/PDFs/datasets and a comparatively tiny core of
   markdown/text. The §4.7 size+binary guard keeps everything heavy out of
   the object store *and* out of status scans (exclude file). For
   calibration: the Linux kernel repo — ~80k files, 20 years of full
   history — is ~5 GB and responsive daily-driver territory. Cabinet's
   `.git` stays orders of magnitude smaller than the tree it sits in.
2. **The journal carries history for the heavy files.** Who added,
   replaced, or deleted the 2 GB video — actor, timestamp, op, optional
   content hash for change detection — without ever copying its bytes.
   Users keep "who touched what"; they lose byte-level diffs of videos,
   which is the right trade.

What actually degrades at scale is not bytes but **file count**:
`git status` walks the worktree, so ~1M files means multi-second scans.
Mitigations — all standard git machinery, set by Cabinet at repo init:

- `core.untrackedCache=true` + `core.fsmonitor=true` (git's builtin
  fsmonitor daemon): status cost becomes proportional to changes since
  the last scan, not to tree size.
- Commits already stage **explicit paths only** (§4.2) — they never
  trigger full-tree scans regardless of repo size.
- The status-bar "uncommitted" poll (`getStatus()`) is the one full-status
  consumer; it gets a time budget — exceed ~2 s and the cabinet is flagged
  `large`, dropping the poll to on-demand.

**Graceful-degradation ladder**, so history can never make the app
unusable:

| Tier | Trigger | Behavior |
| --- | --- | --- |
| Normal | default | commits + journal, full UI |
| Large | status > ~2 s or > ~200k files | fsmonitor mandatory, status checks on-demand only |
| Journal-only | text core > ~10 GB, or per-cabinet toggle | no auto-commits; journal still records every mutation with actor — attribution survives, diff/restore don't |

The tier is per cabinet root (symlink mounts already get their own repos,
§4.4) and is shown in Settings → Advanced next to the usage numbers.

If users later need *versioned* large binaries (design files, datasets),
the escape hatch is git-lfs against a local/org object store — additive,
and only worth building post-org. Until then: text is versioned,
everything is attributed, and nothing is ever doubled on disk.

---

## 5. Rollout

| Phase | Contents | Risk |
| --- | --- | --- |
| **1. Logger core** | `src/lib/log/logger.ts` + CJS twin, console capture in daemon/Next/Electron, crash handlers, rotation. No UI. | Low — additive; tee preserves dev terminal output. |
| **2. Diagnostics UX** | `POST /api/system/client-log`, renderer capture, Settings "Export diagnostics" + verbose toggle, crash-on-last-run prompt, Feedback button on error surfaces with "Attach recent logs" checkbox (§3.5). | Low. |
| **3. History engine** | actor-aware `autoCommit` (scoped staging!), run-end agent commits, journal, `getGitFor` symlink handling, index.lock retry. | Medium — touches the write path; needs the §4.3 race documented + tested. |
| **4. History UX** | File History panel, Activity view, task artifacts upgrade, storage usage in Settings. | Low. |

Phase 3 is the only one with migration semantics: existing repos keep their
history; the first actor-aware commit just starts the new convention. No
rewrite of old history.

## 6. Acceptance criteria

- Kill the daemon mid-run → `daemon.log` contains the spawn, the kill, and
  the sweeper's `failed` transition; the user can export a bundle showing
  all of it without touching a terminal.
- Bundle zip contains zero secret values when `.cabinet.env` is fully
  populated (test asserts on the redaction pass output).
- Triggering any error toast shows a Feedback button; submitting with the
  checkbox on delivers a report whose log attachment is ≤ 1 MB, redacted,
  and matches the preview; with the checkbox off, the request body
  contains no log content.
- Agent run that edits 3 files → one commit whose author shows the agent's
  display name + room and whose `Cabinet-Agent` trailer carries
  `<cabinetPath>#<slug>`; 3 journal events with the conversation id. A user
  edit 10 s later → separate commit authored with the user's profile
  identity, containing only the user's file. Two agents with the same slug
  in different rooms produce visually distinct history entries.
- Deleting `file-history.jsonl` and triggering a rebuild reproduces the
  same feed from git trailers/authors alone (journal is an index, not a
  source of truth).
- A symlink-mounted cabinet pointing at a foreign git repo gets journal
  events and **no** auto-commits.
- `du -sh` of logs (40 MB cap) plus any room's journal (5 MB cap each)
  never exceeds its ceiling regardless of runtime.

## 7. Decisions (all resolved in review, 2026-06-12)

1. **Ship order:** logging first (Phases 1–2), then the history engine.
2. **Activity view:** file events only in v1; folding in `audit.log` UI
   events is a later unification (would need an audit.log schema first).
3. **Journal scope:** per-room (`<cabinetRoot>/.cabinet-meta/`), matching
   Rooms v3 isolation and traveling with symlink-mounted cabinets (§4.1).
4. **Binary versioning:** per-cabinet threshold, default text-only —
   `off / ≤2 MB / ≤5 MB` (§4.7).
5. **Git retention:** keep everything forever; `gc` only. No trim tool —
   revisit only if real installs show `.git` bloat.
6. **User identity:** the existing onboarding-captured profile
   (`.agents/.config/user.json`), editable in Settings — no new profile
   UI (§4.1, §4.2).
7. **History UI:** extend the existing Version History panel with actors
   and journal events; no second per-file history surface (§4.5).
8. **Telemetry:** four minimal allowlisted events — `crash.detected`,
   `diagnostics.exported`, `history.restored`, `history.tier` (§3.7).
9. **Error feedback** (added post-review): every error surface gets a
   Feedback button pre-filled with error context, plus an
   "Attach recent logs" checkbox — redacted tails, 1 MB cap, reusing the
   existing feedback transport (§3.5).
