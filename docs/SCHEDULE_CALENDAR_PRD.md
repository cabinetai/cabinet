# PRD — Schedule Calendar: Consolidation + Google-Calendar Interactivity

**Status:** Implemented (Phases 0–4) · **Author:** hilash · **Date:** 2026-06-07
**Driver:** The same "schedule of tasks" is rendered in three places with three different,
drifting toolbars. The user wants them unified onto one component (the big full-bleed
agent-editor layout) and a path to make that calendar feel like Google Calendar:
mark-to-create, drag-to-move, resize, click-empty-to-add.

> **Status note (2026-06-07):** Phases 0–4 are implemented and verified in-browser.
> The three surfaces now mount one canonical `src/components/cabinets/schedule-view.tsx`;
> the custom grid (`schedule-calendar.tsx`) gained drag-to-move + click-to-create; one-off
> tasks render off `runAfter` and create/move via `oneShot` jobs; recurring drag offers
> "this occurrence / all events" with an `exceptions[]` (EXDATE) mechanism enforced
> server-side in the jobs run handler. Phase 5 (resize/duration, ICS sync) remains
> future work. Verified flows: consolidation on all three routes,
> create-by-marking, one-off drag, recurring "all events" cron rewrite, "this occurrence"
> split (exception + separate one-off), and server-side exception suppression.
>
> **UX refinement pass (2026-06-07, from a designer Q&A):** added a hover-to-create
> ghost (faint tinted slot + "+ New task · time"); the create flow is now an *anchored*
> popover (not a center modal) with a **Repeat** control (Once / Daily / Weekly / Custom),
> so calendar-create can make a recurring routine, not just a one-off; drag is restricted
> to *future job* pills — past runs and heartbeats show a not-allowed cursor and a toast
> explaining why ("Past runs can't be moved" / "Heartbeats are set per agent"); and a full
> **right-click context menu** (event: Run now / Edit / Duplicate / Skip this occurrence /
> Enable·Disable / Delete; empty: New task here / New recurring routine). These extend
> §6.2–§6.3 and are verified in-browser.

---

## 1. Summary

Cabinet shows a calendar of agent activity (recurring jobs, agent heartbeats, and past
manual runs) in **three** surfaces. All three already render one shared engine,
`ScheduleCalendar` (`src/components/cabinets/schedule-calendar.tsx`), but each wraps it in
its own toolbar. Those wrappers have drifted: one can't navigate at all, one uses bare
`←/→` text buttons with no "Today" and no range label, and one is a full local
re-implementation. The result is three subtly different calendars over one engine.

This PRD has two parts:

- **Part A — Consolidation.** Collapse the three wrappers into a single canonical
  `ScheduleView` component, rendered full-bleed (the "big" look the user likes), mounted in
  all three places. Pure refactor, no behavior change.
- **Part B — Google-Calendar interactivity.** Evolve the (kept) custom grid into a
  direct-manipulation scheduler: drag an event to reschedule, click-drag an empty range to
  create, click an empty slot to add, with a new **one-off scheduled-task** primitive and
  GCal-style "this occurrence vs the whole series" editing.

Part A is a prerequisite for Part B: every interaction we add lands in one place instead of
three.

## 2. Goals & non-goals

**Goals**
- One source of truth for the schedule UI; the three surfaces become thin mounts.
- Identical navigation and chrome everywhere (prev / today / next, range label,
  day / week / month), in the full-bleed "big" layout.
- Direct manipulation: drag-to-move, mark-to-create, click-empty-to-add.
- A first-class **one-off task** that runs once at a specific date and time (today the
  system only has recurring cron jobs + immediate manual runs).
- GCal-style choice when editing a recurring event: **this occurrence** vs **all events**.
- Optimistic UI: a dragged or created event holds its new position instantly, no snap-back.

**Non-goals (this PRD)**
- Adopting a third-party calendar library (react-big-calendar, FullCalendar). We extend the
  existing custom grid to preserve theming and the existing pill/dot/missed-run/now-line
  investment.
- ~~GCal's third recurrence option, **"this and following"** (series split). Deferred to a
  stretch phase.~~ **Implemented 2026-06-08** (Phase 5a, see §6.6). The remaining Phase 5
  non-goals below still hold.
- Event **duration / resize** as a real concept. Cabinet jobs have no duration today;
  resize is a documented stretch item only.
- Cross-timezone correctness for remote daemons (calendar assumes daemon and browser share
  a timezone, consistent with `docs/CALENDAR_RUN_LINKAGE.md` caveat 1).
- External calendar sync (ICS export, Google Calendar two-way). Future work.

## 3. Decisions (from product Q&A, 2026-06-07)

| Question | Decision |
|---|---|
| Sequencing | **PRD only** this session. The PRD covers both consolidation and the interactive vision as phased work; implementation follows. |
| Edit model for "add by marking" / "drag to a new time" | **Introduce a one-off scheduled-task primitive.** Mark-to-create makes a one-off; dragging a recurring event prompts **"this occurrence or the whole series?"**. |
| Rendering approach | **Extend the existing custom grid** (`ScheduleCalendar`). No new calendar dependency. |

## 4. Current state (as built)

### 4.1 The three surfaces

| | Route | Page → wrapper | Toolbar | Scope | Click behavior |
|---|---|---|---|---|---|
| **1. Tasks → Schedule** | `#/cabinet/<room>/tasks` | `TasksBoard` → `ScheduleView` (`src/components/tasks/board/schedule-view.tsx`) | prev / today / next, range label, day·week·month, explainer | All agents + jobs in cabinet, + manual-run pills | manual → open task; job → routine dialog; heartbeat → heartbeat dialog |
| **2. Agents → Schedule** | `#/cabinet/<room>/agents/schedule` | `AgentsWorkspaceV2` → `ScheduleTab` (`src/components/agents/v2/schedule-tab.tsx`) | day·week·month + explainer only; **no prev/next, no "Today", fixed `anchor`, no range label** | All agents + jobs (no manual pills) | job → routine dialog; heartbeat → heartbeat dialog; day-click is a no-op |
| **3. Agent editor → Schedule** | `#/cabinet/<room>/agents/<slug>` | `AgentDetailV2` → **local** `ScheduleView` (`agent-detail-v2.tsx:1931`) | day·week·month + bare `←` / Today / `→` text buttons; **no range label** | **Single agent** + that agent's manual runs | manual → open conversation; jobs/heartbeats not editable here |

All three import and render the **same** `ScheduleCalendar`. The duplication is entirely in
the surrounding toolbar/scoping logic. Surface 3 is the layout the user prefers because it
is full-bleed (fills the agent detail page; no `max-w-6xl` clamp like Surface 1).

### 4.2 The shared engine — `ScheduleCalendar`

`src/components/cabinets/schedule-calendar.tsx` is a capable, hand-rolled calendar:

- **Views:** `day` / `week` (`TimeGridView`) and `month` (`MonthView`).
- **Time grid:** measures its container and fits the visible hour range
  (default 5 AM to 11 PM) to height; a `density` prop adds px per hour and lets it scroll.
  Events are bucketed per 15-minute slot.
- **Overflow handling:** crowded slots collapse pills into agent-colored **dots** (week > 2,
  month > 3); day view grows the column vertically instead. Off-window events surface as
  "N earlier / N later" chevrons that expand the visible range.
- **State cues:** now-line (red), today highlight, disabled (dashed/hollow), and
  **missed-run** styling (muted, see `docs/CALENDAR_RUN_LINKAGE.md`).
- **Interaction today is click-only.** Props: `onEventClick(event)` and
  `onDayClick(date)`. **There is no drag, no create, no resize.**

### 4.3 Event & data model

- `ScheduleEvent` (`src/lib/agents/cron-compute.ts`) has
  `sourceType: "job" | "heartbeat" | "manual"`, `time: Date`, `enabled`, `cronExpr`, plus
  refs (`jobRef`, `agentRef`, `conversationId`).
- `getScheduleEvents(agents, jobs, start, end)` derives **future** events: for each job it
  walks `computeNextCronRun(job.schedule, ...)` (a from-scratch cron parser, searches up to
  35 days), and for each agent with a `heartbeat` cron it does the same. Cross-cabinet
  duplicates are de-duped by a logical key.
- `getManualScheduleEvents(conversations, ...)` adds **past** manual runs as one pill each.
- The calendar consumes **`CabinetAgentSummary` / `CabinetJobSummary`** (the overview
  shapes), **not** raw `JobConfig`. This matters for Part B (see §6.1).

### 4.4 Persistence & the daemon

- **Jobs** are YAML at `{cabinetPath}/.jobs/{id}.yaml`; the type is `JobConfig`
  (`src/types/jobs.ts`). Managed by `src/lib/jobs/job-manager.ts`
  (`saveAgentJob`, `loadAgentJobsBySlug`, `deleteAgentJob`, `executeJob`,
  `normalizeJobConfig`).
- **Heartbeats** live in the agent's `persona.md` frontmatter (`heartbeat`,
  `heartbeatEnabled`).
- **Mutations:** `POST /api/agents/[id]/jobs` (create), `PUT .../jobs/[jobId]`
  (field-merge update, or `action:"run"` / `action:"toggle"`), `DELETE .../jobs/[jobId]`.
  Heartbeats go through `PUT /api/agents/personas/[slug]`. After any change the route calls
  `reloadDaemonSchedules()` (`src/lib/agents/daemon-client.ts`).
- **The daemon** (`server/cabinet-daemon.ts`) is the long-running process that registers all
  cron via `node-cron`. `reloadSchedules()` re-reads every cabinet's `.jobs/*.yaml` and
  persona heartbeats. A chokidar watcher also auto-reloads (~200 ms debounce) when those
  files change, so writing the YAML is sufficient to reschedule even without the explicit
  reload call. Cron fires in **host local time** (no `{timezone}` passed).
- **Schedule building UI** already exists: `SchedulePicker`
  (`src/components/mission-control/schedule-picker.tsx`) with interval/daily/weekday/weekly/
  monthly/custom modes, plus an NL→cron endpoint (`/api/schedule/parse`) and
  `cronToHuman` (`src/lib/agents/cron-utils.ts`).

### 4.5 The one-off primitive is ~80% already built

This is the most important finding for Part B. `JobConfig` **already** has:

- `oneShot?: boolean` — "auto-disable after first fire."
- `runAfter?: string` — an ISO instant the job was created to run at (currently
  informational).

And the machinery already honors them:

- The daemon's `scheduleJob()` registers the cron; after the run PUT resolves, if
  `job.oneShot` it disables the job and removes the cron handle.
- `src/lib/agents/action-dispatcher.ts` already mints one-off jobs when an agent schedules a
  future action: it converts a `Date` to a single-fire cron via a private
  `isoToCronExpression(date)` (`${min} ${hour} ${dom} ${month} *`) and saves a job with
  `oneShot: true` + `runAfter`. (If the target is in the past / within 60 s, it runs
  immediately instead of arming a job.)

So one-offs already **fire and clean up**. What's missing is exposing them to the user and
to the calendar. The real gaps:

1. **`CabinetJobSummary` (`src/types/cabinets.ts`) and `normalizeJob`
   (`src/lib/cabinets/overview.ts`) drop `oneShot` / `runAfter`.** The calendar reads the
   summary, so it literally cannot tell a one-off from a recurring job today.
2. **`getScheduleEvents` treats every job as recurring** (cron loop). A one-off with a
   `M H D Mon *` cron happens to render at most one pill in a given month, but once fired and
   disabled, its next cron match is a year out (outside the 35-day window), so it vanishes
   from history. One-offs should render as a single event at `runAfter`.
3. **No per-occurrence exception mechanism** exists (needed for "this occurrence only").
4. **`oneShot` disable is success-path only.** If the run PUT fails, the daemon logs but
   doesn't disable, so a failed one-off stays armed. Spent one-offs also accumulate as
   `enabled:false` YAML rather than being deleted.

### 4.6 Refresh & optimistic-update substrate

The calendar's `jobs`/`agents` come from `fetchCabinetOverviewClient`
(`src/lib/cabinets/overview-client.ts`), which has a **3 s TTL cache** plus
`invalidateCabinetOverview(path)` and a `{ force: true }` bypass. An optimistic-update
pattern already exists in `src/components/agents/v2/agents-context.tsx` (set local state →
fire PUT → roll back on failure). Part B reuses both so a dragged pill never snaps back
during the refetch.

## 5. Part A — Consolidation

**Goal:** one component, three mounts, full-bleed, navigation parity. No behavior change.

### 5.1 The canonical component

Promote a single `ScheduleView` to a shared location
(`src/components/cabinets/schedule-view.tsx`, or a new `schedule/` folder), built from the
**richest** existing wrapper (the tasks-board one) and rendered **full-bleed**:

- Owns the toolbar: prev / **Today** / next, range label, day·week·month toggle, and the
  explainer toggle.
- Owns `mode` + `anchor` state and the `navigate()` / range-label logic (already in
  `tasks/board/schedule-view.tsx`).
- Renders `ScheduleCalendar` inside a bordered card that fills available height.
- Drop the `max-w-6xl` clamp; a `fullBleed` / `density` prop controls padding so the same
  component looks right both inside a tab and as a full agent-detail page.

**Proposed props:**

```ts
interface ScheduleViewProps {
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  conversations?: ConversationMeta[];     // manual-run pills; omit to hide
  showExplainer?: boolean;                // default true
  fullBleed?: boolean;                    // default false (tab); true in agent editor
  // click routing (each surface wires what it supports)
  onConversationClick?: (id: string) => void;
  onJobClick?: (job: CabinetJobSummary, agent: CabinetAgentSummary) => void;
  onHeartbeatClick?: (agent: CabinetAgentSummary) => void;
}
```

Single-agent scoping (Surface 3) is just the caller passing a one-element `agents` array and
that agent's `jobs` — no special prop needed (this is what the local `ScheduleView` already
does via `personaToCabinetAgent` / `jobToCabinetJob`).

### 5.2 Migration

| Surface | Change |
|---|---|
| Tasks → Schedule | Import the canonical `ScheduleView` (it already lives here; mostly a move + full-bleed prop). |
| Agents → Schedule | **Delete** `src/components/agents/v2/schedule-tab.tsx`; mount the canonical `ScheduleView` with `showExplainer`, the context's `agents`/`jobs`, and route clicks to `setRoutineDialog` / `setHeartbeatDialog`. Gains prev/today/next + range label for free. |
| Agent editor → Schedule | **Delete** the local `ScheduleView` in `agent-detail-v2.tsx` (lines ~1931-2031); mount the canonical one with `fullBleed`, a one-element `agents` array, the agent's jobs, and `onConversationClick`. |

`ScheduleCalendar` (the engine) is untouched in Part A.

**Net:** ~2 wrapper implementations removed, 3 mounts pointing at 1 component, identical
navigation everywhere. This is **Phase 0** and ships independently.

## 6. Part B — Google-Calendar interactivity

All of this is built **on the existing custom grid**. The engine stays controlled: it
receives events + callbacks and renders; the wrapper owns mutations and optimistic state.

### 6.1 One-off scheduled-task primitive

Make `runAfter` the **canonical instant** for a one-off (it is already written by
`action-dispatcher.ts` and round-trips through normalization), and surface it everywhere:

- **Types:** add `oneShot?`, `runAfter?`, and `exceptions?: string[]` to `CabinetJobSummary`
  (`src/types/cabinets.ts`); map them in `normalizeJob` (`src/lib/cabinets/overview.ts`).
  Add `exceptions?: string[]` to `JobConfig` and pass it through `normalizeJobConfig`
  (conditional-spread like `oneShot`/`runAfter` already are).
- **Rendering:** in `getScheduleEvents` (`src/lib/agents/cron-compute.ts`), when a job has
  `runAfter` (or `oneShot`), **emit a single event at that instant** if it falls in the
  window and skip the cron loop for that job. This fixes history (fired one-offs still show
  in the past) and avoids the yearly-refire ghost.
- **Shared cron util:** promote `isoToCronExpression(date)` out of `action-dispatcher.ts`
  into a shared module (e.g. `src/lib/agents/one-off.ts` or alongside `cron-compute.ts`) so
  the create-UI and the dispatcher produce identical single-fire crons.
- **Daemon hardening (recommended):** also disable on the run **failure** path, and
  **delete** (not just disable) a spent one-off so `.jobs/` doesn't accumulate dead YAML.
  The daemon already runs a daily maintenance cron that a cleanup sweep can hook into.

A one-off is therefore: a `JobConfig` with `oneShot:true`, `runAfter:<ISO>`, and a derived
single-fire `schedule` cron. No new storage, no new scheduler, no new endpoint required.

### 6.2 Create by marking

- **Day / week:** click an empty slot, or click-drag a vertical range, to open an inline
  "new task" popover (title, target agent, runtime, and the resolved date/time). On confirm,
  `POST /api/agents/<agent>/jobs` with `oneShot:true`, `runAfter`, and the single-fire cron.
- **Month:** click an empty day → create at a sensible default hour (or open the popover
  pre-set to that day).
- Reuse `SchedulePicker` semantics where a user wants to upgrade the one-off into a
  recurring routine before saving.

### 6.3 Drag to move (reschedule)

- Add pointer handlers to `ScheduleCalendar` behind a new optional callback,
  `onEventMove(event, newTime: Date)`. The engine renders a live "ghost" pill while
  dragging; the wrapper performs the mutation. The engine stays presentational.
- **Time-from-Y math** reuses the existing geometry (`HOUR_HEIGHT`, `visibleStartHour`,
  the same formula `top = (hour - visibleStartHour) * HOUR_HEIGHT + (min/60)*HOUR_HEIGHT`,
  inverted). Snap to 15-minute increments to match the bucketing.
- **On drop, by event type:**
  - **one-off / manual-derived** → rewrite `runAfter` + the single-fire cron.
  - **recurring** → prompt **"This occurrence" / "All events"**:
    - **All events** → rewrite the job's cron and PUT it (field-merge branch). Preserve the
      cadence fields and swap only what the drop implies: same column, new time → swap
      minute+hour; new weekday column (week view) → set the DOW field; month-view drop →
      set the day-of-month field. Mirror `pickerStateToCron` field order so the result
      re-parses cleanly in `SchedulePicker`.
    - **This occurrence** → (a) add the dragged-from instant to the job's `exceptions[]`,
      and (b) create a new **one-off** at the dropped time carrying the same prompt / agent.
- **Heartbeats:** dragging a heartbeat rewrites the persona `heartbeat` cron via
  `PUT /api/agents/personas/<slug>`. (Heartbeats have no "this occurrence" concept; they are
  always series edits.)

### 6.4 Per-occurrence exceptions ("this occurrence")

- `exceptions: string[]` (ISO instants) on the job is the iCalendar **EXDATE** pattern:
  minimal, survives the YAML round-trip, no new files.
- **Calendar filter:** in `getScheduleEvents`, skip any computed occurrence whose
  `minuteIso(next)` matches an entry in `exceptions` (reuse the existing `minuteIso` helper
  so matching is minute-granular).
- **Server enforcement (required, not cosmetic):** the original cron still fires on the
  excepted minute, so the API `action:"run"` handler
  (`src/app/api/agents/[id]/jobs/[jobId]/route.ts`) must skip execution when the incoming
  `scheduledAt` matches an exception. Hiding it in the UI alone would let the original run
  still execute.

### 6.5 Optimistic update

Mirror the `agents-context.tsx` pattern so direct manipulation feels instant:

1. On drop/create, immediately patch local overview state (e.g. an `applyJobPatch(scopedId,
   partial)` exposed by `use-board-data.ts`); the calendar recomputes from the patched
   cron / `runAfter` and the pill holds its new position.
2. Fire the PUT/POST.
3. `invalidateCabinetOverview(cabinetPath)` then a **delayed** forced `refresh` (~400 ms, so
   the daemon's ~200 ms watcher has settled and the refetch returns the written value).
4. On failure, roll the patch back (re-apply the original schedule) and toast.

### 6.6 "This and following" — series split (Phase 5a, implemented 2026-06-08)

Dragging a recurring occurrence now offers a **third** scope alongside "This occurrence"
and "All events". Choosing **This and following** keeps every earlier run on the old
schedule and moves this occurrence plus all later ones to the dropped time.

- **Series window.** Added `since?` / `until?` (iCalendar **DTSTART** / **UNTIL**) to
  `JobConfig` and `CabinetJobSummary`. A recurring job emits no occurrences **before
  `since`** (inclusive) or **at/after `until`** (exclusive). `normalizeJob` /
  `normalizeJobConfig` pass them through with the same conditional-spread pattern as
  `exceptions`.
- **Both bounds are required, not just `until`.** Capping the original series with `until`
  alone would let the forked cadence's daily cron "leak" backward onto days *before* the
  split and double-book them. The fork therefore carries `since` at the same instant, so the
  two halves partition the timeline exactly: `[…, split)` on the old schedule, `[split, …)`
  on the new one.
- **Operation.** `until = splitInstant` is PUT onto the original job (optimistic patch);
  a new sibling job is POSTed with an explicit unique id, `since = splitInstant`, and the
  dropped cadence (`rescheduleCron`, same as "All events"). Rollback removes the patch and
  the optimistic fork on failure.
- **Rendering.** `getScheduleEvents` filters the window: an early `break` on `until` (safe
  because occurrences are monotonic) and a `since` skip. The shared
  `withinSeriesWindow(job, when)` helper (`one-off.ts`) is the single source of truth.
- **Server enforcement (required).** node-cron has no end-date, so the original cron keeps
  firing past `until` and the fork's cron can fire before `since`. The jobs run handler
  suppresses out-of-window scheduler fires (`skipped: "series-window"`) using the same
  helper — a UI-only hide would still execute them. When a capped series has **fully ended**
  (its `until` is now in the past), the handler retires it inline (`enabled:false` + reload)
  so the daemon stops firing the dead cron daily.
- **Tests.** `test/cron-compute-series-window.test.ts` pins the bound semantics
  (until-exclusive, since-inclusive, open-bounds), the capped-before-split count, the
  no-backward-leak guarantee against an unbounded control, and a clean week partition.

Still deferred to a later Phase 5: resize/duration and ICS/Google sync (§2 non-goals).

## 7. Phasing

| Phase | Scope | Ships independently? |
|---|---|---|
| **0 — Consolidation** | Part A: one `ScheduleView`, full-bleed, three mounts, delete two duplicates. No behavior change. | Yes |
| **1 — Calendar polish** | Navigation parity everywhere, keyboard nav (←/→/T, view hotkeys), today/range-label parity. Read-only. | Yes |
| **2 — Drag-move recurring** | `onEventMove`, ghost pill, time-from-Y, "All events" cron rewrite, optimistic update (§6.3 all-events + §6.5). | Yes |
| **3 — One-off + create-by-marking** | §6.1 primitive plumbing + §6.2 mark-to-create. | Yes |
| **4 — Per-occurrence editing** | §6.4 `exceptions[]` + the "this occurrence / all events" prompt + server enforcement. | Yes |
| **5a — Series split** | "This and following": `since`/`until` window + fork + server enforcement (§6.6). **Implemented 2026-06-08.** | Yes |
| **5 — Stretch** | Resize/duration (needs a job duration concept), ICS/Google sync. | Later |

## 8. Risks & edge cases

- **DST.** node-cron fires on local wall-clock match. A one-off at a non-existent
  spring-forward time never fires; a fall-back duplicated time could fire twice, but
  `oneShot` disable guards the second fire **on the success path only** (see daemon
  hardening, §6.1).
- **Leap-day one-off.** `isoToCronExpression(Feb 29)` yields `... 29 2 *`, which only matches
  in leap years. Rendering off `runAfter` (not the cron) avoids a misleading pill; an
  explicit expiry/cleanup avoids a forever-armed job.
- **Daemon off when due.** No catch-up; the slot renders as **missed** (existing
  `isEventMissed` + `docs/CALENDAR_RUN_LINKAGE.md`). One-offs that miss stay armed until the
  next cron match (a year out) unless cleaned up.
- **Past-slot drops.** Dropping into the past must mirror `action-dispatcher` behavior:
  run-now or reject, never silently arm a year-out job.
- **Exception enforcement.** Must be server-side (§6.4); a UI-only hide still executes the
  original run.
- **Spent one-offs accumulate.** Daemon disables rather than deletes; add a cleanup sweep.
- **Timezone divergence.** If a remote daemon and the browser disagree on timezone, dropped
  times and fired times diverge. Out of scope; documented (same as the existing linkage
  caveat).
- **Refetch race.** A non-delayed forced refresh can return pre-write data; the ~400 ms
  delay + optimistic patch (§6.5) covers it.

## 9. File-by-file touch list (for implementation)

**Part A — consolidation**
- `src/components/cabinets/schedule-view.tsx` *(new canonical component; or move from
  `tasks/board/`)*
- `src/components/tasks/board/schedule-view.tsx` *(becomes a thin mount or is replaced)*
- `src/components/agents/v2/schedule-tab.tsx` *(delete; remount canonical)*
- `src/components/agents/v2/tabs-layout.tsx` *(point the `schedule` tab at the canonical
  component)*
- `src/components/agents/agent-detail-v2.tsx` *(delete local `ScheduleView` ~1931-2031;
  remount canonical with `fullBleed`)*

**Part B — interactivity**
- `src/types/jobs.ts` *(`exceptions?`; treat `runAfter` as canonical)*
- `src/types/cabinets.ts` *(add `oneShot?`, `runAfter?`, `exceptions?` to
  `CabinetJobSummary`)*
- `src/lib/cabinets/overview.ts` *(map the three fields in `normalizeJob`)*
- `src/lib/jobs/job-normalization.ts` *(pass `exceptions` through)*
- `src/lib/agents/cron-compute.ts` *(one-off short-circuit + exception filter in
  `getScheduleEvents`)*
- `src/lib/agents/one-off.ts` *(new: shared `isoToCronExpression` + helpers)*
- `src/lib/agents/action-dispatcher.ts` *(use the shared util)*
- `src/components/cabinets/schedule-calendar.tsx` *(pointer/drag + `onEventMove`, ghost pill,
  create handlers)*
- `src/components/cabinets/schedule-view.tsx` *(drop → mutate, occurrence/series prompt,
  create popover, optimistic patch)*
- `src/components/tasks/board/use-board-data.ts` *(`applyJobPatch` + delayed forced refresh)*
- `src/app/api/agents/[id]/jobs/[jobId]/route.ts` *(exception enforcement in `action:"run"`)*
- `server/cabinet-daemon.ts` *(optional: disable-on-failure + delete spent one-offs)*

## 10. Verification (once implemented)

1. `npm run dev:all` (Next + daemon).
2. **Consolidation:** open all three routes (tasks → Schedule, agents → Schedule, agent
   editor → Schedule) and confirm one identical full-bleed component with the same toolbar
   and navigation; the agents-tab gains prev/today/next + range label.
3. **Recurring move (all events):** drag a daily job's pill to a new time → choose **All
   events** → the pill moves, the `.jobs/<id>.yaml` cron is rewritten, and it survives a
   reload.
4. **This occurrence:** drag one occurrence → choose **This occurrence** → an entry is added
   to `exceptions[]`, a one-off appears at the new time, the original occurrence is hidden,
   and the original does **not** execute at its old minute (verify no conversation is
   created for it).
5. **Create by marking:** click an empty slot (or drag a range) → confirm the popover → a
   one-off job is written with `oneShot:true` + `runAfter`; it fires once at that minute then
   auto-disables (or is deleted).
6. **One-off history:** a fired one-off still renders in the past (not vanished) and clicking
   it opens its conversation.
7. **Optimistic update:** a dragged pill never snaps back during the ~3 s overview cache
   window; a forced PUT failure rolls it back.
8. `npm run lint` and `npx tsc --noEmit` clean on all modified files.

## 11. Open questions

- **Create popover surface.** Reuse `NewRoutineDialog` (full dialog) vs a lighter inline
  popover for the one-off fast path? Recommendation: lightweight popover for create, with a
  "more options" link into the full routine dialog.
- **Default agent for mark-to-create** in the multi-agent (tasks/agents) surfaces — last
  used, a picker in the popover, or the cabinet's `editor` agent?
- **Heartbeat drag** — allow it (rewrites the persona cron) or lock heartbeats to
  click-to-edit only to avoid accidental schedule changes? Recommendation: click-to-edit in
  v1; revisit drag for heartbeats later.
- **Resize / duration** — does Cabinet want a real job-duration concept, or is the bottom
  edge purely a `timeout` hint? Deferred to Phase 5.

---

*Related: `docs/CALENDAR_RUN_LINKAGE.md` (scheduledAt run-linkage, missed-run styling),
`docs/TASK_BOARD_PRD.md`, `docs/AGENT_PAGE_PRD.md`.*
