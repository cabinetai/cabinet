# Hermes Skills management contract

Audited 2026-07-21 against the installed Hermes Agent 0.19.0 executable and
authenticated Agent API contract. Hermes remains the canonical skill registry
and executor. Cabinet keeps only bounded, in-process previews and receipts and
requires canonical Hermes readback before claiming success.

## Native interfaces used

| Operation | Exact Hermes 0.19.0 interface | Phase 5A status |
| --- | --- | --- |
| Contract identity | `GET /openapi.json`, requiring `info.version == 0.19.0` | Required before prepare and commit |
| List installed | `GET /api/skills?profile=<profile>` | Operational |
| List hub sources | `GET /api/skills/hub/sources?profile=<profile>` | Operational |
| Search catalog | `GET /api/skills/hub/search?q=<query>&source=all&limit=50&profile=<profile>` | Operational |
| Inspect exact candidate | `GET /api/skills/hub/preview?identifier=<identifier>&profile=<profile>` plus exact `GET /api/skills/hub/scan` | Required for an exact hub target; content and findings never egress |
| Machine identity | `<approved-cli> version --json`, schema `hermes.cli.identity` v1 | Required for CLI-backed operations |
| Install | `<approved-cli> -p <profile> skills install <identifier> --yes` | Operational only with approved CLI authority |
| Enable or disable | `PUT /api/skills/toggle?profile=<profile>` with `{name, enabled, profile}` | Operational |
| Remove | `<approved-cli> -p <profile> skills uninstall <name>` with fixed `yes\n` input | Operational only for an exact installed hub identity and approved CLI authority |
| Check updates | Hermes CLI `skills check` | Read-only audit surface |
| Update | No exact structured, target-specific update/readback contract in 0.19.0 | Audit-only, no action exposed |
| Verify outcome | Fresh narrow installed-state read | Required; command or HTTP success is insufficient |

Catalog discovery is not mutation authority. Prepare and commit inspect a full
hub identifier through the target-specific preview and scan contracts, reduce
the response immediately to name, source, trust, scan verdict, finding count,
prerequisite classification, and an opaque fingerprint, and never return scan
findings, manifests, skill instructions, repository URLs, or file names. The
installed API uninstall wrapper passes an unsupported `--yes` option, so
Cabinet uses the audited CLI contract above instead.

## Read boundaries and deadlines

Cabinet exposes five explicit adapter operations: `discoverCatalog`,
`readCanonicalInstalledState`, `inspectExactCandidate`,
`inspectExecutionAuthority`, and `execute`. Catalog discovery may use general
search or featured sources. Prepare, commit preconditions, verification, and
reconciliation use only the narrow installed-state reader, plus exact candidate
inspection when the prepared target is hub-backed.

Read deadlines are source-specific and independent of the general Hermes
collector timeout:

| Source class | Per attempt | Total operation deadline | Attempts |
| --- | ---: | ---: | ---: |
| Installed state | 750 ms | 1750 ms | At most 2 |
| Agent contract | 1500 ms | 3250 ms | At most 2 |
| Exact hub candidate preview and scan | 6000 ms | 12500 ms shared | At most 2 per read within the shared deadline |
| Catalog discovery | 5000 ms | 5500 ms | 1 |

Only timeout and transient transport unavailability permit one read-only
retry, with a new abort controller. Authentication rejection, malformed
response, contract mismatch, duplicate identity, stale state, and changed
target never retry. Mutation dispatch never retries. Internal evidence records
attempt count, safe source classification, and total elapsed time without raw
URLs or credentials. Observation time is captured only after all required
source reads complete successfully.

## Exact executable authority

`CABINET_HERMES_CLI_PATH` has no default and must be an explicit absolute
server-side path. There is no `PATH` lookup or fallback. For install and remove,
Cabinet performs all of the following once during prepare and once during the
commit authority check:

- resolves symlinks and requires a regular executable file no larger than the
  bounded executable limit;
- hashes the executable bytes and binds device, inode, size, nanosecond mtime,
  resolved path, and machine identity into an opaque authority identity;
- runs only the resolved executable with `shell: false` and fixed argument
  arrays;
- requires `hermes.cli.identity` schema version 1, Hermes Agent 0.19.0,
  live-base companion source revision `714ed4ec6cbe3e57b7bb6379c5e97f7b801469a5`,
  a valid self-hashed installation identity, and an installation root and
  entrypoint that resolve back to the configured executable;
- rejects a missing, non-executable, unexpected, replaced, or changed target;
- passes a minimal fixed environment with only production mode, home, a fixed
  system path, locale, noninteractive, no-color, and terminal settings;
- bounds combined output, never returns it to the browser, sends `SIGTERM` at
  the operation deadline, escalates to `SIGKILL` after the grace period, and
  settles after the child closes and is reaped.

The machine identity command runs before Hermes profile, dotenv, plugin,
logging, update-check, network, and external secret-source startup. Immediately
before mutation dispatch, Cabinet repeats only the static file identity check,
then invokes the exact executable once for the fixed Skills operation.

The API authority is separately bound to exact Agent API version 0.19.0 and the
configured profile. Prepare records an opaque action authority; commit
reauthorizes and rejects any change before dispatch. The fixed CLI runner makes
one final executable-identity comparison immediately before spawning and does
not repeat the Agent contract check.

## Public Skills secret-source isolation

The companion Hermes patch accepts the exact server-controlled value
`HERMES_SKIP_EXTERNAL_SECRET_SOURCES=official-public-skills-v1` only for these
command shapes: local installed-state `skills list`, local `skills audit`,
official `skills inspect`, official `skills install`, and an uninstall whose
canonical hub lock entry proves official provenance. Chat, gateway, model,
provider, authentication, search, private sources, and every other command are
rejected when that value is present.

Cabinet sets the value only after the exact candidate is official, has builtin
or official trust, has safe scan and allow policy with zero findings, and has
no declared credential, account, network, environment, or external-command
prerequisite. Ordinary profile configuration, dotenv, managed scope, skill
scanning, and governed policy still run. Only external secret-source
application is skipped. Candidates that do not satisfy the proof run with
normal Hermes secret loading or remain unavailable.

The approved installation target is the live-base companion commit
`714ed4ec6cbe3e57b7bb6379c5e97f7b801469a5`, whose parent is the installed
Hermes source revision `d7b36070ef807841699ad32c5b6af547fee3ff64`.
Commit `9172a354f058aa0feaa6ea9c3b7def799e53bada` is retained only as the
original semantic reference and is not an approved live installation target.

## Identity and provenance

- Installed hub identity is
  `<profile>:hub:<exact-source/category/name-identifier>`.
- Installed bundled or Agent identity is
  `<profile>:<provenance>:<safe-name>`.
- Catalog identity is the exact safe Hermes hub identifier.
- Same-name skills from different hub sources remain different targets.
- A hub-installed row without exactly one identifier mapping is ambiguous and
  has no supported actions.
- Install verification requires the exact hub identifier, profile, provenance,
  and source. A same-name result from another source does not verify.
- Removal verification requires the exact hub identifier to be absent. A
  same-name bundled skill may remain without invalidating exact removal.

## Governed operation behavior

| Property | Phase 5A behavior |
| --- | --- |
| Preview and request IDs | Independent cryptographically random 128-bit identities; never derived from semantics |
| Semantic state binding | Separate server-only SHA-256 fingerprint over exact target state, source, provenance, hub identifier, profile, and action |
| Actor isolation | Preview and receipt lookup are actor-scoped; one actor cannot observe or commit another actor's request |
| Preview expiry | 120 seconds |
| Receipt lifecycle | Explicit `pending` then `completed`; pending receipts are never removed by age or count cleanup |
| Completed cleanup | Retention and count limits apply only to completed receipts and remove the paired preview at the same time |
| Duplicate commit | Concurrent and later duplicates share the first pending promise or completed result and never redispatch |
| Process restart | A fresh canonical read that exactly proves the requested state returns success without dispatch |
| Canonical source gate | Unavailable, authentication failure, timeout, failure, malformed, stale, duplicate, or changed state fails closed before dispatch |
| Retry | One bounded retry is allowed only for a read timeout or transient transport unavailability; mutation never retries and reconciliation is read-only |
| Success | Requires exact fresh canonical Hermes readback |
| Ambiguous outcome | A timeout or transport loss after dispatch, or failed exact readback, is `outcome_unknown` |
| Reversibility | Enable and disable are paired. Install and removal require separate confirmations. Update is audit-only |

## Non-egress boundary

Browser responses contain bounded safe identity, name, installed/enabled state,
explicit version when present, safe source/provenance, exact safe hub identifier,
profile, observation time, supported actions, preview facts, and result state.

Cabinet does not return actor identity, semantic fingerprints, credentials,
skill instructions, prompt text, manifests, file names, local paths,
environment requirements, raw API bodies, raw CLI output, executable identity,
executable paths, or command arguments.

## Acceptance fixture

The Skills-only fixture is explicitly labeled
`Acceptance fixture — no live Hermes mutation performed` and
`Fixture Agent 0.19.0`. It uses the fake adapter while exercising the
production governance service and route. It covers exact identities, actor
isolation, random IDs, concurrent duplicate commits, pending-receipt cleanup,
completed-receipt eviction, stale and malformed canonical states, exact
install/enable/disable/remove readback, same-name source collisions, failures
before dispatch, unknown outcomes after dispatch, read-only reconciliation,
and malicious metadata sanitization. Update is displayed as audit-only and is
not committed by the fixture.
