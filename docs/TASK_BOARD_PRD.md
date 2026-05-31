# Task Board PRD — Attention-first Kanban of AI Conversations

**Status:** Draft v1 · 2026-04-19
**Owner:** hilash
**Supersedes:** current `tasks-board.tsx` generic kanban + `board.yaml` columns

---

## 1. Context

Cabinet agents work through heartbeats, scheduled jobs, and tasks. The current `/tasks` board is a generic backlog-style kanban that predates the richer agent-status model introduced in 2026-04. The sidebar and agent pages already speak the new language (pulsing-color dots, Needs Reply / Failed / Just Finished / Idle, Inbox), but the Task Board does not. It shows cards from `board.yaml` columns that no longer match how users think about agent work.

The board should be the one place where a user answers, in order:

1. **What needs me right now?**
2. **What is running?**
3. **What just finished — should I read it?**
4. **What can I forget?**

and should be the *control surface* for routing work between agents — not just a viewer.

## 2. Vision

> A living board where every card is an AI conversation. You drag a card to start it, drop it on another agent to hand it off, drop it in Archive to forget it. The board mirrors the real world: dots pulse while agents type, turn amber when they pause to ask, fade green when they finish.

**Principle.** The board is attention-first, not process-first. Columns reflect the *state of a run*, not a generic Backlog → Done workflow. Users define intent by dragging; agents carry it out.

## 3. In / Out of scope

### In scope (v1)
- Redesign of `/tasks` board layout (columns, card anatomy).
- Drag-and-drop with real action semantics (Start / Stop / Archive / Handoff).
- Right-side **People rail** for cross-agent handoff via drop.
- Slide-out task detail panel showing nested conversation runs.
- Live card transitions via SSE (`cabinet-daemon` event stream).
- Undo toast for non-destructive actions; inline confirm for destructive.

### Out of scope (v1)
- `@mention` → AgentTask bridge in markdown pages (tracked separately, noted in PROGRESS 2026-04-19).
- Board-level analytics (throughput, cycle time).
- Custom user-defined columns — the five status lanes are fixed.
- Mobile layout. Desktop ≥1024px only.
- Multi-select drag (dragging multiple cards at once).

## 4. Layout

```
┌──────────────────────────────────────────────────────────────────┬─────┐
│  Filters: [All agents ▾] [All providers ▾] [Muted: off] [Search] │  R  │
├──────────┬───────────┬──────────┬──────────────┬────────────────┤  A  │
│  INBOX   │ NEEDS     │ RUNNING  │ JUST         │ ARCHIVE  (▾)   │  I  │
│          │ REPLY     │   •••    │ FINISHED     │ (collapsed)    │  L  │
├──────────┼───────────┼──────────┼──────────────┼────────────────┤     │
│ [card]   │ [card] •  │ [card] • │ [card] •     │                │ 48→ │
│ [card]   │ [card] •  │ [card] • │              │                │ 220 │
│ [card]   │           │ [card] • │              │                │ on  │
│          │           │          │              │                │ hov │
└──────────┴───────────┴──────────┴──────────────┴────────────────┴─────┘
```

- **Five fixed columns.** No renaming, no adding.
- **Archive** collapses by default to a single narrow rail; click the header to expand.
- **Filter bar** above columns, sticky to the viewport top.
- **People rail** is a 48px vertical strip on the right with agent avatars. Hover or keyboard-focus expands it to 220px with names + status chips.
- **Detail panel** slides in from the right over the People rail at 440px, with backdrop click-out and `Esc` to close.

## 5. Card anatomy

One card per **task**, not per conversation run.

```
┌──────────────────────────────────────────────┐
│ ●  CTO      ← agent pill (color + icon + name)│
│                                               │
│ Review the auth middleware rewrite            │  ← title, 2-line clamp
│                                               │
│ ⏱ 14m ago · 3 runs · ⟳ retry                  │  ← meta row (hover-only)
└──────────────────────────────────────────────┘
```

- **Status dot** on the left of the agent pill. Color/animation per the existing legend (running pulse in agent color; amber ask; red fail; emerald <1h done; grey idle).
- **Agent pill**: colored background at 20% opacity, agent's Lucide icon, agent name. Single pill, not avatar — denser and color-forward.
- **Title**: task title from `AgentTask`. 2-line clamp, ellipsis after.
- **Meta row**: visible on hover or keyboard-focus only. Last activity (relative), number of conversation runs, and a contextual action (Retry if Failed, Resume if Needs Reply).
- **Density**: compact (≈84px tall). No last-turn snippet in v1 — adds noise and costs render budget for live pulsing dots.

## 6. Columns — definitions and entry rules

| Column | When a card appears here | Default sort |
|---|---|---|
| **Inbox** | Task exists, no conversation started yet, or handed off from another agent awaiting Start. | Newest handoff first |
| **Needs Reply** | Latest run emitted `<ask_user>` **or** latest run failed (red dot). | Longest waiting first |
| **Running** | A conversation run for this task is live right now. | Most recently started first |
| **Just Finished** | Latest run completed within the last 1h, not yet acknowledged. | Most recently finished first |
| **Archive** | Latest run finished >1h ago, **or** user explicitly archived. | Most recently archived first |

**Failed + Needs Reply share a column** to keep "things waiting for me" in one place. Cards in this column carry either a red dot + Retry button (failed) or amber dot + Resume button (ask_user).

**"Just Finished" is time-boxed.** After 1h with no interaction the card auto-falls into Archive. A `setInterval` in the board re-evaluates every 60s (same pattern as the sidebar dots, see `recent-tasks.tsx`).

## 7. Drag-and-drop contract

### 7.1 Drop matrix (card between columns)

| From → To         | Inbox     | Needs Reply | Running  | Just Finished | Archive       |
|-------------------|-----------|-------------|----------|---------------|---------------|
| **Inbox**         | reorder   | —           | **Start**| —             | archive       |
| **Needs Reply**   | —         | reorder     | **Resume** / **Retry** | — | archive |
| **Running**       | —         | —           | reorder  | **Stop + mark done** (confirm) | **Stop + archive** (confirm) |
| **Just Finished** | —         | —           | **New turn**| reorder    | archive       |
| **Archive**       | **Restore** | —         | **Restart** (confirm) | —     | reorder       |

- `—` = drop rejected, column edge shows red ring, card snaps back.
- **Reorder** = within-column drag changes card order, persisted to task meta.
- **(confirm)** = inline confirm popover anchored to the drop site. Dismissing cancels the drop.
- All other drops fire instantly and produce a 5s **Undo** toast in the bottom-left.

### 7.2 Drop on People rail

- **Any column → People rail avatar**: reassign the task to that agent. Card lands in the recipient's **Inbox** with a handoff note; does **not** auto-start (enforces "humans define intent" from the getting-started doc).
- **Paused agents accept drops normally** — just a small "paused" badge on the avatar, no warning. Pausing disables cron, not manual work.
- Dropping on your *own* agent's avatar is a no-op (card snaps back, no toast).

### 7.3 Drag affordances

- Lift: 3px shadow, 2deg rotate, cursor becomes grabbing.
- Valid drop targets highlight with the agent's color at 30% opacity.
- Invalid targets show a thin red ring.
- During drag, the People rail auto-expands to 220px so labels are readable, regardless of hover state.

### 7.4 Keyboard DnD (a11y, v1)

- `Tab` to focus a card. Focus ring = agent color.
- `Space` to pick up. Card gets a "grabbed" shadow. Arrow keys move focus between columns and cards. `Space` again to drop.
- `Shift+Arrow` in pickup mode cycles through People rail avatars.
- `Esc` cancels pickup.
- All actions also available in a card-level `⋯` menu for non-mouse / non-keyboard paths.

## 8. Detail panel

- Triggered by click, `Enter` on focused card, or double-click.
- Slides in from the right at 440px; board stays visible and interactive behind it.
- Contents:
  - Header: title + agent pill + status dot + `Archive` / `Stop` / `Reassign` icon buttons.
  - **Nested conversation runs** as a vertical list: newest at top, each with its own dot, relative time, turn count, and a `→` to open the full conversation page.
  - Composer inline (reuses `ComposerInput`) to send a new turn to the latest run, or start a new run if the task is idle.
- `Esc` closes. Clicking another card swaps the panel contents without animating close/open.

## 9. Live updates

- Board subscribes to `cabinet-daemon` SSE for `conversation.*` and `task.*` events.
- On state change:
  - If the card is not hovered or keyboard-focused, animate it into its new column (150ms ease).
  - If the card **is** being interacted with, queue the transition; flush when focus leaves the card (prevents yanking the card out from under the user).
- Optimistic UI for user-driven drops: move immediately, reconcile with server response. On server error, snap back and toast the error.

## 10. Data model

### 10.1 Sources of truth

| Field shown on card | Source |
|---|---|
| Agent color, icon, name | `CabinetOverview.agents[].persona` (`color`, `icon`, `displayName`) |
| Task title, description, priority | `AgentTask` (`/api/agents/tasks`) |
| Status dot | Derived: latest `ConversationMeta.status` + `lastActivityAt` (same rule as `recent-tasks.tsx`) |
| Column placement | Derived from latest conversation status + `archivedAt` field on the task |
| Conversation runs (panel) | `AgentTask.conversationIds[]` → fetched batch via existing conversation endpoints |

### 10.2 New fields on `AgentTask`
- `archivedAt: string | null` — non-null pins the card to Archive regardless of conversation state.
- `boardOrder: number` — within-column sort index, used for reorder drops.

Both are additive, no migration of existing task files needed; missing values default to `null` / `0`.

### 10.3 `board.yaml` deprecation

Legacy `board.yaml` columns are ignored by the new board. We keep reading the file so existing task metadata (priority, description) still loads, but the `column` field is no longer authoritative — state-derived columns replace it. Migration path: one-time script that, for each task in a legacy column named `"Done"` or `"Archive"`, stamps `archivedAt = file mtime` so they land in Archive on first render.

## 11. API changes

- `POST /api/agents/tasks` action set extended:
  - `action: "archive"` → sets `archivedAt: now()`.
  - `action: "restore"` → clears `archivedAt`.
  - `action: "reorder"` → `{ taskId, boardOrder }`.
  - `action: "reassign"` → `{ taskId, toAgent }`. Server writes a handoff note, updates `toAgent`, clears `linkedConversationId`, leaves `status: "pending"` so it sits in the recipient's Inbox.
- `POST /api/agents/conversations` already supports starting from a task — no change.
- New SSE event: `task.reordered` so other clients reconcile order.

## 12. Rollout phases

- **Phase 1 — Read-only redesign.** New columns, new cards, new panel, no DnD. Ships behind a `?board=v2` query flag.
- **Phase 2 — DnD with undo toast.** Start, Archive, Reorder, Restore. No confirm popovers yet — destructive drops disabled.
- **Phase 3 — Destructive drops + confirm popovers.** Stop live run, Stop-and-archive, Restart.
- **Phase 4 — People rail + reassign.** Rail render, drop-on-avatar handoff, badge for paused agents.
- **Phase 5 — Keyboard DnD + a11y polish.** Focus management, space-to-pick, screen-reader live region.
- **Phase 6 — Flip default, remove old board.** Delete old `board.yaml`-driven code path.

Each phase ships on `main`, gated by the flag; no feature branch kept open across phases.

## 13. Success criteria

- A user lands on `/tasks` after a few hours away and can answer "what needs me?" within one screen, no scroll.
- Mean time to start a handed-off task drops — target p50 < 5s from page open to Start (was ~15s via the old board).
- Zero accidental live-run kills in the first month of Phase 3 — inline confirm popover catches them.
- No layout shift > 0.1 CLS from incoming SSE events.

## 14. Open questions (deferred, not blocking v1)

1. **Card density toggle** — should there be a Compact / Comfortable toggle saved per user? Current v1 ships Compact only.
2. **Heartbeat noise** — heartbeats generate many short conversation runs. Should repeat heartbeat tasks collapse into a single "recurring" card with a run-count badge? Lean yes, but not v1.
3. **Filters** — which filter chips above the columns? Cabinet, agent, provider are obvious. Priority (P1–P5) also useful. Start with Cabinet + Agent.
4. **Muted tasks** — should users be able to "mute" a task so it never appears in Just Finished (only in Archive)? Useful for noisy automation.
5. **Batch actions** — no multi-select in v1. Revisit after Phase 6 if users ask.

## 15. References

- Getting Started doc → `data/getting-started/index.md` §Agents & Tasks at a Glance (legend, inbox semantics, color discipline rule).
- Existing PRD → `AGENT_PAGE_PRD.md` §5.3b (Inbox wait-don't-execute decision).
- Sidebar dot implementation → `src/components/sidebar/recent-tasks.tsx` (reuse `tintFromHex`, `getAgentColor`, just-finished 1h rule).
- Current board (to be replaced) → `src/components/tasks/tasks-board.tsx`.
- Task detail reference → `src/components/tasks/task-detail-panel.tsx`.
