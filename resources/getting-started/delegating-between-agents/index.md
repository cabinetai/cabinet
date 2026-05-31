---
title: Delegating Between Agents
created: '2026-04-21T00:00:00.000Z'
modified: '2026-04-21T00:00:00.000Z'
tags:
  - guide
  - agents
  - dispatch
order: 3
---
# Delegating Between Agents

A Cabinet agent isn't just a solo operator — it can propose work for teammates. When the CEO plans a launch, it can dispatch research to the analyst, draft copy to the editor, and schedule a weekly digest for growth, all in one turn. Every proposal is queued for one-click human approval before anything spawns, so you stay in control of the tree of work.

## Turning dispatch on

Open any agent (click it in the sidebar or visit `/agents/<slug>`). Next to the **Active** toggle in the header, flip the **Can dispatch** pill on.

- `Can dispatch` (filled) — the agent may propose `LAUNCH_TASK`, `SCHEDULE_JOB`, and `SCHEDULE_TASK` actions.
- `No dispatch` (dashed) — any dispatch the agent emits is flagged with a `persona_cannot_dispatch` warning and blocked.

Leads default to on; everyone else is opt-in. Flip it for the specific agents you want to act as orchestrators (typical: a CEO, a PM, a project lead).

## How an agent proposes work

Under the hood, agents wrap proposals in a fenced `cabinet` block at the end of their reply. Cabinet parses these without the agent needing any special tool plumbing. Two forms are supported:

**Inline — one action per line:**

```cabinet
LAUNCH_TASK: <agent-slug> | <title> | <one-line prompt>
SCHEDULE_TASK: <agent-slug> | <ISO datetime> | <title> | <prompt>
SCHEDULE_JOB: <agent-slug> | <name> | <cron> | <prompt>
```

**JSON — multi-line prompts or large fan-out (over ~5 actions):**

````markdown
```cabinet-actions
[
  { "type": "LAUNCH_TASK", "agent": "<agent-slug>", "title": "<title>", "prompt": "<prompt>", "effort": "high" },
  { "type": "LAUNCH_TASK", "agent": "<agent-slug>", "title": "<title>", "prompt": "<prompt>", "effort": "low" }
]
```
````

Cabinet dedupes identical proposals by fingerprint (type + agent + title + prompt + runtime), so if an agent accidentally repeats itself the same row doesn't show twice.

## The three action types

<table class="border-collapse w-full" style="min-width: 100px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Action</p></th><th colspan="1" rowspan="1"><p>Fires</p></th><th colspan="1" rowspan="1"><p>Use it for</p></th></tr><tr><td colspan="1" rowspan="1"><p><code>LAUNCH_TASK</code></p></td><td colspan="1" rowspan="1"><p>Immediately on approval</p></td><td colspan="1" rowspan="1"><p>One-shot delegation — "Editor, draft this now."</p></td></tr><tr><td colspan="1" rowspan="1"><p><code>SCHEDULE_TASK</code></p></td><td colspan="1" rowspan="1"><p>Once, at a specific ISO datetime</p></td><td colspan="1" rowspan="1"><p>Timed fire-and-forget — "Run this on Monday at 9am."</p></td></tr><tr><td colspan="1" rowspan="1"><p><code>SCHEDULE_JOB</code></p></td><td colspan="1" rowspan="1"><p>Recurring, on a cron expression</p></td><td colspan="1" rowspan="1"><p>Durable heartbeat — "Every Monday 09:00, summarize last week."</p></td></tr></tbody></table>

`SCHEDULE_TASK` that fires within 60 seconds is short-circuited to a plain `LAUNCH_TASK` — no point routing "in 30 seconds" through cron.

## Approving proposals

When the dispatching agent finishes its turn, a **pending actions panel** appears underneath the final reply (same view in `/agents/...`, `/tasks/...`, and the detail panel). For each row you get:

- A checkbox to include or exclude the row from the batch.
- The action type (pink for launch, blue for schedule-job, violet for schedule-task).
- The target agent, title, and prompt preview.
- Any **warnings**: `unknown_agent`, `persona_cannot_dispatch`, `self_dispatch`, `cycle_risk`, `depth_warning`, `inactive_target`, `budget_low`, `invalid_schedule`, `invalid_when`. Hard warnings block the row; soft warnings let you proceed if you accept the risk.
- Inline **model** and **effort** dropdowns (see below).

Use **Approve selected**, **Approve all** (skips hard-blocked rows), or **Reject all** to flush the queue. Approving spawns child conversations tagged with `parentTaskId`, `triggeringAgent`, and `spawnDepth` on their `meta.json`, so you can trace the dispatch tree back to the originator.

## Pinning model and effort per sub-task

By default, a child conversation picks its model and effort using this precedence:

1.  **Agent-authored override** — if the dispatching agent set `model` / `effort` on the action itself.
2.  **Parent inheritance** — if the parent conversation's provider matches the target's, its `model` and `effort` are copied onto the child. A Claude-Opus CEO dispatching to another Claude agent gets an Opus child without anyone asking.
3.  **Target persona defaults** — the teammate's own `adapterConfig` in `persona.md`.

Crossing providers (Claude parent → Codex child) drops the parent's model/effort automatically — no cross-provider leakage. The target persona's provider and adapter **always** win; only the reasoning level travels.

### Override at approval time

Each row in the pending actions panel has two small dropdowns:

- **model** — pick from the parent provider's catalog, or "Use default" to let inheritance run.
- **effort** — pick `minimal` / `low` / `medium` / `high` / `xhigh` / `max`, or "Use default".

Pick whatever you want before hitting Approve. Your override writes onto the spawned child's `adapterConfig` and is what shows up in the child's meta.

### Override in the action itself

Agents can pin runtime directly inside their proposal:

**Inline:** append `| model=<m>` and/or `| effort=<e>` as trailing segments. Unknown key=value segments are treated as prompt text, so it's safe to leave out either.

```cabinet
LAUNCH_TASK: <agent-slug> | <title> | <one-line prompt> | effort=high
LAUNCH_TASK: <agent-slug> | <title> | <one-line prompt> | model=<model> | effort=low
```

**JSON:** add `model` and/or `effort` keys.

```json
{ "type": "LAUNCH_TASK", "agent": "<agent-slug>", "title": "<title>", "prompt": "<prompt>", "effort": "high" }
```

The CEO's dispatch prompt already reminds every dispatch-enabled agent about these fields, so you can just say "use high effort for the editor" in your ask and the agent will encode it.

## A quick end-to-end test

Pick an agent with **Can dispatch** on, then send one of these prompts:

**Test A — fan-out with explicit efforts**

> Plan a product launch for next week. Don't edit any files yet — just propose the work. Dispatch a LAUNCH_TASK to the editor to draft the hero copy (effort=high) and a LAUNCH_TASK to the researcher to benchmark three competitors (effort=low). Summarize what you dispatched.

What to look for:
- Two rows in the pending panel, with effort chips pre-filled from the agent's proposal.
- Tweak the model/effort dropdowns on one row before approving.
- After approve, open each child — its `meta.adapterConfig` matches what you saw in the picker.

**Test B — parent inheritance**

> Dispatch a LAUNCH_TASK to one same-provider teammate with prompt "write a haiku about Cabinet". Do not set model or effort — inherit from me.

What to look for:
- The row shows `model: Default` / `effort: Default`.
- The spawned child's `adapterConfig.model` / `.effort` match the parent conversation's, because providers align.

**Test C — cross-provider isolation**

> Dispatch a LAUNCH_TASK to a teammate on a different provider than me. Same prompt.

What to look for:
- Child runs on the target's provider, adapter, and persona defaults — the parent's model does not leak across providers.

## Related

-   Agent framework: see the **Agent Dashboard** and **Scheduled Jobs** bullets in [[Getting Started]].
-   Persona settings: `.agents/<slug>/persona.md` — set `canDispatch`, default `provider`, `adapterType`, and `adapterConfig` there. The **Can dispatch** header pill writes back to that file.

---

Back to [[Getting Started]]
