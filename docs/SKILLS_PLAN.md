# Cabinet Skills: As-Built Contract

**Status:** Implemented reference, verified against `src/lib/agents/skills/` on 2026-07-20.

This document replaces the missing historical skills plan referenced by code and project rules. It describes the current Cabinet-mode implementation. In Hermes mode, Cabinet's local skills settings are hidden and Hermes remains authoritative; the Hermes Control Center projects bounded skill and toolset catalogs through the Hermes Agent API.

## Bundle format

A skill is a directory containing `SKILL.md` with optional `references/`, `rules/`, `assets/`, and `scripts/` content. `gray-matter` parses frontmatter. `allowed-tools` accepts a comma-separated string or an array.

The loader inventories every file and derives one descriptive trust level:

- `markdown_only`: instructions and markdown references only.
- `assets`: contains assets or unclassified non-code files.
- `scripts_executables`: contains a recognized script extension, a file under `scripts/`, or an executable file.

## Origin precedence

The first matching key wins in this order:

1. `cabinet-scoped`: `<data-dir>/<cabinet>/.agents/skills/<key>/`
2. `cabinet-root`: `<project>/.agents/skills/<key>/`
3. `linked-repo`: a linked repository's `.agents/skills/<key>/`
4. `system`: `~/.claude/skills/`, `~/.agents/skills/`, and skills discovered in supported Claude plugin-marketplace layouts
5. `legacy-home`: `~/.cabinet/skills/<key>/`

Cabinet-scoped and cabinet-root bundles are editable. Linked, system, and legacy-home bundles are read-only until explicitly bundled into Cabinet.

## Attachment and mounting

- Persona `skills:` entries are persistent attachments.
- Persona `recommendedSkills:` entries are template defaults promoted during agent creation.
- Composer `@skill-name` mentions attach a skill to one run only.
- `prepareSkillMount()` resolves the combined keys, creates an ephemeral Claude-compatible plugin directory under the OS temporary directory, symlinks the selected bundles, and records that they were offered.
- Cleanup removes the ephemeral mount after the run.

Attaching a skill is currently the operator's trust decision. Trust level is displayed in the UI, including an executable-content warning, but there is no separate runtime `trust-policy` approval gate and no `.cabinet/skills-trust.json` decision store. Do not document those mechanisms as implemented unless the code adds them.

## Import, lock, and drift behavior

- Imports support GitHub, skills.sh, local paths, URLs, and catalog sources.
- `skills-lock.json` schema v2 records source, ref, scope, install time, and per-file SHA-256 hashes.
- `npm run skills:sync` reports locked bundles as `missing`, `modified`, `unmodified`, or `no-lock`.
- Discovery scan looks for skill roots such as `.agents/skills`, `skills`, and `.claude/skills` while excluding dependency/build directories.
- Export bundling materializes linked skills and, when requested, referenced system skills into an export.

The API under `/api/agents/skills` provides listing, CRUD for editable origins, import, discovery scan, catalog data, and bundle-into-cabinet operations.

## Verification

Run the following after changing the skills implementation or this contract:

```bash
npm run skills:sync
npx tsx --test src/lib/agents/skills/*.test.ts
```

The broader project gates remain `npm test`, `npm run lint`, and `npm run build`.
