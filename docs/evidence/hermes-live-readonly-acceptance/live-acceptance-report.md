# Hermes Phase 4A partial live read-only acceptance

- Classification: **Live runtime**
- Captured: `2026-07-20T21:38:45.631Z`
- Implementation: `9319ffbecd7ae9c6c61f7dd58a6b64fd2bca2030`
- Installed Hermes Agent: `0.19.0` (`d7b36070ef80`)
- Active profile: `operator-os`
- Configured source groups: Agent API
- Unavailable source groups: Management, Gateway
- Interventions: disabled
- Hermes mutation calls: `0`

## Result

Partial acceptance passed for the authenticated Agent API source at the safe loopback identity `http://127.0.0.1:8642`. The exact live Hermes endpoint reached was `GET /health/detailed`.

Management and Gateway remained independently unavailable. No Management or Gateway observation was promoted from the Agent health result, no OpenCLI diagnostic was run as a substitute for Management, and no unavailable sessions fallback was described as connected-empty project evidence.

The disposable production-build Cabinet review instance ran only on `127.0.0.1:4011` with an isolated temporary Cabinet data directory. It was not publicly exposed and did not restart or reconfigure any production process.

## Live discrepancies preserved

- The running Hermes Agent identifies itself as `0.19.0` at commit `d7b36070ef80`; the prior installed-version source audit recorded `0.18.2` and is therefore stale.
- Agent health reported an indirect Gateway state, while direct Gateway configuration was absent. The projection treats the direct Gateway source as unavailable and does not present the indirect state as proof that Gateway is running.
- Management-backed sessions, messaging, skills, jobs, agents, artifacts, memory, models, plugins, repository context, runtime execution, and usage remained unavailable or degraded. Agent health did not replace those source-specific failures.
- The About and updates registry surface describes a broader update/application-metadata interface, but this acceptance credited only the exact live Agent evidence from `/health/detailed`.

## Parity

| Dimension | Result |
| --- | ---: |
| Discoverability | 48/48 (100%) |
| Current Live Visibility | 1/48 (2%) |
| Governed Management | 3/48 (6%) |
| Live-Proven | 4/48 (8%) |

Only About and updates earned fresh Current Live Visibility from this partial live run. Command Center and About and updates have live-operation proof; Approvals and Browser/OpenCLI retain separately labeled historical live proof. No fixture evidence earned live credit.

## Verification

- Full unit suite: 569 passed, 0 failed.
- Focused Hermes suite: 148 passed, 0 failed.
- Focused partial-source correction suite: 62 passed, 0 failed.
- Production browser workflows: 7 passed, 0 failed.
- TypeScript: passed.
- Focused ESLint: passed.
- Production build: passed.
- `git diff --check`: passed.
- Live browser: desktop 1440×900 and mobile 390×844 passed with zero horizontal overflow, reduced-motion active, no framework overlay, and no relevant console errors.
- Live browser request observation: zero non-read-only `/api/hermes/*` requests.
- Recursive credential and local-identity non-egress tests: passed; committed text and binary evidence was also checked against the configured API credential without displaying it.
- Matrix, machine projection, and browser percentages agree at 100% / 2% / 6% / 8%.

Existing unrelated warnings remain: two Turbopack NFT trace warnings from the system file-picker import trace, plus Playwright's `NO_COLOR` / `FORCE_COLOR` notice. An over-broad exploratory test command also discovered two packaging smoke scripts that require an Electron bundle; the required full unit and focused Hermes suites were rerun correctly and passed.

## Evidence

- `live-runtime-projection.json`: sanitized canonical live projection with typed source evidence.
- `configuration-readiness.json`: credential-free variable/source readiness.
- `live-artifact-manifest.json`: shared provenance for every live artifact and screenshot.
- `live-agent-overview-1440x900.png`: desktop live overview.
- `live-agent-identity-inspector-1440x900.png`: exact Agent identity evidence.
- `live-agent-overview-mobile-390x844.png`: mobile live overview.
- `live-agent-identity-mobile-390x844.png`: mobile live Agent evidence sheet.

The earlier `acceptance-report.md` remains the immutable Stage A safe-block record. This report is the Stage B partial Agent API acceptance.
