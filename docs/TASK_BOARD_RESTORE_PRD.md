# Task Board V2 — Restoration PRD

> Backfill of legacy board features that were dropped during the attention-first rewrite. Addresses the audit of `tasks-board.tsx` (commit `8cb95b2^`) against the current v2 board. Scope is limited to regressions that hurt daily operation; polish nice-to-haves land in a follow-up.

Status: **Active** · Owner: hilash · Created 2026-04-20

## 1. Problem

The v2 board shipped without several direct-action surfaces from the legacy board. Users now have to:

- Drag cards across lanes to stop/restart/delete (no direct buttons).
- Open the detail panel just to see `errorKind` on a failed run.
- Navigate to the cabinet page to create a task (the "+ Tasks" sidebar pill is dead — its `cabinet:open-create-task` event has no listener).
- Edit jobs/heartbeats from the Agents/Jobs pages because the Schedule view is read-only.
- Watch the sidebar's Recent Tasks surface a freshly-created but idle conversation above an older one that's actively streaming output, because the API sorts by `startedAt`.

The result is more clicks, more context switches, and confusion when a heartbeat storm hits and there's no "Kill All" button.

## 2. Goals

1. Restore the four lost action surfaces (row actions, lane bulk actions, new-task dialog, schedule edit dialogs).
2. Fix Recent Tasks to mean **most recently updated**, not most recently created.
3. Keep the v2 gains intact — DnD, selection, Archive lane, heartbeat collapsing, People rail.

## 3. Non-Goals

- **No `HumanInboxDraft` revival.** The legacy dual model (drafts + conversations) added confusion. A separate task will delete the orphan backend (`src/lib/agents/human-inbox-drafts.ts`, `/api/agents/inbox-drafts`, `AgentListItem.draftCount` field).
- **No legacy board behind a flag.** One board.
- **No schedule calendar polish** (density slider, visible-hours dropdown, fullscreen) — follow-up.
- **No new design tokens** — reuse existing status colors, agent palette, lucide icon pack.

## 4. User stories

1. *As a PM running nightly heartbeats*, I want one-click Kill All on the Running lane so I can abort a runaway storm without 20 drag gestures.
2. *As a dev triaging a failed run*, I want a Restart button right on the card so I don't need to open the detail panel.
3. *As anyone*, I want "+ New task" in the sidebar or Inbox lane to open a composer in place — I shouldn't be thrown to the cabinet page.
4. *As a scheduler*, I want to click a job event in the calendar and edit its cron + prompt without leaving the Tasks view.
5. *As a user of Recent Tasks*, I want my in-progress streaming conversation pinned at the top, not the empty task I just created and never started.

## 5. Phases

### Phase R1 — Sidebar sort fix (low-risk, ship first)
- **What**: `src/components/sidebar/recent-tasks.tsx` fetches `limit=30` instead of 6, client-side sorts by `lastActivityAt ?? startedAt` DESC, slices to 6.
- **Why it's Phase 1**: two-line change, validates the sorting preference independent of any UI experiment, unblocks iteration on the sort semantics.
- **Acceptance**: a conversation with `startedAt = T-1h` and `lastActivityAt = T-30s` ranks above a conversation with `startedAt = T-5s` and no further activity.

### Phase R2 — Row actions on v2 cards + list rows
- **What**: hover-revealed action buttons per `task.status`:
  - `running` → Stop + Delete
  - `awaiting-input` → Stop + Restart + Delete
  - `failed` → Restart + Delete
  - `done` | `idle` → Restart + Delete
  - `archived` → Restore (drag or button) + Delete
- **Surface**: both `TaskCard` (kanban) and `ListView` rows.
- **Implementation**: reuse `board-actions.ts` helpers (`stopConversation`, `restartConversation`). Add `deleteConversation` wrapper hitting `DELETE /api/agents/conversations/[id]`. Buttons call `onRefresh` after.
- **Style**: matches legacy ConversationRow — small square icon buttons (Square, RotateCcw, Trash2), `p-1.5`, muted background, hover tones (destructive for Stop/Delete, primary for Restart).
- **Guard**: `stopPropagation()` on clicks so the action doesn't also open the detail panel.

### Phase R3 — Lane bulk actions
- **What**: Kanban lane headers get bulk buttons when the lane is non-empty:
  - Running: **Kill All** (Square icon) + **Restart All** (RotateCcw)
  - Needs attention: **Restart All Failed** (filters to `status === "failed"` only)
- **Implementation**: `Promise.all(lane.map(action))` then `onRefresh()`. Disabled while any item in the lane is mid-action.
- **Confirm UX**: for Kill All, pipe through the existing `ConfirmPopover` only if lane size ≥ 3. Otherwise no confirm (user likely knows what they're doing for 1–2 tasks).

### Phase R4 — Inline "New Task" dialog
- **What**: a dialog that replaces the current "route to cabinet" Inbox + behavior.
- **Contents** (smallest that works — no draft saving):
  - Title input (optional — auto-derived from first line of prompt)
  - Composer (`ComposerInput` with `useComposer`, supports `@mentions` of agents and pages)
  - Agent picker (reuse `TaskRuntimePicker` pattern — dropdown pill)
  - Runtime picker (provider + model + effort)
  - Primary: **Start now** (POST `createConversation`, route via `setSection({type:"task", taskId})`)
  - Secondary: **Cancel**
- **Triggers**:
  - Inbox lane header `+` button.
  - Empty-state "New task" card in Inbox lane.
  - `cabinet:open-create-task` window event — the sidebar "+ Tasks" pill dispatches this after routing to `section=tasks`. Wire a `useEffect` listener in `tasks-board-v2.tsx`.
  - (Stretch) `⌘K` / `⌘N` shortcut.
- **Location**: `src/components/tasks/board-v2/new-task-dialog.tsx`.
- **No drafts**: if the user cancels, nothing is saved. This intentionally diverges from legacy behavior.

### Phase R5 — Schedule view edit dialogs
- **What**: click a job event → job-edit dialog; click a heartbeat event → heartbeat-edit dialog.
- **Job dialog**: title + agent name, `SchedulePicker` (cron editor), prompt textarea, Enabled checkbox, Run Now + Save + Cancel. PUT `/api/agents/[slug]/jobs/[id]`.
- **Heartbeat dialog**: `SchedulePicker` + Active checkbox + Run Now + Save. PUT `/api/agents/personas/[slug]`.
- **Implementation**: copy from legacy `tasks-board.tsx:1389–1438` + `:1756–1838`. Extract into `schedule-job-dialog.tsx` + `schedule-heartbeat-dialog.tsx` under `board-v2/`.
- **Wire-up**: `ScheduleView` accepts `onJobClick` + `onHeartbeatClick` props; `tasks-board-v2.tsx` holds the dialog state.

## 6. Out of scope (documented for later)

- **Delete orphan drafts backend** — `/api/agents/inbox-drafts` + `src/lib/agents/human-inbox-drafts.ts` + `AgentListItem.draftCount`.
- **Schedule calendar polish**: density slider, visible-hours dropdown, fullscreen toggle.
- **errorKind badge on rows**: visible failure classification without opening detail panel.
- **Cabinet-aware board title**: bring back the large serif "{Cabinet} Task Board" header.
- **Header refresh button**: manual refetch trigger (currently auto + SSE only).

## 7. Acceptance criteria (cross-phase)

1. All row actions fire the same server endpoints the legacy board used (`/api/agents/conversations/[id]` with `action: "stop" | "restart"` + DELETE).
2. Sidebar Recent Tasks shows a running conversation at top even if another task started after it but had no turns yet.
3. "+" on the sidebar Tasks header opens the New Task dialog in the v2 board, not a dead event.
4. Clicking a scheduled job in the Schedule view opens a dialog where the user can edit cron + prompt and run the job immediately.
5. `tsc --noEmit` clean; no new lint errors on touched files.

## 8. Rollout

Ship each phase as a separate commit. No feature flag — v2 board is already the only board, and each phase adds-only (no breaking changes to existing UX). Commit order: R1 → R2 → R3 → R4 → R5.

## 9. Files touched (estimate)

**New files:**
- `src/components/tasks/board-v2/new-task-dialog.tsx`
- `src/components/tasks/board-v2/schedule-job-dialog.tsx`
- `src/components/tasks/board-v2/schedule-heartbeat-dialog.tsx`
- `src/components/tasks/board-v2/row-actions.tsx` (shared Stop/Restart/Delete button cluster)

**Modified:**
- `src/components/sidebar/recent-tasks.tsx` (R1)
- `src/components/tasks/board-v2/board-actions.ts` (+ `deleteConversation`)
- `src/components/tasks/board-v2/task-card.tsx` (R2)
- `src/components/tasks/board-v2/list-view.tsx` (R2)
- `src/components/tasks/board-v2/kanban-view.tsx` (R3 + R4)
- `src/components/tasks/board-v2/schedule-view.tsx` (R5)
- `src/components/tasks/board-v2/tasks-board-v2.tsx` (R4 + R5 wiring)
