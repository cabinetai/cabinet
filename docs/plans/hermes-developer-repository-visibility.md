# Hermes Developer repository visibility audit

Phase 2B is a read-only projection of the installed Hermes Agent contracts. Hermes remains canonical for session, profile, working-directory, repository, worktree, and review state. Cabinet stores no independent repository state and exposes no mutation in this slice.

## Installed contract identity

- Hermes Agent version: `0.18.2`
- Installed Agent source commit: `594308d4bbe95548c9fe418bb10c449099426f93`
- Installed source description: `v2026.7.7.2-1150-g594308d4b`
- Authenticated management contract: installed `/openapi.json`, observed 2026-07-19
- Authentication boundary: server-side `X-Hermes-Session-Token`; the token is never serialized or logged
- Request policy: GET only, `no-store`, 3,000 ms configured timeout, bounded redacted failures

## Interface audit

| Capability | Exact installed interface | Method and observed response | Runtime availability | Redaction and stability decision |
| --- | --- | --- | --- | --- |
| Projects | `/api/sessions?limit=100` | GET; session records include `id`, `profile`, `profile_name`, `cwd`, `git_branch`, `git_repo_root`, `is_active`, and `last_active` | Available. Active profile `operator-os` and a working directory were reported. The selected session did not report `git_repo_root`. | Stable enough for project/profile/session association. Full cwd, session metadata blobs, and local identity are removed. A missing repository association remains an explicit source fact. |
| Worktrees | `/api/git/worktrees?path=<session cwd>` | GET; array records include `path`, `branch`, `isMain`, `detached`, and `locked` | Available; one worktree was returned by the live read-only audit. | Stable installed typed Desktop contract. Paths become a bounded basename identity. Duplicates are deterministic; multiple-current is ambiguity; detached is explicit. No add/remove/repair routes are called or surfaced. |
| Git status | `/api/git/status?path=<session cwd>` | GET; `branch`, `defaultBranch`, `detached`, `ahead`, `behind`, `staged`, `unstaged`, `untracked`, `conflicted`, `changed`, `added`, `removed`, `files` | Available. The live audit reported branch `master`, changes present, staged 0, unstaged 5, untracked 5, conflicts 0, ahead 0, behind 0. | Stable enough for bounded counts and branch state. File arrays, paths, remotes, stderr, and command output are discarded. Absence of counts never implies clean. |
| Review list | `/api/git/review/list?scope=uncommitted&path=<session cwd>` | GET; `{ files, base }`, file records include `path`, `added`, `removed`, `staged`, and `status` | Available; five review records were returned by the live read-only audit. | Stable enough to report review availability and count only. No raw paths, patches, diffs, file contents, author data, or remotes reach the browser. |

The installed backend also declares mutation routes for staging, reverting, committing, pushing, pull-request creation, branch switching, and worktree add/remove. They are deliberately excluded. Cabinet makes no browser-callable proxy for them in Phase 2B.

## Source reconciliation

The selected Hermes session reported a working directory but no `git_repo_root`. Independently, the installed Git status, worktree, and review endpoints successfully resolved Git context for that working directory. Cabinet therefore presents:

- session repository association: not reported;
- Git repository context: observed by the separate Git interfaces.

It does not rewrite either fact or infer that the session source supplied an association. Overall Hermes health cannot replace a failed or stale project, worktree, status, or review observation.

## Existing Cabinet destinations

- Projects map to Cabinet rooms and linked repositories at `/`.
- Source-control review maps to Cabinet's existing file history, readable diff, and task Diff surfaces. The Control Center provides a destination link rather than reproducing those views.
- Worktrees remain a Hermes `visible_read_only` capability in Developer mode; no Cabinet-owned worktree catalog or control is introduced.

## Projection and non-egress rules

Raw installed responses are normalized server-side into source-specific observations, then passed through the accepted authority, freshness, health, credit, and recursive browser-sanitization pipeline. Only bounded labels, booleans, counts, timestamps, proof identity, and nonsecret summaries survive. Full POSIX and Windows user paths, remote userinfo, HTTPS tokens, SSH usernames, local-file remotes, secret query values, credential filenames, authorization material, control characters, terminal escapes, arbitrary errors, diffs, and file contents are excluded.

The Phase 2B exact fixture is `hermes-phase-2b-repository-visibility-v1`. It proves the production projection and browser paths but earns neither Current Live Visibility nor Live-Proven credit. Live evidence, when captured, is labeled separately and must use the configured installed runtime without restart or reconfiguration.
