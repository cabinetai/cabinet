---
title: Skills
created: '2026-04-28T00:00:00.000Z'
modified: '2026-04-28T00:00:00.000Z'
tags:
  - guide
  - skills
  - security
order: 5
---
# Skills in Cabinet

Skills are reusable bundles of instructions (and optionally scripts) that an agent can pull in for a task. Each skill is a directory containing a `SKILL.md` (frontmatter + body) plus any helper assets it needs. Cabinet hosts skills locally, attaches them to personas, and mounts them into the agent's working directory at run time.

This page covers what skills can do, where they live, and — most importantly — the security model you're opting into when you install one.

## What a skill is

Each skill is a folder, e.g.:

```
.agents/skills/imagegen/
├── SKILL.md          # frontmatter (name, description, allowed-tools) + body
├── scripts/          # optional helper scripts the agent may execute
└── assets/           # optional reference files (logos, schemas, etc.)
```

The `SKILL.md` is the part the model reads. Frontmatter declares `name`, `description`, and (optionally) `allowed-tools`. The body is the playbook the model follows when the skill applies to a task.

## Where skills live

Cabinet looks across five origins, in this precedence order on key collision:

1. **cabinet-scoped** — `data/<cabinet>/.agents/skills/` (only visible inside that cabinet)
2. **cabinet-root** — `.agents/skills/` at the project root (the canonical place for skills you install via Settings → Skills)
3. **linked-repo** — skills found in repos linked through `.repo.yaml` (TODO; not yet wired)
4. **system** — `~/.claude/skills/` and `~/.agents/skills/` (host-wide, shared across CLIs); also Claude Code plugin marketplaces under `~/.claude/plugins/marketplaces/`
5. **legacy-home** — `~/.cabinet/skills/` (kept for back-compat)

Cabinet-managed origins (1 and 2) are editable from the UI; the rest are read-only.

## Installing a skill

Settings → Skills → **Add skill** accepts:

- `github:owner/repo` — repo IS the skill
- `github:owner/repo/<skill>` or `github:owner/repo@<skill>` — skill is a subdirectory or named entry in the repo
- `github:owner/repo#<ref>` — pin to a branch / tag / commit SHA
- `https://github.com/owner/repo[/tree/<ref>[/path]]` — paste a GitHub URL directly
- `https://skills.sh/owner/repo[/skill]` — pasted from skills.sh
- `gitlab:owner/repo[/<skill>][#<ref>]`
- `local:/absolute/path` — copy from a local directory (rare; useful when authoring)
- `npx skills add <url> --skill <name>` — paste the install command from skills.sh as-is

The provenance gets written to `skills-lock.json` (gitignored, per-machine) so you can re-fetch or audit any installed bundle. Per-skill SHA-256 hashes are recorded so drift detection catches manual edits.

## Attaching skills to an agent

Each persona has a `skills:` list in its frontmatter. Settings → Skills lets you attach/detach skills per agent, and the agent detail page shows a "Suggested for this role" panel for personas that ship `recommendedSkills` in their template.

You can also `@`-mention a skill in any composer to attach it to the **current run only** (not persisted to the persona). The mention chip appears with a violet sparkles icon, and the skill is mounted alongside the persona's persisted skills for that conversation.

## How skills reach the model

When a run starts, Cabinet:

1. Resolves each desired skill key against the catalog (via `resolveDesiredSkills`).
2. Builds a **skill index** — a name + description block — and injects it into the agent's prompt so the model knows what's available without us preloading bodies.
3. Materializes a per-session plugin tmpdir at `${TMPDIR}/cabinet-skills/<sessionId>/` containing `.claude-plugin/plugin.json` plus `skills/<key>/` symlinks to each bundle.
4. Spawns the CLI with `--plugin-dir <tmpdir> --add-dir <tmpdir>`. Plugin-dir registers the skills as discoverable `/skill-name` commands; add-dir grants file-read access to bundle assets.
5. On session exit, removes the tmpdir.

For continuation turns on **structured adapters** (e.g. Claude `claude-local`), each turn is a fresh spawn, so the skill mount is rebuilt per turn. New `@`-mentions made mid-conversation are picked up live.

For **PTY/terminal-mode** continuations, the spawn is long-lived and can't dynamically register new skills. Mid-session `@`-mentions still reach the model via prompt text (the skill index is rewritten each turn), but they aren't discoverable as live slash commands until the next fresh task. The composer surfaces this as a yellow "Heads up" banner when it applies.

## Security model — read this before installing third-party skills

Cabinet's threat model is **local-only** — the daemon binds to `127.0.0.1`, no auth, single user. Within that boundary, the choices below are deliberate:

### 1. No runtime trust gate

Once you install a skill and attach it to a persona, every run mounts it. There is no per-turn allow/block prompt. The trust signals (origin, `audits passed` pill, file inventory, `allowed-tools` declaration) live in the install picker — once installed and attached, the skill is treated as authorized by your prior act.

If you want to revoke a skill, detach it from the persona or delete the bundle from `.agents/skills/`.

### 2. Claude runs with `--dangerously-skip-permissions`

The `claude-local` adapter passes `--dangerously-skip-permissions` so Cabinet can stream output without interactive permission prompts. This means **any skill bundle's instructions can tell the agent to run shell commands, and Claude will execute them without asking**. Don't install a skill you wouldn't be willing to run a shell script from.

### 3. Skill bundles get your `.cabinet.env`

Spawned CLIs (and any scripts a skill invokes) inherit Cabinet's process env, which includes every key in `.cabinet.env` — `OPENAI_API_KEY`, `GITHUB_TOKEN`, etc. A hostile skill can read them. The file is `0600`-permissioned and gitignored, but the in-process exposure is real.

This is intentional (it's how skills like `imagegen` get their key without per-run plumbing), but worth knowing. If you need to scope a key to one skill only, set it in your shell env instead and Cabinet won't write it to disk.

### 4. `audits passed` pills are signals, not gates

The catalog browser fetches audit summaries from `add-skill.vercel.sh/audit` (Alibaba Threat Hunter, Socket, Snyk, zeroleaks). A high pass count is a useful signal but not a blocker — you can install a skill with zero passing audits if you choose. Unavailable audits (network failure, skill not in the audit DB) show as "audits unavailable", not as a failure.

### 5. Symlinks in skill bundles are preserved verbatim

When importing or bundling a skill, Cabinet uses `fs.cp(..., { verbatimSymlinks: true })` — symlinks are copied as-is rather than followed. This prevents a hostile bundle from exfiltrating files via a symlink pointing outside its own directory.

### 6. Path traversal protections

- Skill keys must be kebab-case (`^[a-z0-9][a-z0-9-]*$`, ≤64 chars). Anything containing `/`, `..`, or whitespace is rejected.
- `cabinet:<path>` scopes resolve through `resolveContentPath`, which enforces the `DATA_DIR` boundary.
- Plugin manifests (`.claude-plugin/plugin.json`) declaring relative paths that escape the cloned repo root are rejected during import.
- `git clone --branch <ref>` rejects any ref that starts with `-` or contains characters outside `[A-Za-z0-9._/-]`.

### 7. The `local:` source is unrestricted

`local:/absolute/path` lets you copy from anywhere on disk into `.agents/skills/`. This is fine for a local-only daemon (you can already read those files), but it does mean a malicious frontend bug could exfiltrate arbitrary directories into the skills root. Use it for skills you're authoring, not for general installs.

## Authoring your own skill

Create a directory under `.agents/skills/<your-skill-key>/` and drop in a `SKILL.md`:

```markdown
---
name: my-skill
description: One-sentence description used in the skill index injected into the agent's prompt.
allowed-tools: bash, read, write
---

# My Skill

Body markdown — the playbook the model follows when this skill applies.

## When to use

- Concrete trigger 1
- Concrete trigger 2

## How to apply

Steps the agent should follow…
```

After creating it, refresh Settings → Skills; it'll appear in the Cabinet-root section. Attach it to an agent and it'll be available on the next run.

To share it, push the directory to a git repo and others can install via `github:owner/repo/<your-skill-key>`.

## Backups

Settings → Updates → **Create backup** has two checkboxes that affect skills:

- **Skills (`.agents/skills/`)** — include installed skill bundles in the backup. Default off because they're per-machine state.
- **API keys (`.cabinet.env`)** — include the env file. Default off because the backup is plaintext.

Both default to off so a routine backup never accidentally captures secrets or per-machine state. Tick them deliberately when you want a portable snapshot.

## Troubleshooting

- **Skill installed but agent doesn't use it** — check the agent's `skills:` list in the persona file. Installation only puts the bundle on disk; attachment is a separate step.
- **`--plugin-dir` errors at spawn** — the tmpdir layout is regenerated each run. If you see stale errors, restart the daemon to clear `${TMPDIR}/cabinet-skills/`.
- **Mid-conversation mention doesn't seem to register on a terminal task** — known caveat, see "How skills reach the model" above. Send the same skill mention from a fresh task and it'll mount cleanly.
- **`skills-lock.json` shows drift** — Cabinet records per-file SHA-256 at install. Manually editing a bundle reports as `modified`; re-installing or running `npm run skills:sync` resyncs the lock.

## See also

- [Apps and repos](apps-and-repos/index.md) — how Cabinet integrates with external tools
- [Delegating between agents](delegating-between-agents/index.md) — how agents pass work to each other
