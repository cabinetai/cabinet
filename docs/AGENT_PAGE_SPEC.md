# Agent Page — Design Spec (ARCHIVED — v1)

> ⚠️ **Superseded by [`AGENT_PAGE_PRD.md`](./AGENT_PAGE_PRD.md) (v2).** This file describes the v1 tabs + rail + calendar layout that shipped briefly on 2026-04-18 and was replaced by the chat-first profile the same day. Kept here for historical reference.

> The individual-agent page (CEO, Content Marketer, etc.). Route: `#/cabinet/./agents/{slug}`. Source: `src/components/agents/agent-detail.tsx`.

---

## 1. Overall layout

```
┌───────────────────────────────────────────────────────────────┐
│  HERO — color-wash gradient, agent identity + actions + stats │
├───────────────────────────────────────────────────────────────┤
│  PILL TABS — Chat · Definition · Routines · History           │
├───────────────────────────────────────────┬───────────────────┤
│                                           │                   │
│  MAIN CONTENT (tab-dependent)             │   RIGHT RAIL      │
│                                           │   280 px wide     │
│  · Chat tab: composer on top,             │   (persistent on  │
│    day-calendar below                     │   Chat/Definition │
│  · Definition tab: metadata + persona MD  │   /Routines;      │
│  · Routines tab: heartbeat + jobs         │   hidden on       │
│  · History tab: internal left sidebar +   │   History)        │
│    session viewer                         │                   │
│                                           │   · ROUTINES      │
│                                           │   · RECENT        │
└───────────────────────────────────────────┴───────────────────┘
```

- Full-height flex column; hero is fixed, tab nav is fixed, body fills the rest.
- Main content and right rail share the body row. Right rail is hidden on History tab (History has its own sidebar).

---

## 2. HERO

**Purpose:** Establish identity and expose the primary actions.

**Background.** Linear gradient 135° using the agent's own color:
- 0% → agent color at ~32% opacity
- 55% → agent color at ~8% opacity
- 100% → transparent

If the agent has no explicit color, fall back to a deterministic palette entry from `getAgentColor(slug)` — 8 muted pastels at ~18% alpha.

**Top nav row** (above the hero body, in same tinted background):
- Left: back chevron (`←`) → returns to agents overview.
- Right: refresh icon button.

**Main row** (horizontal, three areas):

1. **Avatar/Icon** (left, 80×80 px)
   - Rendered by `AgentIdentity size="lg"`. Shows in priority order:
     - Custom uploaded avatar image (rounded), OR
     - Preset illustrated avatar (SVG from `/public/agent-avatars/avatar-NN.svg`), OR
     - Lucide icon tinted with the agent color on a rounded-square background.
   - Soft glow: a blurred halo behind the avatar using the agent color.
   - Ring: 1 px ring in white/10 for edge definition.

2. **Name + role** (middle, flex-1)
   - Display name (`persona.displayName || persona.name`), size 28 px, semibold, -2% tracking, single-line truncate.
   - Color = tinted text color from the agent's color (readable on the tinted background).
   - Role + department on one line below: `Role · Department`. Subdued, 13 px.
   - Status row: 6 px dot (green = Active, muted = Paused) + label.

3. **Actions** (right, flush)
   - **Run** — primary button. Spinner while running; icon = ⚡ (`Zap`).
   - **Pause / Activate** — secondary outline button. Icon toggles between ⏸ and ▶ based on `persona.active`.

**Stats strip** (bottom of hero, flex-wrap, 11 px, muted color):

| Icon | Text |
|------|------|
| ⚡ Zap | `{N} run{s} this week` |
| ⏱ Clock | `{avg duration} avg` |
| 📈 Activity | `last seen {relative time}` |
| ✨ Sparkles | `{cron summary}` (e.g. "Weekdays at 9:00 AM") |

Stats are computed from the `HeartbeatRecord[]` history returned by `/api/agents/personas/{slug}`.

---

## 3. PILL TAB NAV

- Horizontal row, left-aligned, 12 px text, flat bottom underline = active.
- Tabs: **Chat** · **Definition** · **Routines** · **History**.
- Default tab = **Chat**.
- Active tab: foreground color + 2 px primary underline inset 8 px.
- Inactive: muted color, hover → foreground.
- Each tab has a 14 px icon before the label (MessageSquare, FileText, Briefcase, Clock).

---

## 4. CHAT TAB (default)

Two stacked regions inside main content:

### 4a. Chat pane (top, flex-1)

Two states:

**Empty state** (no live session):
- Centered column. Top-down:
  - Glowing medium avatar (56×56 px, same identity rendering, blurred color halo behind).
  - H3: `Chat with {displayName}` — 15 px, semibold.
  - Subtitle: "Send a prompt to start a live session. {name} will work in the background and keep this conversation as history." — 12 px, muted, max-width ~sm, centered.
  - Composer row, max 640 px wide:
    - Text input (auto-focus, Enter submits, Shift+Enter newline). Placeholder: "Ask {displayName} something…"
    - Send button (40 px tall, Send icon + label).

**Live session state** (user just hit Send):
- Thin header bar: spinner + truncated user message + `End session` button (right).
- Below: embedded `WebTerminal` that streams the live agent run.
- On end, returns to empty state and refreshes data.

### 4b. Day calendar (below, fixed 260 px tall)

- Embedded `ScheduleCalendar` in **day** mode, anchored to today, filtered to this agent's events only.
- Shows: scheduled heartbeat + scheduled jobs + past manual conversations, all on a single day column with an hour gutter (5 AM – 11 PM default).
- Pills are tinted with each event source's agent color.
- Red NOW line + dot on the current hour row.
- Interactions:
  - Click a past-manual pill → opens that conversation in the full task viewer.
  - Click a job/heartbeat pill → switches to the **Routines** tab.

---

## 5. DEFINITION TAB

Scrollable content area, 16 px padding.

- **Metadata grid** (2 columns, 12 px gap):
  - Department (editable card, click to edit inline)
  - Type (editable card)
  - Workspace (spans 2 columns; mono font; editable)
- **Tags** (if any): small primary-tinted pill chips.
- **Persona Instructions** section:
  - Header row: label "Persona Instructions" (10 px uppercase) + `Edit` button (or `Cancel` / `Save` when editing).
  - Content: rendered markdown in a muted card; click anywhere on the card to enter edit mode.
  - Edit mode: mono textarea, min 400 px tall, auto-saves on click-out/Escape.

---

## 6. ROUTINES TAB

Scrollable content area. Two stacked sections (Heartbeat first, Jobs second).

### 6a. Heartbeat section

- Label: "Heartbeat" (10 px uppercase).
- Card body:
  - Copy: "The default recurring schedule for {displayName}."
  - Current value: `{cronToHuman(heartbeat)}` + grey mono raw cron next to it.
  - `SchedulePicker` component (visual schedule picker with presets and custom cron).

### 6b. Scheduled Jobs section

- Label "Scheduled Jobs" + `+ Add Job` button (top-right).
- **Empty state**: 32 px briefcase icon + "No jobs configured" + helper line.
- **Add form** (appears when `+ Add Job` clicked): input for name, `SchedulePicker` for schedule, textarea for prompt, Cancel/Create buttons.
- **Job card** (one per job):
  - Header: on/off green dot (click toggles), job name, Run button (spinner while running), schedule pill showing raw cron + `cronToHuman` preview (click to expand edit), trash icon (delete).
  - If collapsed: 2-line truncated prompt preview below.
  - If expanded: `SchedulePicker` + prompt textarea + Cancel/Save.

All mutations hit `/api/agents/{slug}/jobs` and `/api/agents/{slug}/jobs/{jobId}`.

---

## 7. HISTORY TAB

Full-width, two-column, **does NOT** render the right rail (to avoid duplication).

### 7a. History sidebar (240 px, left)

- Header: "History" label + `+` to start a new session.
- Scroll list of `HeartbeatRecord[]`:
  - Live session (if any): primary-tinted row with spinner + user message + "running…".
  - Past sessions: status icon (green check / red X) + truncated summary (first line of markdown summary, max 50 chars) + date + duration.
  - Empty: "No sessions yet" placeholder.
- Selection highlights the row in accent color.

### 7b. Session viewer (right, flex-1)

Three states:

- **Live** — streaming `WebTerminal` with header showing the user message + spinner.
- **Past session** — header (status icon + status label + duration + timestamp), scrollable monospace transcript. Bottom bar has a "continue" composer that starts a new live session with the agent.
- **New session** (no selection, no live) — centered MessageSquare icon + "New Session" + subtitle + composer input + Send.

---

## 8. RIGHT RAIL — Routines + Recent

**Width:** 280 px (`min-w-[280px]`), left border, subtle muted background.

Visible on Chat / Definition / Routines tabs. Hidden on History.

### 8a. ROUTINES section (top)

- Header: "ROUTINES" label + `+` button (routes into the Routines tab to add a job).
- Max height ~50 vh, scrolls internally if it overflows.
- **Heartbeat row** (always present):
  - Yellow lightning icon (amber-500).
  - Title "Heartbeat" + `cronToHuman(heartbeat)` subtitle.
  - Play icon (right) — runs heartbeat immediately.
- **Job rows** (one per job):
  - Green/muted dot (on/off toggle — click toggles).
  - Job name + schedule human string (click body → Routines tab).
  - Play icon (right; spinner while running) — runs job immediately; appears on hover only.
- Empty state: "No jobs yet. Click + to add one." (11 px muted).

### 8b. RECENT section (below)

- Header: "RECENT" label + `Show all →` button (visible when there are more than 6 items; switches to History tab).
- Fetched from `/api/agents/conversations?agent={slug}&limit=50`. This includes manual chats, job runs, and heartbeat runs — all unified as `ConversationMeta`.
- Up to 6 most-recent cards, sorted by `lastActivityAt || startedAt` desc.
- Card anatomy:
  - Status badge (left, 14 px): running = spinner, completed = green check, failed = red X.
  - Title (truncated 44 chars).
  - Meta line (10 px): trigger icon + trigger label + relative time + duration (if finished).
- Trigger icons: MessageSquare (Chat), Briefcase (Job), Sparkles (Heartbeat).
- Click → opens the conversation in the full task viewer (`setSection({ type: "task", taskId, ... })`).
- Empty state: "No activity yet."

---

## 9. IDENTITY SYSTEM (cross-cutting)

Each agent has four customizable identity fields stored in persona frontmatter:

| Field | Default | Source |
|---|---|---|
| `displayName` | falls back to `name` | user-editable |
| `iconKey` | slug-based default (CEO→Crown, Editor→Pencil, etc.) | picked from 40 Lucide keys |
| `color` | hash-based pick from 8-slot `AGENT_PALETTE` | user hex |
| `avatar` | none | 12 preset SVGs OR custom upload |

Rendered via `<AgentIdentity>` at 4 sizes: xs (16), sm (20), md (28), lg (40 — hero uses an override to 80).

Priority when rendering:
1. If `avatar` is set → use that image.
2. Else → Lucide icon inside a rounded-square background tinted with the agent color.

---

## 10. DATA SOURCES

| UI surface | Endpoint | Notes |
|---|---|---|
| Hero name/role/stats, heartbeat | `GET /api/agents/personas/{slug}` | Returns `{ persona, history }` |
| Recent rail, Chat-calendar past runs | `GET /api/agents/conversations?agent={slug}&limit=50` | Unified manual + job + heartbeat |
| Routines rail + Routines tab jobs | `GET /api/agents/{slug}/jobs` | Job definitions |
| Job mutations | `POST/PUT/DELETE /api/agents/{slug}/jobs[/{id}]` | action = toggle / run |
| Heartbeat mutations | `PUT /api/agents/personas/{slug}` | action = run / toggle; body = {heartbeat} |
| Persona edits (dept, type, workspace, body, tags) | `PUT /api/agents/personas/{slug}` | Partial body |

All five fetches refresh together via a single `refresh()` callback.

---

## 11. TYPOGRAPHY, SPACING, COLOR (rules used today)

- Base font: Inter; code/monospaced: JetBrains Mono.
- Sizes: 10 px (uppercase labels), 11 px (meta), 12 px (body), 13 px (card copy), 15 px (section H3), 28 px (hero H1).
- Letter-spacing `-2%` on display H1, `+wider` on 10 px uppercase labels.
- Border radius: 6–8 px on cards; 12 px on hero glow shell; rounded-full on status dots.
- Surface hierarchy: page bg → `muted/5` (rails) → `muted/20` (inputs) → `card` (jobs/inside rails) → tinted gradients for agent identity.

---

## 12. KEY INTERACTIONS (summary)

| Gesture | Result |
|---|---|
| Click Run (hero) | Triggers a heartbeat-style run immediately |
| Click Pause/Activate (hero) | Flips `persona.active` |
| Click a tab | Switches main content; right rail persists except on History |
| Type + Send (Chat tab) | Opens WebTerminal live session inline |
| Click a calendar pill (past-manual) | Opens that conversation in full task viewer |
| Click a calendar pill (job/heartbeat) | Switches to Routines tab |
| Click a Recent card | Opens that conversation |
| Click Show all (Recent rail) | Switches to History tab |
| Toggle job dot (rail) | Enables/disables job |
| Run button on job row (rail) | Runs the job once |
| Click `+` in Routines rail | Jumps to Routines tab (ready to add a job) |
| Click heartbeat row body | (No action yet — future: edit heartbeat inline) |

---

## 13. STATES FOR THE DESIGNER TO MOCK

Every surface has at minimum these:
- **Default** — populated.
- **Empty** — no sessions, no jobs, no history, etc.
- **Loading** — initial fetch before persona arrives ("Loading...").
- **Running** — a conversation is live; status badges pulse / spinner visible.
- **Failed** — red X state in Recent + History.
- **Paused agent** — hero status dot muted, stats strip may say "never", activate button swapped in.

Per-tab:
- **Chat**: empty composer vs. live terminal vs. calendar empty vs. calendar full.
- **Definition**: view vs. edit (per field) vs. persona-body edit.
- **Routines**: no jobs vs. jobs list vs. add form vs. edit expanded.
- **History**: no sessions vs. list vs. viewing past vs. live session visible.

---

## 14. DO NOT IGNORE

- **Color discipline.** The agent color appears in: hero gradient (two stops), hero glow, hero name color, avatar tint, ScheduleCalendar pills for manual runs, ribbon events if ever reintroduced. Every other surface stays in the neutral system theme.
- **Right rail is the only persistent UI** beyond the hero and tab nav — keep it light; it's already scrollable in two sub-regions.
- **No emoji in system chrome** (Cabinet rule) — the hero uses a Lucide icon or user-uploaded avatar, not the `persona.emoji` field.
- **Dark mode default.** All values above assume dark mode; the same tokens should work in light mode via the theme layer.
