# Hermes Skills management contract

Audited 2026-07-21 against the installed Hermes Agent checkout at commit
`d7b36070ef807841699ad32c5b6af547fee3ff64`. The installed Python package and
live OpenAPI both report version `0.19.0`.

This audit is the implementation boundary for Cabinet Phase 5A. Hermes remains
the canonical skill registry and executor. Cabinet stores only expiring
previews and idempotency receipts, then reads Hermes again to verify outcomes.

## Native interfaces used

| Operation | Exact installed interface | Scope | Cabinet implementation |
| --- | --- | --- | --- |
| List installed | `GET /api/skills?profile=<profile>` | Query-scoped profile | Implemented |
| List catalog sources and featured skills | `GET /api/skills/hub/sources?profile=<profile>` | Query-scoped profile | Implemented |
| Search available skills | `GET /api/skills/hub/search?q=<query>&source=all&limit=50&profile=<profile>` | Query-scoped profile | Implemented |
| Inspect safe metadata | Search/source result fields: `name`, `identifier`, `source`, trust/provenance | Query-scoped profile | Implemented with a narrower projection |
| Install | Fixed argv: `hermes -p <profile> skills install <identifier> --yes` | CLI profile selector | Implemented |
| Check one update | Fixed argv: `hermes -p <profile> skills check <name>` | CLI profile selector | Implemented for prepare/readback |
| Update one skill | Fixed argv: `hermes -p <profile> skills update <name>` | CLI profile selector | Implemented for hub-installed skills |
| Enable or disable | `PUT /api/skills/toggle?profile=<profile>` with `{name, enabled, profile}` | Query and body profile | Implemented |
| Remove one skill | Fixed argv: `hermes -p <profile> skills uninstall <name>` with fixed `yes\n` stdin | CLI profile selector | Implemented for hub-installed skills |
| Validate installed hub skill | Fixed argv: `hermes -p <profile> skills audit <name>` | CLI profile selector | Audited only; not exposed as a Phase 5A action |
| Action status | CLI process completion plus canonical readback | One spawned process | Used internally; raw output never leaves the server |

The authenticated Agent API is preferred for structured reads and the only
native enable/disable contract. Durable fixed CLI commands are used for
install, targeted update, and removal so Cabinet does not depend on the Hermes
Desktop server's rotating port or token for operations that already have a
durable CLI path.

## Installed contract constraints

- `GET /api/skills` returns installed state, enabled state, category, usage, and
  provenance. It does not promise a version field.
- `GET /api/skills/hub/sources` maps safe hub identifiers to installed names
  and can return featured catalog items.
- `GET /api/skills/hub/search` returns catalog metadata and source timeout
  information. Cabinet drops descriptions, repository URLs, paths, manifests,
  instructions, environment data, and unbounded metadata.
- `GET /api/skills/hub/preview` returns `skill_md` and a file manifest. Cabinet
  deliberately does not call or expose this content-bearing endpoint.
- `GET /api/skills/hub/scan` returns finding file names and detailed scan text.
  Cabinet deliberately does not expose those fields in Phase 5A. Installation
  still goes through Hermes' native quarantine and scan pipeline.
- `POST /api/skills/hub/update` updates all outdated skills and cannot target a
  single skill. Cabinet uses the installed targeted CLI instead.
- `POST /api/skills/hub/uninstall` spawns a CLI command with `--yes`, but the
  installed 0.19.0 `skills uninstall` parser does not define `--yes`. Cabinet
  does not rely on that inconsistent endpoint and uses the fixed CLI with
  fixed confirmation input.
- There is no installed skill rollback operation. Update is therefore marked
  not automatically reversible.
- Hermes' enabled state is profile configuration. Cabinet changes it only
  through `PUT /api/skills/toggle`; Cabinet never edits `config.yaml`.

## Governed operation behavior

| Property | Phase 5A behavior |
| --- | --- |
| Canonical identity | Installed: `<profile>:<safe-name>`. Catalog: the safe Hermes hub identifier. |
| Authentication | Cabinet actor/session at the route; Hermes bearer credential stays server-only. |
| Same origin | Required for every prepare, commit, and reconciliation request. |
| Preview expiry | 120 seconds. |
| Stable request identity | SHA-256 over action, target, profile, canonical state fingerprint, and reason. |
| Duplicate commit | Concurrent and later duplicates share the first receipt and promise. |
| Process restart | Commit always re-reads Hermes. If Hermes already proves the target state, Cabinet returns verified success without dispatching again. |
| Stale state | Any fingerprint change after preview returns `blocked_no_action`. |
| Timeout | 30 seconds maximum. A timeout after process/API dispatch is `outcome_unknown`. |
| Retry | Never automatic. Reconciliation is read-only. |
| Success | Requires a new canonical Hermes readback. HTTP success or process exit alone is insufficient. |
| Ambiguous outcome | Dispatch timeout, connection loss, non-success process result, malformed response, or failed verification becomes `outcome_unknown`. |
| Reversibility | Enable/disable are paired. Install may be reversed by a separately confirmed removal. Removal requires a new reviewed install. Update has no native rollback. |

## Non-egress boundary

Browser responses contain only safe identity, name, installed/enabled state,
explicit version when present, safe source/provenance, profile, explicit update
availability, observation time, supported actions, preview facts, and bounded
result state.

Cabinet does not return skill instructions, prompt text, manifests, file names,
local paths, environment requirements, secret names or values, raw API bodies,
raw CLI output, action log lines, executable paths, or command arguments.

## Acceptance fixture

The fake-adapter fixture is labeled:

`Acceptance fixture — no live Hermes mutation performed`

It covers an installable skill, installed enabled/disabled skills, update
availability, unsupported removal, stale state, duplicate commit, verified
install/enable/disable/update/remove, failure before dispatch, unknown outcome
after dispatch, read-only reconciliation, duplicate identities, and malicious
metadata sanitization. Fixture commits exercise the production governance
service and route but call only the fake adapter.
