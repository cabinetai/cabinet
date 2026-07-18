# CLAUDE.md

Cabinet is a self-hosted, AI-first knowledge base and "startup OS". Knowledge-base content lives as
markdown files on disk; AI agents (backed by local CLI providers) read and
write those files on schedules or on demand. Humans define intent, agents do the work

`docs/CLAUDE.md` holds a longer, feature-by-feature ruleset (skills, knowledge sources, registry,
editor). Read it when you touch those subsystems. This file covers the parts you need for almost any
task.

Three processes and a data directory. Understanding the split is most of the battle.

**1. Next.js app
**2. Daemon
**3. Electron shell 

## PROGRESS.md

After every change to this project, append an entry to `PROGRESS.md`:

```
[YYYY-MM-DD] Brief description of what changed.
```

This is mandatory and is the project's running changelog. Existing entries are detailed (what changed,
why, what was verified) — match that.
