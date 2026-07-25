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

## Change logs

For generic changes intended for upstream, append to `PROGRESS.md`.

For Good Place-only distribution, branding, release, or workspace-sync changes,
append to `FORK_PROGRESS.md`. Do not modify `PROGRESS.md` for fork-only work.
