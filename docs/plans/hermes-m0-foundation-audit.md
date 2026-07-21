# Hermes M0 Foundation Audit

Status: passed on 2026-07-18

This record is the evidence for Milestone 0 of the Hermes-first Cabinet project. It establishes a clean, isolated Hermes operator profile. It does not approve a Cabinet cutover. Cabinet remains a secondary Hermes interface until M7 passes and Jeremy explicitly approves the cutover.

No secret values, sudo values, API keys, session tokens, or archived conversation contents are included in this repository.

## Existing-profile archive

The previously active `default` profile was archived before the new profile was created.

- Archive: `/Users/ignitabull/.hermes/archives/hermes-first-cabinet/default-20260718-153627.tar.gz`
- SHA-256: `c8cc4d96e467a8862ca38961af7ca98728f46c9a3107ba26480dda841b287ce0`
- File mode: `0600`
- Size: 99,215,504 bytes
- Contents verified: configuration, `SOUL.md`, cron state, and 617 session files
- Credential exclusion verified: no `.env` or `auth.json` was present in the archive
- Restore check: the archive was extracted into a temporary directory, the configuration, rules, and 617 sessions were counted successfully, and the temporary extraction was then removed

The original profile was left present and inactive. Its history was not imported into the new profile.

## Isolated operator profile

The new active profile is `operator-os` at `/Users/ignitabull/.hermes/profiles/operator-os`.

Verified profile state:

- active profile: `operator-os`
- model provider: `ollama-cloud`
- model: `glm-5.2`
- configuration schema: version 33
- installed skills: 0
- scheduled jobs: 0
- enabled optional plugins: 0
- configured MCP servers: 0
- supervised gateway: running through `ai.hermes.gateway-operator-os`
- inference connectivity: passed
- Hermes security advisories: none reported by `hermes doctor`

The installed Hermes version was `0.18.2`. Doctor reported optional integrations that are not configured, including auxiliary provider credentials and a GitHub token. Those are not M0 dependencies. The installed version does not expose explicit Hermes Executor or OpenCLI management surfaces, so no unsupported component was invented or enabled.

## Secrets and memory

The profile uses Hermes' native 1Password secret source. The profile stores references for `OLLAMA_API_KEY` and `SUPERMEMORY_API_KEY`; it does not store their values in this repository or in the profile's checked evidence.

Supermemory state was verified as follows:

- configured logical container: `hermes-operator-os`
- Hermes-normalized container: `hermes_operator_os`
- automatic recall: enabled
- automatic capture: enabled
- initial imported profile facts: 0
- controlled capture marker: `HERMES_OPERATOR_OS_M0_20260718_1536`
- saved record ID: `jpwH8mRWPViyEfbEmFijj8`
- retrieval result: marker found with similarity 94 in `hermes_operator_os`

This proves new-profile capture and retrieval without bulk-importing the prior profile's memory.

## Operator rules

The profile `SOUL.md` contains the 15 baseline rules from the definitive architecture plan. A new governed session reported the first and last rules exactly and confirmed these two authority boundaries:

- external sends require explicit approval
- Jeremy is the final authority

The first loaded rule is: `Hermes is the primary operator. Jeremy is the final authority.`

## Capability audit

Read-only CLI inspection established:

- cron: no scheduled jobs
- skills: no installed or enabled skills
- plugins: bundled plugins present but none enabled
- MCP: no configured servers
- gateway: supervised and running
- memory: Supermemory connected to the isolated container
- model: Ollama Cloud connectivity passed

Available built-in toolsets include web, browser, terminal, file, code execution, vision, image generation, text-to-speech, skills, todo, memory, session search, clarification, delegation, cron, and computer use. Availability does not grant permission to perform consequential actions; the operator rules and approval system remain controlling.

## Read-only canary and approval boundary

A fresh `operator-os` session was told to use read-only terminal operations and no network access. It reported:

- package: `cabinet`
- version: `0.5.3`
- branch: `feat/hermes-runtime`
- git status: clean
- loaded first operator rule: `Hermes is the primary operator. Jeremy is the final authority.`

The session correctly distinguished the profile-injected `SOUL.md` from the repository, where no `SOUL.md` exists. A direct `git status --short` after the canary remained empty.

The profile approval mode is `manual`, with cron approvals set to `deny`. A deterministic pre-execution guard test against `git reset --hard HEAD` produced all of the following before any command execution:

- dangerous command detected: true
- classification: `git reset --hard (destroys uncommitted changes)`
- human approval callback invoked: true
- denied callback result: `approved: false`

This verifies that a high-risk action stops at the explicit human approval boundary. The destructive command was not executed.

## M0 result

M0 is technically satisfied when the related Linear evidence is reviewed: the old profile is recoverably archived, `operator-os` is isolated and active, model and memory connectivity work, baseline rules load, optional automations are absent, the read-only canary leaves the checkout unchanged, and high-risk execution is gated by manual human approval.
