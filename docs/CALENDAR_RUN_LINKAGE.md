# Jobs & Heartbeats Calendar — Run Linkage & Density Redesign

Date: 2026-04-17
Branch: `main` (commits `480ce33`, `e4fa13d`)

## What prompted this work

The Jobs & heartbeats calendar had three problems visible in the user's screenshots:

1. **Crowded slots silently dropped events.** When a 15-minute slot had more pills than the hard cap (2 for week, 3 for day, 3 for month), the extras were hidden with no way to reach them. In a cabinet with many heartbeats clustered at 5–9 AM, ~12 items piled on top of each other and only 2 were interactable.
2. **Past events were unclickable or fuzzy.** Clicking a past pill did nothing useful — or in the later iteration, did a best-effort "closest by startedAt" lookup that could match the wrong conversation, especially for heartbeats (no `jobId` anchor).
3. **No way to tell which past events ran.** Missed runs (daemon was off, schedule disabled, run failed to launch) looked identical to successful ones.

## What changed

### 1) Crowded slots → agent-colored dots (commit `480ce33`)

In `src/components/cabinets/schedule-calendar.tsx`:

- New `EventDot` component — ~10 px circle in the agent's color, wrapped in a tooltip (`@base-ui/react/tooltip`). Hover shows agent · label · time · past/upcoming.
- **Week view** (`TimeGridView`, multi-day): slots with more than 2 events render as a wrapping row of dots instead of pills.
- **Month view** (`MonthView`): days with more than 3 events render as dots. The existing inert "+N more" text was removed.
- **Day view** (single column, still in commit `480ce33`): keeps pills but the column **grows vertically** when a stack would overlap the next slot. Buckets are walked in time order and shifted down as needed; `columnHeight` is computed and replaces the old fixed `TOTAL_HOURS * HOUR_HEIGHT`. Hour labels stay at natural positions — pills carry exact timestamps, so the drift is acceptable.
- The month day cell was converted from `<button>` to `<div role="button">` because `EventDot` renders a `<button>` and nested buttons are invalid HTML.

### 2) Past pill/dot click → task conversation panel

`handleScheduleEventClick` in `src/components/cabinets/cabinet-view.tsx` now branches on `event.time < Date.now()`:

- **Future event** → existing edit dialog (`jobDialog` / `heartbeatDialog`).
- **Past event** → look up the matching conversation and open `TaskDetailPanel` via `setTaskPanelConversation` (same pattern `tasks-board.tsx:1210` uses).

### 3) `scheduledAt` stamp on every scheduler-launched conversation (commit `e4fa13d`)

This is the architectural change. Replace the "closest by startedAt" heuristic with an exact key on a new persisted field.

New field on `ConversationMeta` (in `src/types/conversations.ts`):

```ts
scheduledAt?: string;
```

Plumbed through the full launch path:

- `src/lib/agents/conversation-store.ts` — `CreateConversationInput` accepts it; `createConversation` writes it into `meta.json`.
- `src/lib/agents/conversation-runner.ts` — `StartConversationInput` and `startConversationRun` accept it. `startJobConversation(job, { scheduledAt? })` forwards.
- `src/lib/agents/heartbeat.ts` — `runHeartbeat(slug, cabinetPath?, scheduledAt?)` and `startManualHeartbeat(slug, cabinetPath?, scheduledAt?)`.
- `src/lib/jobs/job-manager.ts` — `executeJob(job, { scheduledAt? })` forwards into `startJobConversation`.
- `src/app/api/agents/[id]/jobs/[jobId]/route.ts` — `PUT` handler reads `body.scheduledAt` and passes it into `executeJob`.
- `src/app/api/agents/personas/[slug]/route.ts` — `action: "run"` handler reads `body.scheduledAt` and passes it into `startManualHeartbeat`.
- `server/cabinet-daemon.ts` — both `scheduleJob` and `scheduleHeartbeat` cron callbacks compute:

```ts
const scheduledAt = new Date(Math.round(Date.now() / 60000) * 60000).toISOString();
```

and include it in the PUT body alongside `action: "run"` and `source: "scheduler"`. The minute-rounding is deliberate: `ScheduleEvent.time` from `cron-compute.ts` is always minute-precise, so both sides normalize to the same bucket. Manual runs (via the UI's "Run now" button or ad-hoc invocation) leave `scheduledAt` undefined.

### 4) Lookup map + exact-key click routing

In `src/lib/agents/cron-compute.ts`, new shared helpers used by both the runtime and the UI:

```ts
minuteIso(date)                                       // round to minute, return ISO UTC
buildScheduledKey(agentSlug, sourceType, jobId, when) // "slug::job|heartbeat::jobId|-::minuteIso"
```

In `cabinet-view.tsx`:

- `scheduledConversations: Map<string, ConversationMeta>` state.
- `loadScheduledConversations` fetches both `/api/agents/conversations?trigger=job` and `?trigger=heartbeat` (limit 500, same visibility mode as the overview) and builds the map. Runs on mount, every 15 s, and on window focus — piggybacking on the existing `loadOverview` interval.
- Map keys prefer `scheduledAt` when present. For legacy conversations (written before this change), the key uses `startedAt` rounded to the minute — a rough match that still opens the right conversation when the run started within 30 s of its scheduled slot.
- `lookupConversationForEvent(event)` does an exact-key lookup against the map. `fetchLegacyConversationForEvent(event)` is the ±90 s fuzzy fallback for runs outside the map or outside that 30 s bucket.

`handleScheduleEventClick` is now:

1. Future → edit dialog.
2. Past → exact lookup. Hit → open task panel.
3. Past + miss → legacy fetch (filter to conversations with no `scheduledAt`, ±90 s window).
4. Still miss → open edit dialog and pass `missedRun: { scheduledAt: event.time.toISOString() }` so the dialog shows the warning banner.

### 5) "Did not run" visual treatment

In `schedule-calendar.tsx`, a new helper `isEventMissed(event, now, scheduledConversations)` returns `true` when the event is past, enabled, and its key is not in the map. Three surfaces use it:

- **`EventPill`** — strips the agent color, uses `bg-muted/40 text-muted-foreground`, prefixes the label with a small amber `AlertCircle` (lucide). Title attribute appends `· did not run`.
- **`EventDot`** — renders hollow: `backgroundColor: transparent`, `borderWidth: 1.5`, solid border in the agent color. Disabled events keep a dashed border — so three states (active / disabled / missed) are visually distinct. Tooltip appends `· did not run`.
- **Month view pill** (the non-dot fallback) — same muted treatment + the amber icon.

### 6) "Did not run" dialog banner

`jobDialog` and `heartbeatDialog` state shapes gained `missedRun?: { scheduledAt: string }`. A new `MissedRunBanner` component renders at the top of the dialog body (above the schedule picker) when `missedRun` is set:

> **This run did not execute at {date time}.**
> Possible causes: the Cabinet daemon was not running, the schedule was disabled at that time, or the run failed to start before it was recorded.

Styled with `border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300` and an `AlertTriangle` icon.

## Files touched

### UI
- `src/components/cabinets/cabinet-view.tsx`
- `src/components/cabinets/schedule-calendar.tsx`

### Shared helpers
- `src/lib/agents/cron-compute.ts` (added `minuteIso`, `buildScheduledKey`)

### Runtime / persistence
- `src/types/conversations.ts`
- `src/lib/agents/conversation-store.ts`
- `src/lib/agents/conversation-runner.ts`
- `src/lib/agents/heartbeat.ts`
- `src/lib/jobs/job-manager.ts`

### API routes
- `src/app/api/agents/[id]/jobs/[jobId]/route.ts`
- `src/app/api/agents/personas/[slug]/route.ts`

### Daemon
- `server/cabinet-daemon.ts`

### Progress log
- `PROGRESS.md`

## Key format reference

All three lookups agree on this format:

```
{agentSlug}::{sourceType}::{jobId || "-"}::{minuteIso}
```

- `sourceType` ∈ `"job" | "heartbeat"`
- `jobId` is the job id for jobs, `"-"` for heartbeats
- `minuteIso` = `new Date(Math.round(ms / 60000) * 60000).toISOString()`

Example: `devops::job::daily-bug-triage::2026-04-17T07:00:00.000Z`

## Known caveats

1. **Timezone between daemon and browser must agree.** `ScheduleEvent.time` is built from `new Date(y, m, d, hour, minute)` using **local** time methods (`getHours`/`getMinutes` etc. in `computeNextCronRun`). The daemon's `node-cron` also fires in local time. If browser and daemon run in different TZs (e.g. a remote daemon in UTC, a browser in UTC+2), the UI's event times and the stamped `scheduledAt` will be offset and never match. Same-host setups are fine.
2. **Legacy conversations are keyed on `startedAt` rounded to the minute.** If the actual start drifted more than ~30 s from the scheduled minute, the legacy entry lands in the wrong bucket and the calendar will show the event as "missed" until `fetchLegacyConversationForEvent` (±90 s fuzzy) is triggered on click. For pre-stamp data this means the *marker* may be slightly inaccurate but the *click-through* still works.
3. **Conversations fetch honors visibility mode.** When the cabinet visibility is `"own"` and the agents/jobs on the calendar come from child cabinets (via a non-`"own"` overview setting elsewhere), conversation fetching may miss them. The fetcher mirrors the current `cabinetVisibilityMode`, so keep them in sync.
4. **Disabled events are not "missed".** `isEventMissed` explicitly returns `false` for `!event.enabled`. The dashed-hollow disabled style is preserved as a separate state.

## Verification (manual)

1. `npm run dev:all` to start Next + daemon.
2. Create a job with cron `* * * * *` on any agent and wait for two scheduler ticks.
3. Open the new conversation's `meta.json` — confirm `"scheduledAt": "2026-04-17Txx:xx:00.000Z"` matching the tick minute.
4. Click the pill on that slot in the calendar → Task panel opens with the right conversation.
5. Stop the daemon, let a tick be missed, reload the calendar → the past pill for that slot renders with the muted style + amber icon and the tooltip says `· did not run`. Click → edit dialog opens with the amber banner.
6. Flip a job's `enabled` to `false`. Its future pills/dots show the dashed-hollow disabled style — not the missed style.
7. Old conversations created before this change: click their calendar slots → task panel opens via the legacy ±90 s match.
8. `npm run lint` and `npx tsc --noEmit` clean on the modified files.

## Open follow-ups (not done in this session)

- **Dev-server verification couldn't be run** from my side during the session (Cabinet dev wasn't reachable on the expected port). The code paths are wired end-to-end, but live-browser testing is the user's next step.
- **Timezone drift** (caveat 1) would need an explicit `tz` argument passed into `cron.schedule` and `computeNextCronRun` to fully fix. Out of scope here.
- **Backfill `scheduledAt` for legacy conversations** — a one-shot script could re-derive the nearest slot from each legacy `startedAt` + the job's current cron. Would make the calendar show historic runs as linked instead of missed.
