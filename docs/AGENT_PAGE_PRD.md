# Agent Page — PRD

> **Status.** Living doc. Last revised 2026-04-19.
> **Owner.** Cabinet core team.
> **Supersedes.** `AGENT_PAGE_SPEC.md` (the descriptive spec of v1 is archived; this PRD defines v2 and beyond).
> **Companion docs.** [`TASKS_CONVERSATIONS_PRD.md`](./TASKS_CONVERSATIONS_PRD.md) (conversation contracts), [`CLAUDE.md`](./CLAUDE.md) (project rules), [`PROGRESS.md`](./PROGRESS.md).

---

## 0. How to read this

This PRD is prescriptive. Every section tagged **🎯 Contract** is a hard rule. Every section tagged **⚠️ Open** is a pending decision with the options listed. Implementation lives in `src/components/agents/agent-detail.tsx` (canonical file once v2 ships) and `src/app/agent-preview/[slug]/page.tsx` (standalone / embed surface).

---

## 1. Summary

The agent page is **the profile for one AI agent**. It is the single surface where a human:

1. Talks to the agent (primary).
2. Sees what the agent has been doing (conversations + files touched).
3. Controls when the agent runs on its own (heartbeat + jobs).
4. Configures who the agent is (identity, role, persona body).

v1 buried the primary action under four tabs, a stats strip of mostly-empty values, and a 260-px calendar that competed with the composer. v2 collapses the page into a single scrollable profile with a sticky composer, one color per agent used deliberately in three places, and rich per-conversation status.

This PRD defines v2 as the new canonical agent surface.

---

## 2. Goals / non-goals

### 2.1 Goals

- **Primary action visible above the fold.** Composer is unmistakably the main thing to do.
- **Every agent feels distinct.** Color + avatar do the personality work. One color, three appearances, zero elsewhere.
- **Every agent run is legible in one glance.** Conversation rows carry status, trigger, time, duration — not a card with one metric.
- **The knowledge base is reachable from the agent.** Files the agent has edited are a first-class surface, not buried in a conversation drill-down.
- **Agent state is explicit.** Three states exposed: `working` / `ready` / `paused`. No guessing whether a run is live.
- **Start/stop is a single toggle.** One button flips `persona.active` which drives whether heartbeat + jobs run.
- **Identity is inline-editable.** Display name, role, department, type, tags, workspace, persona body — all editable in-place.

### 2.2 Non-goals

- Not a team dashboard. Team-level rollups live in the agents overview / org chart.
- Not a chat thread viewer. Opening a conversation routes to the existing `TaskConversationPage`.
- Not a reporting surface. Per-agent metrics beyond "how many runs, how recent, how long" are out of scope.
- Not responsive to sub-480-px widths in v2. Cabinet's main viewport is desktop-first; mobile polish is a follow-up.
- Not a replacement for the agents overview. This is the per-agent profile only.

### 2.3 Success criteria

1. Composer is focused by default on mount; user can start a chat without any click beyond "landed on this page".
2. The agent's color is visible on first paint in three places (avatar, status chip, composer focus ring) and nowhere else.
3. A running agent shows a pulsing status chip + a row in Conversations with an amber-highlighted "Needs reply" when `awaitingInput === true`.
4. "Schedule" toggle swaps the page into a full calendar view filtered to this agent and restores profile mode cleanly on close.
5. A user can rename the agent, change department/type/tags/workspace, and edit the persona body without leaving the page.
6. Files edited across past conversations appear in "Recent work" and click through to the KB.

---

## 3. Audience

- **Builders** using Cabinet as a startup OS: they run agents daily, open the page to check work, queue new prompts, tweak schedules.
- **Operators** configuring new agents: they spend 5–10 minutes on the page per agent during onboarding, then visit rarely.
- **Observers** reading what the agent did while they were away: scan Conversations + Recent work, leave.

The design optimizes for **daily use by the first audience**. The other two should be served adequately without extra surface area.

---

## 4. Information architecture 🎯 Contract

A single scrolling column, 840 px max-width, centered on wide viewports. Sections in this exact order top-to-bottom:

```
1.  Top bar             ← Back · Schedule · Active/Stopped · ⋯
2.  Identity row        Avatar · Name · Status chip · Role · Department
3.  Composer            Sticky card · suggested prompts row
4.  Inbox               (only when non-empty) · up to 5 pending AgentTasks
5.  Conversations       Up to 7 rows · See all →
6.  Recent work         Up to 5 files · See all →
7.  Schedule            Heartbeat + jobs + Add routine · Manage →
8.  Details             Compact field grid (6 columns)
9.  Persona instructions  Tiptap editor · no section chrome
```

No tabs. No right rail. No embedded mini-calendar on Chat. When the user toggles **Schedule** in the top bar, sections 2–8 are replaced by a full `ScheduleCalendar` filtered to this agent with day/week/month picker; the top bar remains so they can toggle back.

Order is deliberate. **Inbox** (when non-empty) appears between **Composer** and **Conversations** because an assigned task is the most actionable unread item on the page. The section hides entirely when there are no pending tasks — no "Inbox (0)" clutter.

### 4.1 What does not appear on this page

- Hero gradient wash, stats strip, run/pause buttons in the identity row (moved to the top bar + composer).
- `HeartbeatRecord`-based history (superseded by conversations per PRD §1.1).
- Mini day calendar. (The **Schedule** button replaces this affordance.)
- `persona.emoji`. Identity uses `AgentIdentity` (avatar or Lucide icon + color).

---

## 5. Component spec 🎯 Contract

All components live in `src/components/agents/agent-detail.tsx`. File MUST remain under 2500 lines; when it grows larger, split into sibling files by component group.

### 5.1 Top bar

A thin horizontal bar under the optional demo banner / route chrome.

- **Back link** (left). Always present. Label: "Back to agents". Routes via `setSection({ type: "agents", cabinetPath })`.
- **Schedule toggle** (right). Tooltip: *"See past and upcoming runs for this agent"* when closed; *"Return to the profile view"* when open. Toggles the page's `viewMode` between `profile` and `schedule`.
- **Active/Stopped button** (right). Tinted in the agent color when active; dashed border + muted when stopped. Tooltip:
  - Active → *"Stop this agent — pauses heartbeat and all scheduled jobs. Manual chats still work."*
  - Stopped → *"Resume this agent — re-enables heartbeat and scheduled jobs."*
  - Calls `PUT /api/agents/personas/{slug}` with `{ action: "toggle" }`.
- **More menu** (⋯). Contains: Duplicate, Export persona, Delete. (Not all wired in v2; remaining items marked "Coming soon".)

### 5.2 Identity row

- `AgentIdentity` at 64 px (rounded square, agent-color-tinted).
- **Name** (`displayName || name`) at 24 px semibold -2% tracking.
- **Status chip** inline with the name. Three states:

| State | Condition | Icon/dot | Label | Animation |
|---|---|---|---|---|
| `working` | `persona.active && conversations.some(running)` | Dot in agent color | "Working" | Pulse (`animate-ping`) behind dot |
| `ready` | `persona.active && no running conversation` | Dot in agent color | "Ready" | Static |
| `paused` | `!persona.active` | Grey dot | "Paused" | Static |

- **Sub-line** below the name: `{role} · {department}` (department omitted if absent), 13 px muted.

### 5.3 Composer 🎯 Contract

- **Sticky** (stays pinned to the top of the scroll area when the user scrolls past it).
- Card with rounded-2xl border; focus ring = 3 px `color` at 12–18% alpha + 1 px solid border in the agent color.
- Textarea, 3-row default, autofocus on page mount, placeholder `Ask {name} something…`.
- Footer row of the card: left shows `{providerId} · ⌘↵ to send`; right shows **Send** button (primary).
- Suggested prompt chips underneath. Per-slug defaults:
  - `ceo` → *Set goals for the quarter · Review team status · Plan next initiative*
  - `editor` → *Review this page · Fix the grammar · Summarize this doc*
  - `cto|dev*` → *Review my PR · Fix the build · Plan the sprint*
  - `copy*` → *Write landing copy · Rewrite in brand voice · Draft an email*
  - `market*` → *Draft a blog post · Plan next campaign · Audit our content*
  - fallback → *Summarize recent work · Propose next steps · Draft an update*
  - Later: prompts are generated from persona body by an offline job. That is **post-v2**.
- Clicking a chip puts its text in the textarea (does not auto-send).
- Submit calls `POST /api/agents/conversations` per PRD §2.5 canonical pattern.
- After a successful submit, either:
  - `onOpenConversation` is provided → the parent routes to the task viewer (default inside the main shell).
  - No callback → refresh locally; the new conversation appears at the top of Conversations.

### 5.3b Inbox 🎯 Contract

**What it is.** The agent's queue of `AgentTask`s — tasks assigned by other agents or by the future `@CTO …` mention pattern inside a page. Source of truth: `GET /api/agents/tasks?agent={slug}`; data lives at `data/{cabinetPath}/.agents/{slug}/tasks/{id}.json` per `task-inbox.ts`.

**Visibility.** The section renders **only** when at least one task has `status ∈ {"pending","in_progress"}`. Empty inbox → section hidden. No header, no counter, no empty state.

**Row anatomy.**
- Status icon (16 px): `Inbox` icon (muted) for pending, spinner for in_progress.
- Title (13 px, bold).
- Priority chip (right of title): `P1`/`P2`/`P3`/`P4`/`P5`. Color bucket:
  - P1 → red (`bg-red-500/10 text-red-600 dark:text-red-400`)
  - P2 → amber
  - P3 → muted neutral
  - P4–P5 → fainter muted
- Description preview (11 px, single-line truncate) if present.
- Meta row: `from {fromName || fromAgent} · {relative createdAt}`; if a run is linked, append `· Running →` in primary.
- **Start** button (right, hidden until row-hover). Present only on `pending` rows without a `linkedConversationId`.

**Default behavior decision.** Tasks **wait in the inbox** until the user explicitly clicks Start. This is deliberate:

1. An agent-assigned task is often a suggestion the user should triage (priority, timing), not a command.
2. Auto-running on arrival makes mention-bombing weaponizable (a rogue agent or a careless `@CTO` in a shared doc would burn tokens).
3. Manual start preserves the same "humans define intent" invariant the rest of Cabinet relies on.

Future iteration (Phase C) may add a per-agent `autoRunInboxPriority` setting (e.g. "auto-run P1" or "auto-run from trusted agents only"). Not in v2.

**Start flow.**
1. POST `/api/agents/conversations` with `userMessage = "${task.title}\n\n${task.description}"`, `agentSlug = slug`, `cabinetPath = persona.cabinetPath`, `mentionedPaths = task.kbRefs`.
2. On 200, POST `/api/agents/tasks` with `action: "update"`, `status: "in_progress"`, `linkedConversationId = newConversation.id`, `startedAt: now` — per the existing endpoint contract.
3. Route via `onOpenConversation` (falls back to local refresh).

**Click-body flow.**
- If `task.linkedConversationId` is set → open that conversation.
- Else → same as Start flow.

**@-mention integration (future).** When a user types `@CTO …` inside a markdown page and the @-mention resolves to an agent slug, the client POSTs a new `AgentTask` with `fromAgent = "human"` (or the authoring agent), `toAgent = "cto"`, `title = <inline text>`, `description = <surrounding paragraph>`, `kbRefs = [currentPagePath]`, `priority = 3`. The Inbox section picks it up on next refresh. This keeps the mention-to-task bridge a thin client-side call — no new contracts. Scheduling decision: the task waits in the recipient's inbox by default (same as agent-to-agent handoffs today).

### 5.4 Conversations 🎯 Contract

- Section title + `{N} total` meta + `See all →` action (when > cap).
- **Max rows shown: 7.** (Rationale: covers a typical week of use without pushing sections below the fold.)
- Empty state: *"No conversations yet. Send a prompt above to start one."*
- Row anatomy (left-to-right):
  - Status icon (14 px) with color by `displayStatus()`.
  - Title (truncate). If `awaitingInput`, append inline amber "NEEDS REPLY" chip.
  - Trigger icon + label (MessageSquare/Chat, Briefcase/Job, Sparkles/Heartbeat).
  - Relative time (from `lastActivityAt || startedAt`), 14 ch right-aligned, tabular-nums.
  - Duration (tabular-nums, 8 ch). "—" while running.
  - `ArrowRight` (visible on hover).
- Row states:
  - `awaiting` → row background `amber-500/5`, hover `amber-500/10`, inline amber label.
  - `cancelled` or `closed` → row opacity 60%, hover restores to 100%.
  - Others → normal row.
- Click anywhere on the row → `onOpenConversation(meta)` → routes to `TaskConversationPage`.

### 5.5 `displayStatus(meta)` 🎯 Contract

```ts
type DisplayStatus = "running" | "awaiting" | "completed" | "failed" | "cancelled" | "closed";

function displayStatus(c: ConversationMeta): DisplayStatus {
  if (c.archivedAt) return "closed";
  if (c.status === "running") return c.awaitingInput ? "awaiting" : "running";
  if (c.status === "failed") return "failed";
  if (c.status === "cancelled") return "cancelled";
  // completed — auto-close after 7 days of inactivity
  const last = new Date(c.lastActivityAt || c.completedAt || c.startedAt).getTime();
  if (Date.now() - last > 7 * 24 * 60 * 60 * 1000) return "closed";
  return "completed";
}
```

Auto-close threshold is a UI concern only. It never writes `archivedAt`; the store stays unchanged. The threshold is tunable — if users complain, either lift it to 14 days or remove auto-close entirely (both are additive changes to this single function).

### 5.6 Recent work 🎯 Contract

- Source: `conversations.flatMap(c => c.artifactPaths).dedupe().sortByMostRecentTouch()`. Cumulative `artifactPaths` per PRD §3.1.
- **Max rows shown: 5.** (Rationale: files accumulate slower than conversations — 5 is enough for "what this agent has been writing lately". `See all →` when more.)
- Meta: `{N} file{s} touched`.
- Row anatomy:
  - File icon by extension (FileText / Image / FileSpreadsheet / FileCode / File).
  - Filename (baseline; truncate).
  - Directory path, mono, muted, next to filename.
  - Relative time, 14 ch right-aligned.
  - `ArrowRight` on hover.
- Click → opens the KB page via `setSection({ type: "page", ... })` (or hash fallback on standalone routes).

### 5.7 Schedule section

- Section title + `Manage →` action (switches to schedule view mode).
- **Heartbeat row** (always first): `⚡` icon (amber), "Heartbeat" label, `cronToHuman(heartbeat)` right, Play button to run now.
- **Job rows** (sorted by enabled-first then creation order):
  - `📋` Briefcase icon, job name, schedule human-readable on the right, on/off pill, Play button to run now.
  - On/off pill is a toggle — click flips `job.enabled` via `PUT /api/agents/{slug}/jobs/{id}` with `{action:"toggle"}`.
- **Add routine** (last row): dashed-ish styling, `Plus` icon. Opens an inline draft form OR routes to schedule view (v2 does the latter for simplicity; inline draft is a follow-up).

### 5.8 Details — field grid 🎯 Contract

- **No Edit toggle.** All fields are always rendered as inputs with transparent border + muted background. Focus upgrades them to solid border + background.
- 6-column grid. Layout:

| Row | Field | Span |
|---|---|---|
| 1 | Display name | 3 |
| 1 | Role | 3 |
| 2 | Department | 2 |
| 2 | Type | 2 |
| 2 | Workspace (mono) | 2 |
| 3 | Tags | 4 |
| 3 | Provider (mono, read-only) | 2 |

- Blur or Enter commits via `PUT /api/agents/personas/{slug}` with a single-field payload.
- Tags: comma-separated input → split/trim/filter server-side as `string[]`.
- Provider is read-only in v2. Provider switching lives in the composer's runtime picker (future), not here.
- Esc reverts draft to the last saved value and blurs.

### 5.9 Persona instructions — Tiptap editor 🎯 Contract

- No section wrapper. Only a divider + small header row with "PERSONA INSTRUCTIONS" label on the left and Save / Discard on the right.
- Same Tiptap setup Cabinet uses for KB pages: `editorExtensions` (slash commands, bubble menu, tables, task lists, code blocks, wiki-links, callouts, math).
- Content load: `markdownToHtml(persona.body)` → `editor.commands.setContent(html)`.
- Save: `htmlToMarkdown(editor.getHTML())` → `PUT /api/agents/personas/{slug}` with `{body: md}`.
- `dirty` state drives header affordances:
  - No changes → "Saved" (if we've just saved in this session) + disabled Save button.
  - Dirty → *"Unsaved changes"* italic label + Discard + enabled Save button.
- Keyboard: ⌘↵ saves; Esc reverts. Both scoped to the editor DOM only (do not steal global shortcuts).
- External updates (another client saves) re-load the editor **only when `dirty === false`**. While dirty, external updates are ignored until save/discard.

### 5.10 Schedule view mode

- Entered by toggling the Schedule button. Page max-width expands to full; profile sections are unmounted.
- Header row inside the view: **Day / Week / Month** tabs (left), `← Today →` anchor controls (right).
- Body: `ScheduleCalendar` filtered to this agent's `CabinetAgentSummary` + `CabinetJobSummary` + this agent's `ConversationMeta[]`.
- `onEventClick` for `sourceType === "manual"` → opens the underlying conversation. For `job`/`heartbeat` events → no-op in v2 (future: inline edit).
- `onDayClick` → switches `mode` to `day` + sets anchor to clicked date.

---

## 6. Visual system 🎯 Contract

### 6.1 Typography scale

| Token | Size / Weight / Tracking | Used for |
|---|---|---|
| `display` | 24 px / 600 / -0.02em | Agent name |
| `title` | 15 px / 500 | Section heading |
| `body` | 13 px / 400 | Row copy, input value |
| `meta` | 11 px / 500 / +0.04em uppercase | "X total", "See all →" |
| `micro` | 11 px / 400 / tabular-nums | Timestamps, durations |
| `label` | 10 px / 500 / +0.06em uppercase | Field labels |
| `mono` | 12 px / JetBrains | Cron strings, paths |

No other sizes. If you need one, raise a PR against this doc.

### 6.2 Color discipline

The agent color shows up in exactly **three** places:

1. `AgentIdentity` avatar — full-saturation icon on tinted background.
2. Status chip dot (non-paused) — full saturation, with pulse ring when `working`.
3. Composer focus — 1 px solid border + 3 px soft ring (agent color at ~12% alpha).

Everywhere else uses neutral theme tokens. Do NOT:

- ❌ Tint row hovers with agent color.
- ❌ Apply gradient washes on the page background.
- ❌ Use agent color on the Send button.
- ❌ Use agent color for status-chip labels other than `working`/`ready` (`paused` = muted).
- ❌ Use agent color on Schedule or Recent work rows.

This is the rule that prevents "every agent is the same beige soup."

### 6.3 Density

- Section vertical padding: 24 px.
- Row internal padding: 8 px × 10 px.
- Field grid gap: 12 px horizontal, 12 px vertical.
- Max content width: 840 px on profile; full on schedule.

### 6.4 Theming

Dark mode default. Light mode must work via theme tokens. No hardcoded hex — use `border`, `muted`, `accent`, `primary`, `card`, `background`, `foreground`, `muted-foreground`. Exceptions: amber for `awaiting`, green for `completed`/`ready`, red for `failed` — these are semantic colors and share the same hues in both themes.

---

## 7. Data contracts 🎯 Contract

### 7.1 Fetches on mount

Parallel:

| Endpoint | Purpose | Shape |
|---|---|---|
| `GET /api/agents/personas/{slug}` | Identity, heartbeat, role, persona body | `{ persona: AgentPersona }` |
| `GET /api/agents/conversations?agent={slug}&limit=50` | Unified manual+job+heartbeat stream | `{ conversations: ConversationMeta[] }` |
| `GET /api/agents/{slug}/jobs` | Scheduled jobs for this agent | `{ jobs: AgentJob[] }` |

### 7.2 Mutations

| Action | Endpoint | Body |
|---|---|---|
| Toggle active | `PUT /api/agents/personas/{slug}` | `{ action: "toggle" }` |
| Run heartbeat | `PUT /api/agents/personas/{slug}` | `{ action: "run" }` |
| Edit persona field | `PUT /api/agents/personas/{slug}` | `{ [field]: value }` |
| Edit persona body | `PUT /api/agents/personas/{slug}` | `{ body: markdown }` |
| Toggle job | `PUT /api/agents/{slug}/jobs/{id}` | `{ action: "toggle" }` |
| Run job | `PUT /api/agents/{slug}/jobs/{id}` | `{ action: "run" }` |
| Create conversation | `POST /api/agents/conversations` | `CreateConversationRequest` (per tasks PRD) |

Each mutation is followed by `refresh()` of the three fetches in §7.1.

### 7.3 Derived state

- `status: AgentStatus = computeStatus(persona, conversations)`
- `artifacts: Artifact[] = aggregateArtifacts(conversations)`
- `displayStatus: DisplayStatus = displayStatus(conversation)` per row

All pure, all memoized with the raw fetches as deps.

---

## 8. States to design / mock 🎯 Contract

Every surface MUST ship with mocks for:

- **Default / populated** — happy path.
- **Empty** — no conversations, no jobs, no artifacts, no persona body.
- **Loading** — initial fetch spinner.
- **Paused agent** — status chip = Paused; Active button shows "Stopped"; heartbeat row renders "Weekdays 9 AM" but marked muted.
- **Working agent** — pulsing chip; at least one running conversation row with spinner.
- **Awaiting input** — conversation row with amber background + "NEEDS REPLY" chip.
- **Failed / closed / cancelled** — variant icons + row treatments.
- **Persona editor** — empty body state, populated state, dirty state, saving state.
- **Schedule view** — day / week / month; empty (no events this range); full.

---

## 9. Interactions — the complete list

| Gesture | Result |
|---|---|
| Page mount | Composer autofocused; three fetches fire in parallel. |
| Type + ⌘↵ in composer | `createConversation`; page routes to task viewer (if `onOpenConversation` provided) or refreshes. |
| Click a suggested prompt chip | Fills composer with chip text. Does NOT submit. |
| Click a Conversations row | Opens that conversation. |
| Click a Recent work row | Opens the KB page. |
| Click `See all →` on Conversations | Routes to a filtered conversation list (future — agents overview tasks tab). |
| Click `See all →` on Recent work | (future — per-agent artifacts page.) |
| Click a Schedule row's on/off pill | Toggles job enabled. |
| Click a Schedule row's Play button | Runs that job/heartbeat once. |
| Click `Manage →` in Schedule | Switches to schedule view mode. |
| Click `+ Add routine` | Switches to schedule view mode. (Later: inline draft form.) |
| Click a Details field | Focuses that input. Blur or Enter saves. Esc reverts. |
| Type in persona editor | Marks dirty. |
| ⌘↵ inside persona editor | Saves. |
| Esc inside dirty persona editor | Reverts to last saved state. |
| Click Save in persona editor | Saves. |
| Click Discard in persona editor | Reverts. |
| Click **Active/Stopped** in top bar | Flips `persona.active`. |
| Click **Schedule** in top bar | Enters schedule view. |
| Click `← Back to agents` | `setSection({ type: "agents" })`. |

---

## 10. Rollout plan

### 10.1 Phase A — ship v2 as the main agent page (this PR)

- `app-shell.tsx` routes `section.type === "agent" && section.slug` to `AgentDetailV2`.
- Old `agent-detail.tsx` deleted.
- `/agent-preview/{slug}` kept as a standalone/embed entry (useful for snapshot review and future external linking).

### 10.2 Phase B — polish (next sprint)

- Dynamic suggested prompts from persona body (Haiku once per persona edit, cached).
- Inline Add Routine form in Schedule section.
- More menu: Duplicate / Export / Delete flows.
- Mobile (≥640 px) polish: identity row wraps; composer stops being sticky below 640 px.

### 10.3 Phase C — advanced (quarter-out)

- Live session embed: when a new chat starts, the composer card morphs into a `TaskConversationPage` compact variant in place, so the user can watch the run without leaving the page.
- Cross-agent artifact linking: clicking a Recent work row shows a breadcrumb ("Also edited by Steve, Editor") before opening.
- Persona coach: a "Suggest improvements" button that proposes persona-body edits based on recent failure/retry patterns.

---

## 11. Open questions ⚠️

1. **Auto-close threshold.** 7 days is a guess. Should we surface a user preference? (Default No; revisit if users complain.)
2. **Static provider field.** Editable provider per agent conflicts with per-conversation runtime picking (PRD §3.4). Until we resolve, provider stays read-only on this page. Changing an agent's default provider happens in the runtime picker on the next conversation.
3. **"See all →" destinations.** For Conversations we can route to the existing tasks board filtered by agent. For Recent work, we need a new per-agent artifacts route (`/#/cabinet/./agents/{slug}/artifacts` — TBD).
4. **Suggested prompts from persona.** Auto-generate vs curated-per-slug. v2 ships curated; Phase B moves to auto-generated with fallback to curated.
5. **Right rail reintroduction.** Some users may miss the persistent recent rail. If feedback says so, reintroduce it in schedule view only (not profile), since schedule is a separate mental mode.

---

## 12. Non-requirements

- No dashboard widgets ("agent KPIs"). That belongs in a team view.
- No embedded task viewer in profile mode. Click-through pattern is cleaner for v2.
- No markdown-preview split-pane. The Tiptap editor IS the preview.
- No drag-to-reorder jobs. Order is schedule-driven; manual reordering adds confusion.

---

## 13. Glossary

- **Agent.** A persona file at `data/{cabinetPath}/.agents/{slug}.md` with a Lucide-icon identity, a cron-driven heartbeat, optional scheduled jobs, and a markdown body that's injected as a system header into every conversation.
- **Conversation.** A unit of work per `TASKS_CONVERSATIONS_PRD.md` §1. Every chat, job run, and heartbeat produces one.
- **Artifact.** A KB page path the agent wrote to during a conversation, recorded in `meta.artifactPaths` via `ARTIFACT:` trailer lines.
- **Status (agent).** One of `working` / `ready` / `paused`. Derived, not stored.
- **Display status (conversation).** One of `running` / `awaiting` / `completed` / `failed` / `cancelled` / `closed`. Derived from `meta.status + awaitingInput + archivedAt + lastActivityAt`.
