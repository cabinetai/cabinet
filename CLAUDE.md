# CLAUDE.md

Cabinet is a self-hosted, AI-first knowledge base and "startup OS". Durable knowledge lives as
markdown files on disk; a local SQLite database stores structured runtime and index state. AI work
runs through either Cabinet's local CLI adapters or the server-only Hermes bridge, selected by
`CABINET_RUNTIME_MODE`. Humans define intent, agents do the work.

`docs/CLAUDE.md` holds a longer, feature-by-feature ruleset (skills, knowledge sources, registry,
editor). Read it when you touch those subsystems. This file covers the parts you need for almost any
task.

Three processes and a managed data directory. Understanding the split is most of the battle.

1. **Next.js app**: UI and API routes, including `/api/hermes/*`.
2. **Daemon**: structured adapters, PTY sessions, scheduler, event bus, and SQLite initialization.
3. **Electron shell**: optional desktop packaging and native integration.

In Hermes mode, Hermes is the agent execution source of truth. Cabinet still owns presentation,
human-authored knowledge, local comments/artifacts, diagnostics, and rebuildable projections. Do not
fall back silently from Hermes to a Cabinet provider.

## PROGRESS.md

After every change to this project, append an entry to `PROGRESS.md`:

```
[YYYY-MM-DD] Brief description of what changed.
```

This is mandatory and is the project's running changelog. Existing entries are detailed (what changed,
why, what was verified) — match that.
