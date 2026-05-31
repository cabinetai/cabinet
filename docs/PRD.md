# Cabinet Agent System — MVP Design

## Vision

Cabinet is a Startup OS where you onboard an AI team that works for you. You answer 5 questions, a CEO agent appears, and it suggests teammates. Each agent has skills, recurring jobs, and a place in the knowledge base where their work shows up. You watch them work like watching a real team — through sessions and the KB itself.

**Design principle:** If it feels like enterprise workflow software, it's wrong. If it feels like watching a team work, it's right.

---

## 1. Information Architecture

### Sidebar Navigation

```
┌─────────────────────────┐
│ Cabinet                 │
│                         │
│ ── Team ──              │
│ ▾ Agents                │  ← collapsible
│   🤖 General            │  ← always present (headless Claude)
│   📝 Editor             │  ← sorted first
│   🎯 CEO          ●     │  ← green dot = active
│   📣 Mktg         ●     │
│                         │
│ ── Knowledge Base ──    │
│ ▸ (tree view)           │  ← existing tree
│                         │
│ [+ New Page]     [⚙]    │  ← settings gear icon
└─────────────────────────┘
```

- Clicking "Agents" header opens the agent list grid AND toggles the collapsible list
- Clicking an individual agent opens its detail view directly
- **General** agent is always present (not fetched from API) — headless Claude, no persona
- **Editor** agent is sorted to appear first among fetched agents
- Each agent shows emoji, name, and active status dot (green/gray)

### What changed from current
- **Mission Control** → removed (too complex)
- **Missions** → removed (agents work via jobs and sessions, not mission boards)
- **Activity** → removed (agent sessions serve as the activity log)
- **Chat** → removed for now (will revisit later)
- **Goals** → removed from agent detail (simplify)
- **Jobs** → moved under Agents (each agent owns its jobs)
- **Settings** → moved to gear icon at bottom of sidebar

---

## 2. Agents

### 2.1 Default Agents

Two agents are always present in the sidebar:

- **General** (`slug: "general"`) — Headless Claude with no persona, no heartbeat. Manual sessions only. For ad-hoc tasks that don't belong to a specific agent.
- **Editor** (`slug: "editor"`) — KB content editing, formatting, linking. Live terminal view for running sessions.

Additional agents (CEO, Content Marketer, etc.) are added from the library during onboarding or manually.

### 2.2 Agent List View

When you click "Agents" in the sidebar, you see a **card grid** of your active agents:

```
┌─────────────────────────────────────────────────────┐
│  Agents                          [+ Add from Library]│
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ 🎯 CEO   │  │ 📝 Editor│  │ 📣 Mktg  │          │
│  │ Lead     │  │ Specialist│ │ Specialist│          │
│  │ ●  Active│  │ ○  Idle  │  │ ● Running │          │
│  │ 3 jobs   │  │ 1 job    │  │ 5 jobs    │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│                                                      │
│  ┌──────────┐                                       │
│  │ + New    │  ← create custom agent                │
│  │ Agent    │                                       │
│  └──────────┘                                       │
└─────────────────────────────────────────────────────┘
```

Each card shows: name, emoji, type (lead/specialist), status indicator, job count.

### 2.3 Agent Detail View

Clicking an agent opens a **detail view with a vertical sidebar** for navigation. Each agent maps to a real directory on disk at `/data/.agents/{slug}/`.

```
┌─────────────────────────────────────────────────────┐
│  ← Back    🎯 CEO Agent             [▶ Run] [⏸ Pause]│
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ Defn     │  (content for selected section)          │
│ Skills   │                                          │
│ Jobs     │                                          │
│ Sessions │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

#### Section: Definition
- The agent's `persona.md` metadata and instructions
- Shows: department, type, heartbeat cron, budget, workspace, channels, tags
- Persona instructions rendered as readable text

#### Section: Skills
- List of skills attached to this agent (its persona's `skills:` field)
- Each skill: name, description, origin badge, trust level
- Skills are **shared** Anthropic-format SKILL.md bundles — agents reference them by key, they aren't per-agent files. Library lives in cabinet-root or cabinet-scoped `.agents/skills/` (see "Skill SKILL.md Format" below for the schema and `docs/SKILLS_PLAN.md` for the full origin model).
- The agent detail Skills section is multi-select; toggling persists to the persona's `skills:` array via PUT `/api/agents/personas/<slug>`.
- New agents created from a library template auto-promote `recommendedSkills` → `skills` so they have a "good first run" without manual setup.

#### Section: Jobs
- List of the agent's recurring jobs
- Each job shows: name, schedule (human-readable cron), last run status, next run time
- Click a job to expand: see prompt/instructions, run history, enable/disable toggle
- [+ Add Job] button to create a new job for this agent

#### Section: Sessions
- **ChatGPT/Claude Code-style session browser**
- Left panel: scrollable list of past sessions (status, summary, date, duration)
- Right panel: selected session output (monospace transcript)
- [+] button to start a new ad-hoc session with the agent
- New session view has a centered prompt input
- Each session maps to a heartbeat run or manual prompt execution

### 2.4 Agent Disk Layout

Each agent is a directory under `/data/.agents/`. This mirrors the Claude Code agents-on-disk pattern:

```
/data/.agents/{slug}/
  persona.md              ← YAML frontmatter + markdown instructions
  jobs/
    {job-id}.md           ← job definition with cron in frontmatter
  skills/
    {skill-name}.md       ← skill definition
  sessions/
    {session-id}.json     ← session metadata
  memory/
    context.md            ← agent's running context
    decisions.md          ← decisions log
    learnings.md          ← accumulated learnings
    stats.json            ← usage stats (heartbeatsUsed, lastHeartbeat)
```

### 2.5 Agent Library

Accessed via [+ Add from Library] button on the agents page:

```
┌─────────────────────────────────────────────────────┐
│  Agent Library                          [Search...]  │
│                                                      │
│  ── Leadership ──                                    │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │ 🎯 CEO               │  │ 📊 COO               │ │
│  │ Strategic leadership, │  │ Operations, process  │ │
│  │ goal setting, team    │  │ optimization, team   │ │
│  │ coordination          │  │ efficiency           │ │
│  │            [+ Add]    │  │            [+ Add]   │ │
│  └──────────────────────┘  └──────────────────────┘ │
│                                                      │
│  ── Marketing ──                                     │
│  ...                                                 │
└─────────────────────────────────────────────────────┘
```

Clicking [+ Add] copies the template to `/data/.agents/{slug}/` and opens the agent detail view.

---

## 3. Onboarding Flow

### Step 1: Welcome
```
┌─────────────────────────────────────────────────────┐
│           Welcome to Cabinet                         │
│                                                      │
│   Let's set up your AI team. I'll ask a few          │
│   questions to get the right agents working           │
│   for you.                                           │
│                              [Let's go →]            │
└─────────────────────────────────────────────────────┘
```

### Step 2: Five Questions
1. **What's your company/project name?** (text input)
2. **What do you do?** (text input)
3. **What are your top 3 goals right now?** (text input)
4. **How big is your team?** (just me / 2-5 / 5-20 / 20+)
5. **What's your most immediate priority?** (text input)

### Step 3: Team Suggestion
Agent selection based on answers. Check agents you want.

### Step 4: Magic Happens
- Selected agents are created from library templates
- Company context injected into each agent's persona.md
- KB workspace directories created for each agent's output area
- User lands on the Agent list view

---

## 4. Data Architecture

### Directory Structure

```
/data/
  .agents/
    .library/                    ← shipped templates (read-only feel)
      ceo/persona.md
      editor/persona.md
      content-marketer/persona.md
      ...
    .config/
      company.json               ← company context from onboarding
      onboarding-complete.json
    .history/
      {slug}.jsonl               ← heartbeat history logs
    .memory/
      {slug}/                    ← shared memory store
        context.md
        decisions.md
        learnings.md
        stats.json
    .messages/
      {slug}/                    ← inter-agent inbox
    {agent-slug}/                ← active agents (one dir per agent)
      persona.md                 ← agent definition
      jobs/
        {job-id}.md              ← job definition with cron
      skills/
        {skill-name}.md          ← skill definition
      sessions/
        {session-id}.json        ← session metadata

  # Agent output goes into regular KB:
  podcasts/                      ← Marketing agent's podcast workspace
  go-to-market/                  ← Marketing agent's GTM workspace
  ...
```

### Agent persona.md Format

```markdown
---
name: CEO
slug: ceo
emoji: 🎯
type: lead
department: leadership
workspace: /
schedule:
  heartbeat: "0 9 * * 1-5"
  timezone: America/New_York
budget:
  max_runs_per_month: 100
---

# CEO Agent

You are the CEO of {{company_name}}. Your role is to:

1. **Set strategic direction** — define and track company goals
2. **Coordinate the team** — assign tasks to agents
3. **Review progress** — check status, unblock agents
4. **Communicate** — post updates, respond to human input
```

### Job .md Format

```markdown
---
id: reddit-scout
name: Reddit Scout
schedule: "0 */6 * * *"
enabled: true
timeout: 300
output_path: /go-to-market/reddit/
skills:
  - web-search
on_complete:
  - git_commit
---

# Reddit Scout

Search subreddits for posts relevant to {{company_description}}...
```

### Skill SKILL.md Format

Cabinet adopts the Anthropic-compatible skill format used by Claude Code, Codex CLI, and Gemini CLI. Skills live as directories with `SKILL.md` + optional `references/`, `assets/`, `scripts/` subdirs.

```markdown
---
name: web-search                      # kebab-case key, must match dir name
description: >                        # ROUTING logic, not marketing copy
  Use when the agent needs to search the web for current information.
  Don't use for queries answerable from the KB or attached files.
allowed-tools: Bash(curl *)           # optional, comma-separated
trust-policy: prompt-once             # optional, Cabinet-specific:
                                      # auto-allow | prompt-once | always-prompt | refuse
---

# Web Search

Detailed instructions the agent reads when this skill is expanded…
```

**Origins** (resolution precedence — first match wins on key collision):
1. **Cabinet (scoped)** — `data/<cabinet>/.agents/skills/<key>/`
2. **Cabinet (root)** — `<repo>/.agents/skills/<key>/`
3. **Linked repo** — `<linked>/.agents/skills/<key>/` (read-only, via `.repo.yaml`)
4. **System** — `~/.claude/skills/<key>/` and `~/.agents/skills/<key>/` (host-managed; Claude Code already loads these)
5. **Legacy** — `~/.cabinet/skills/<key>/` (back-compat single-origin location)

**Trust gating** runs at mount time: bundle's auto-detected `trustLevel` (`markdown_only` | `assets` | `scripts_executables`) × verified-publisher signal × author `trust-policy` frontmatter. Operator approve/revoke decisions persist in `.cabinet/skills-trust.json`.

**Persona attachment** — agent persona frontmatter:
```yaml
skills:
  - web-search          # active attachments
  - shadcn
recommendedSkills:      # template defaults, auto-promoted to skills on agent creation
  - kb-page-author
```

**Composer `@`-mention** — typing `@skill-name` attaches the skill to the run **only**, not the persona. Use the agent detail Skills section for persistent attachment.

See `docs/SKILLS_PLAN.md` for the full design and `docs/CLAUDE.md` Rule 15 for runtime semantics.

---

## 5. Server Architecture

### Overview

Cabinet runs as **two processes** started with a single command:

```
npm run start
  ├── Next.js        (default port 4000) — UI + API routes
  └── Cabinet Daemon (default port 4100) — WebSocket + scheduler + agent execution
```
Port defaults are provided by `src/lib/runtime/runtime-config.ts` and auto-bumped by the dev wrappers when busy. Override with `CABINET_APP_PORT` / `CABINET_DAEMON_PORT`.

### Cabinet Daemon (`server/cabinet-daemon.ts`)

```
Cabinet Daemon
├── PTY module           ← server/pty/ — spawn + Claude lifecycle + ansi
├── Structured adapters  ← Claude stream-json, Codex, Cursor, OpenCode (subprocess)
├── Job Scheduler        ← node-cron, fires agent jobs on schedule
├── Event Bus            ← WebSocket channels for real-time updates (/api/daemon/events)
└── HTTP + WS endpoints  ← /session/*, /sessions, /reload-schedules, /trigger, /health
                           + WS /api/daemon/pty (terminal sessions)
```

**Agent Execution Flow:**
1. Job fires (cron) or manual trigger
2. Daemon generates a temporary CLAUDE.md for the run
3. Daemon spawns `claude -p "{job prompt}"` with the generated context
4. Output is captured, logged to SQLite, broadcast via WebSocket
5. Post-actions fire (git commit, etc.)

### SQLite Database (`/data/.cabinet.db`)

Used for **structured, high-volume, queryable data**. Content stays as markdown files.

```sql
-- What goes in SQLite
sessions        -- agent session metadata (id, agent, start, end, status, trigger)
job_runs        -- job execution history (id, job, agent, start, end, status, output)

-- What stays as markdown files
agent personas  -- /data/.agents/{slug}/persona.md
job definitions -- /data/.agents/{slug}/jobs/{id}.md
skill files     -- /data/.agents/{slug}/skills/{name}.md
KB content      -- /data/**/*.md
```

### WebSocket Event Channels

```typescript
"agent:status"    → { agent, status: "running"|"idle"|"error", sessionId }
"agent:output"    → { agent, sessionId, chunk }
"job:started"     → { agent, jobId, runId }
"job:completed"   → { agent, jobId, runId, status }
```

---

## 6. API Endpoints

```
# Agents
GET    /api/agents/personas          → list all agents
POST   /api/agents/personas          → create agent
GET    /api/agents/personas/[slug]   → get agent detail (persona, memory, history)
PUT    /api/agents/personas/[slug]   → update agent / run / toggle
DELETE /api/agents/personas/[slug]   → delete agent

# Agent Library
GET    /api/agents/library           → list available templates
POST   /api/agents/library/[slug]/add → instantiate agent from template

# Jobs (under agents)
GET    /api/agents/[slug]/jobs       → list agent's jobs
POST   /api/agents/[slug]/jobs       → create job for agent
PUT    /api/agents/[slug]/jobs/[id]  → update job
DELETE /api/agents/[slug]/jobs/[id]  → delete job
POST   /api/agents/[slug]/jobs/[id]/run → trigger job manually

# Onboarding
GET    /api/onboarding/status        → check if onboarding complete
POST   /api/onboarding/setup         → process onboarding answers, create team
```

---

## 7. Frontend Components

```
src/components/
  agents/
    agent-list.tsx              ← card grid of agents
    agent-detail.tsx            ← vertical sidebar nav (Definition, Skills, Jobs, Sessions)
    agent-dashboard.tsx         ← monitoring dashboard
    agent-session-view.tsx      ← GeneralAgentView for headless Claude
  onboarding/
    onboarding-wizard.tsx       ← 5-question flow
  settings/
    settings-page.tsx           ← system settings
  sidebar/
    sidebar.tsx                 ← collapsible agent list under Team
```

---

## 8. Implementation Phases

### Phase 1: Foundation (Agent Restructure) ✅
1. Create agent library templates in `/data/.agents/.library/`
2. Build new agent list view (card grid)
3. Build agent detail view with vertical sidebar (Definition, Skills, Jobs, Sessions)
4. Move jobs under agents (agent owns jobs)
5. Update sidebar navigation with collapsible agent list
6. Default agents: General (always present) + Editor (sorted first)

### Phase 2: Onboarding ✅
1. Build onboarding wizard (5 questions)
2. Build team suggestion view
3. Create setup API
4. Auto-detect first run and show onboarding

### Phase 3: Polish
1. Skill management UI
2. Job output → KB output path linking
3. Session transcript improvements
4. Agent creation/deletion from UI

---

## 9. Naming Glossary

| Term | Definition |
|------|-----------|
| **Agent** | A persistent AI persona with a role, skills, and jobs. Like a team member. Maps to `/data/.agents/{slug}/` on disk. |
| **General** | The default headless Claude agent — no persona, no heartbeat. For ad-hoc tasks. |
| **Job** | A recurring scheduled task that an agent runs. Has a cron schedule and prompt. Stored in agent's `jobs/` dir. |
| **Skill** | A reusable capability available to an agent. Stored in agent's `skills/` dir. |
| **Session** | A single Claude Code execution (one run of an agent). Browsable like ChatGPT history. |
| **Workspace** | The KB directory where an agent's output lives. |
| **Library** | Pre-built agent templates shipped with Cabinet. |
