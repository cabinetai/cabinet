# CI Testing Pipeline — e2e Integration Tests + Coding-Agent Audits

Date: 2026-07-12
Status: Approved (design), tracer bullet in progress
Branch: `feat/e2e-testing-pipeline`

## Problem

Three gaps, in order of severity:

1. **The unit suite is not a gate.** `lint-and-unit` runs with `continue-on-error: true`, so a PR can break all 354 tests and CI still reports green. The comment justifying this ("pre-existing failures") is **stale**: on a clean checkout lint passes (0 errors, 110 warnings) and the suite is 353/354. The single failure is `test/cabinet-v2.test.ts` → *"cabinet overview keeps own scope separate from descendant scope"*, which reads an ambient, git-ignored `data/` directory that does not exist in CI.

2. **No end-to-end coverage exists.** No Playwright, Vitest, Jest, or Cypress. Nothing boots the Next.js app or the daemon and drives a real user flow. Every test is a unit test.

3. **The agent adapter tests are hermetic but blind.** Each of the six `*-local.test.ts` files spawns a *fake* shell script printing canned stream JSON. They validate our parsers against a **frozen snapshot** of each CLI's output format. If Claude Code, Codex, or Gemini ships a breaking stream-format change, every test stays green while production breaks.

## Approach: foundation-first, delivered as tracer bullets

Gaps 2 and 3 share a root cause with gap 1: **state is ambient rather than injected**. You cannot honestly test the app end to end until you can boot it against a controlled, seeded state root.

The good news, established by reading the code: **every seam already exists.** Nothing needs to be invented, and no product code changes.

| Seam | Where | Used for |
|---|---|---|
| `CABINET_DATA_DIR` | `runtime-config.ts:72` → `DATA_DIR` (`path-utils.ts:6`) | isolated, seeded state root |
| `CABINET_DAEMON_PORT` | `getDaemonPort()` (`runtime-config.ts:115`) | ephemeral ports, parallel-safe |
| `PATH` lookup | `buildRuntimePath({env})` + `lookupCommandOnPath` (`provider-cli.ts:58,153`) | inject a fake agent CLI |
| Auth off by default | `KB_PASSWORD` unset ⇒ auth disabled (`kb-auth.ts:44`) | no login wall in tests |
| `/health` (unauthenticated) | `cabinet-daemon.ts:1935` | readiness polling |

**Constraint:** `DATA_DIR` is a module-level `const`, frozen at import time. The harness must therefore inject env **at process spawn**, never mutate it at runtime.

## The tracer bullet

> Boot app + daemon against a seeded temp `CABINET_DATA_DIR` on ephemeral ports → Playwright opens the app → user sends a message → the adapter spawns a **fake** agent CLI resolved from a shim on `PATH` → the streamed reply renders → assert the text is visible.

It pierces ten layers: CI job → harness → fixture → daemon → Next.js app → browser → API route → adapter → fake CLI → WS stream → DOM assertion.

Chosen because it **cannot be faked at any layer**. A shallower "the app loads" smoke test would permit mocking the daemon, hardcoding a port, and skipping the fixture — deferring all three risks. This slice is the core product loop.

Critically, the agent is a fake CLI emitting canned stream JSON: **no API key, no network**. That is what makes it eligible to block merges and to run on fork PRs.

## Components

```
test/support/
  harness.ts             # bootCabinet() — process lifecycle + isolated state
  fake-agent-cli.ts      # createFakeAgentCli() — deterministic agent output
  fixtures/seed-cabinet/ # committed seed tree
e2e/
  agent-conversation.spec.ts   # the tracer bullet
playwright.config.ts
```

```ts
export async function bootCabinet(opts?: { seed?: string }): Promise<CabinetInstance>;

interface CabinetInstance {
  appUrl: string;       // http://localhost:<ephemeral>
  daemonPort: number;
  dataDir: string;      // temp, seeded, removed on close
  useFakeAgent(providerId: string, events: string[]): Promise<void>;
  close(): Promise<void>;
}

export async function createFakeAgentCli(
  providerId: string,
  events: string[],
): Promise<{ dir: string; cleanup(): Promise<void> }>;
```

`harness` knows nothing about agents. `fake-agent-cli` knows nothing about servers. Only the spec touches both. This isolation is what makes later expansions cheap.

`fake-agent-cli` is **extracted from the six copy-pasted `createExecutableScript` helpers** in the adapter tests, which become its first consumers.

The seed fixture does double duty: it is the same fixture `cabinet-v2.test.ts` lacks. Committing it fixes the one non-hermetic test **and** feeds the e2e — which is what permits deleting `continue-on-error` in the same PR.

## CI topology

**Per-PR — blocking, secret-free, fork-safe:**

| Job | Change |
|---|---|
| `build-and-install-smoke` | existing; now uploads the `.next` build as an artifact |
| `lint-and-unit` | **drop `continue-on-error`** → becomes a real gate |
| `e2e` (new) | downloads the build artifact, installs Playwright, runs the bullet; uploads traces + screenshots on failure |

**Nightly — `agent-audits.yml`, `schedule` + `workflow_dispatch`, report-never-block.**

Agent runs are metered and nondeterministic, so they must never gate a merge; a flaky audit that blocks a good PR teaches people to bypass the gate. Fork PRs receive no secrets, so these run only on the base repo.

1. `contract` — install the **real** `claude`/`codex`/`gemini`/`opencode` CLIs; run each adapter against them; assert our parsers still handle real output. Closes gap 3.
2. `eval` — fixed task in a sandbox repo; assert the agent produced a correct result.
3. `audit` — agent-as-auditor, gated on a schema:
   ```bash
   codex exec "$(<SECURITY.md)" -a never --output-schema schema.json -o result.json
   jq -e '.success' result.json >/dev/null
   ```
   `SECURITY.md` (new) is the version-controlled audit policy; `--output-schema` forces machine-checkable JSON rather than prose; `jq -e` converts it into an exit code. Also runs the supply-chain scan over shipped agent CLIs, skills, and MCP servers.

   Note: `audit` reuses the existing `audits` domain term (`src/lib/agents/skills/audits.ts` = skills supply-chain risk). Job names are namespaced to avoid confusion.

Failures open or update a GitHub issue.

## Sequencing

1. **Bullet (this PR):** harness + fake-CLI kit + seed fixture + one e2e + `e2e` CI job + flip `lint-and-unit` to blocking.
2. Broaden web e2e: onboarding, KB login, page CRUD, search.
3. Daemon API/WS contract tests on the same harness.
4. Nightly `agent-audits.yml`: contract → supply-chain → security gate.
5. Electron shell e2e (last: highest cost, most brittle, needs the packaged artifact).

## Risks

- **Playwright in CI adds ~1–2 min.** Mitigated by reusing the `.next` artifact from the build job rather than rebuilding.
- **e2e flakiness erodes trust.** Mitigated by determinism: no network, no real model, fixed ports per run, explicit readiness polling on `/health` instead of sleeps.
- **Nightly agent costs.** Bounded by running on a schedule (not per-PR), and non-blocking.
