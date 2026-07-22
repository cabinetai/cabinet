# Hermes Skills management contract

Audited 2026-07-22 against Hermes Agent 0.19.0. Hermes remains the canonical
registry and executor. Cabinet holds only bounded in-process previews and
receipts and never claims success without fresh canonical CLI JSON readback.

## Durable interfaces

| Purpose | Exact interface | Authority |
| --- | --- | --- |
| Official catalog | `<approved-cli> -p <profile> skills catalog --json` | Discoverability only |
| Canonical installed state | `<approved-cli> -p <profile> skills list --json` | Canonical |
| Exact candidate metadata | `<approved-cli> -p <profile> skills inspect <official-identifier> --json` | Candidate authorization |
| Exact candidate scan | `<approved-cli> -p <profile> skills audit <official-identifier> --json` | Candidate authorization |
| CLI identity | `<approved-cli> version --json`, `hermes.cli.identity` v1 | Executable authority |
| Install | `<approved-cli> -p <profile> skills install <identifier> --yes` | Governed mutation |
| Remove | `<approved-cli> -p <profile> skills uninstall <official-identifier> --yes` | Governed mutation |
| Update | `skills check` only | Audit-only |
| Enable or disable | Interactive `skills config` only | Unsupported; no Cabinet action |

Desktop Management `/api/skills`, `/api/skills/toggle`, Desktop Hub routes,
Agent `/v1/skills`, and Agent API credentials are not dependencies. Production
discovery, prepare, commit precondition, post-dispatch verification,
reconciliation, and rollback authorization use only the fixed CLI machine
contracts. Agent `/v1/skills` remains an unrelated read-only Control Center
capability catalog.

Every accepted Skills payload is schema v2. It keeps Hub `source`, native
`native_trust`, and Cabinet's derived `authority_class` as separate facts; an
official public target is authorized only when those are exactly `official`,
`builtin`, and `official_public`, with `official`, `public`, and
`local_fulfillment` all true. Schema v1 is rejected.

The official catalog response is bounded to category, exact identifier, name,
source, native trust, and authority facts. Candidate JSON is bounded to exact
identifier and name, official/public/local provenance, native trust,
prerequisite classes, scan verdict, and finding count. Canonical JSON is bounded to profile, exact installed
identity, Hub identifier where applicable, origin/provenance, source, native
trust, authority class, enabled state, exact-match count, and same-name
collision count. Cabinet
rejects extra fields, malformed JSON, ANSI or human table output, schema drift,
profile drift, count disagreement, inspect/audit disagreement, duplicate names,
duplicate identifiers or install paths, stale lock entries, and path mismatch.
There is no last-record-wins normalization.

## Companion revision

The only approved companion is:

- commit: `78a803a013547794a295d674982f1fe0515f5713`
- parent/live installed base: `714ed4ec6cbe3e57b7bb6379c5e97f7b801469a5`
- patch: `docs/evidence/hermes-skills-management/0001-feat-skills-add-CLI-native-governed-contracts.patch`
- patch SHA-256: `196924cc3a9aa2c797cd9f1440f92770d709167bb1c7ca4bd1eb5bd4dd660e24`

Earlier companions `84b3ed8aace50ca5afb285d299b8a66816085368`,
`9172a354f058aa0feaa6ea9c3b7def799e53bada`, and
`97f82f73fc15e534fef6377148c99c22be6b652c` are semantic references only and
are not trusted. The live-base commit
`714ed4ec6cbe3e57b7bb6379c5e97f7b801469a5` is the parent, not the approved
management contract.

## Secret-source and execution isolation

Cabinet passes
`HERMES_SKIP_EXTERNAL_SECRET_SOURCES=official-public-skills-v1` only for the
audited public Skills command shapes. The companion extends that allowlist only
for `version --json`, `skills catalog --json`, `skills list --json`, `skills
inspect official/... --json`, and `skills audit official/... --json`, exact
official install with `--yes`, and exact official uninstall with `--yes`.
Private identifiers and all unrelated commands remain rejected.

Exact inspect and audit resolve only the local official optional-skill source;
they do not initialize a remote catalog. Cabinet enables the skip only when the
candidate proves official source, builtin native trust, official-public
authority, public and local fulfillment, safe scan
with zero findings, and no credential, account, network, environment, or
command prerequisite. Platform classification alone is non-sensitive.

`CABINET_HERMES_CLI_PATH` has no default. Cabinet requires an absolute regular
executable and binds resolved path, file bytes, device, inode, size,
nanosecond mtime, and machine identity into an opaque authority. It requires
Hermes Agent 0.19.0 and exact source revision
`78a803a013547794a295d674982f1fe0515f5713`. Every subprocess uses
`shell: false`, a fixed argument array, bounded output and deadlines, and a
minimal environment without Cabinet/provider credentials. No `PATH` fallback,
direct Skills file write, human-output parser, or raw CLI output crosses the
adapter boundary.

## Governance and verification

| Property | Behavior |
| --- | --- |
| IDs | Independent cryptographically random 128-bit preview and request identities |
| Actor | Preview and receipt lookup is actor-scoped |
| Binding | Server-only fingerprint covers action, exact target state, profile, source, provenance, and Hub identifier |
| Confirmation | Exact server-issued phrase, for example `INSTALL SKILL one-three-one-rule IN operator-os` |
| Dispatch | At most one fixed CLI mutation for a request; no automatic mutation retry |
| Duplicate commit | Concurrent and later duplicates share the first pending promise or completed result |
| Precondition | Fresh candidate, executable authority, and canonical state must equal prepared state |
| Success | Exact profile, Hub identifier, installed name, official source, builtin native trust, official-public authority, one match, and zero ambiguity |
| Unknown | Timeout, transport loss, or unverified readback becomes `outcome_unknown` |
| Reconciliation | Read-only canonical CLI JSON; never redispatches |
| Rollback | Install names governed Remove; Remove requires a separately confirmed Install |

Install verification requires the exact Hub identifier, installed name,
profile, source, native trust, authority class, official/public/local flags,
and exactly one canonical match. A same-name skill
from another source never verifies. Removal verification requires that no
same-name canonical entry remains, preventing a source collision from being
mistaken for rollback success. CLI exit status alone is never success.

Operational scope is deliberately narrow: Install and exact governed Remove
support official public Hub targets only. Community, GitHub, private, local,
bundled, missing, and ambiguous targets fail closed in both UI projection and
server prepare/commit. Enable and disable are unsupported, and Update remains
audit-only.

Enable and disable are explicitly unsupported because Hermes 0.19.0 exposes no
fixed durable noninteractive mutation for them. They have no production route
action, no supported row action, and no Operator button. Update remains
audit-only.

## Non-egress boundary

Browser responses may contain bounded skill identity, name, installed/enabled
state, safe source/provenance, exact Hub identifier, profile, observation time,
supported action, preview facts, and result state. They never contain actor
identity, fingerprints, credentials, descriptions, skill instructions, prompt
text, manifests, file names, local paths, URLs, raw metadata, raw API/CLI
bodies, executable identity/path, or command arguments.

The acceptance fixture is labeled `Acceptance fixture — no live Hermes
mutation performed`. It exercises the production governance service and route
for Install and Remove only. It cannot expose enable, disable, or update as an
operational action.

## Verification status

The replacement changed surface passes 423/423 tests plus Ruff. Deny-network
fresh-process contract loops pass catalog 100/100, canonical state 100/100,
inspect 50/50, and audit 50/50 with zero stderr. Twenty-five unique disposable
homes each completed exact inspect, audit, install, canonical readback,
`uninstall <official-identifier> --yes`, and empty-state readback under the same
deny-network sandbox. All 25/25 round trips ended with consistent empty lock and
install trees, zero timeout, and zero external-secret startup.

The identical dev-only full-suite boundary was run against the exact parent and
replacement. The parent completed 2,122 files with 41,252 tests passing and 33
failures; the replacement completed 2,123 files with 43,132 tests passing and
36 failures. Both reproduced the same missing-`acp` import signatures alongside
unrelated macOS/platform/load failures, while the replacement Skills surface
passed. A second complete replacement run used the project-declared `dev` and
`acp` extras (`agent-client-protocol==0.9.0`), eight workers, and a 900-second
file ceiling: all ACP tests passed, and the run completed all 2,123 files with
43,622 tests passing and 30 unrelated macOS/platform failures across 14 files.
The full suite is therefore not claimed as passing.

The production adapter completed one real CLI-only `operator-os` catalog and
canonical snapshot while the default Agent API was unavailable. An external
test-only dry-stop wrapper then completed 25/25 real catalog reads, 25/25
governed prepares, 25/25 commit-precondition stops immediately before
execution, 25/25 verification simulations, and 25/25 read-only reconciliation
simulations. The target remained absent and unambiguous. Those accepted
workloads recorded zero Agent API requests, zero Desktop Management requests,
zero gateway dependencies, zero mutation dispatches, zero automatic retries,
and zero external-secret invocation. The dry stop is not reachable from the
production browser or API.

Cabinet passes 647/647 unit tests and 62/62 focused Skills, governance,
intervention, authority, schema, ambiguity, and non-egress tests. TypeScript,
full ESLint with zero errors and 110 pre-existing warnings, the production
build, and the source diff check excluding the byte-preserved raw email patch
pass. The raw patch independently passes `git apply --check` against the exact
live base and retains its recorded SHA-256. The 3/3 isolated production-browser
workflows cover Operator typed confirmation and verified fixture result, all
48 Developer diagnostics, 1440x900 desktop, 390x844 reduced motion, zero
horizontal overflow, and zero browser/framework errors. Browser mutations are
fixture-only. A separate final read-only shell verification accidentally ran
one canonical list command without the isolation variable, causing one bounded
1Password startup; it emitted no secret values and performed no mutation. This
invocation is excluded from, and disclosed separately from, the accepted
zero-external-secret proof workloads.

The Agent API and multi-profile gateway topology remains a separate Hermes
runtime issue. This work did not edit or restart launchd, launch a service from
the side-by-side checkout, run a canary, or mutate the live Skills state.
