# Production acceptance harness

Run from the repository root:

```bash
node scripts/production-acceptance/run.mjs
```

The runner:

- refuses to run when application/shared runtime files differ from the tested
  base (current `origin/main` by default);
- builds the production app when `.next/BUILD_ID` is absent;
- uses isolated temporary `HOME` and `CABINET_DATA_DIR` roots;
- binds only to `127.0.0.1:4325` by default, inside the reserved final-wave
  range `4321`-`4325`;
- defaults to the registered `fixture-non-model` transport;
- requires `CABINET_ACCEPTANCE_SKILLS_MODE=fixture|production` (the runner
  selects `fixture` explicitly unless overridden);
- sends no live model messages and performs no governed Skill mutation;
- writes `acceptance-result.json`, `report.md`, `result.json`,
  `screenshot-manifest.json`, and screenshots under
  `docs/research/parallel/acceptance-harness/`.

The fixture transport only proves runner orchestration. It cannot make the
verdict `ACCEPTED`. `CABINET_ACCEPTANCE_TRANSPORT=deliberate-failure` proves
that a failed provider gate leaves the full route harness `NOT_RUN`. The final
integration selects `CABINET_ACCEPTANCE_TRANSPORT=acp`; that transport drives
exactly one initial and one continuation request before any route checks. The
route harness reuses that persisted conversation and never sends another
model turn.

The harness assigns browser issues to the active stage. A typed HTTP-200
unavailable health projection remains visible in the report without becoming
an application error. Unreadable projections, HTTP 5xx failures, page errors,
and unrelated console errors remain acceptance failures.

The live transport writes a bounded, content-free A-H persistence ledger into
`acceptance-result.json`, including hashed conversation/session/turn
identities, lifecycle states, exact durable cardinalities, and any persistence
measurements the application exposes. The ledger is exported from a `finally`
path before cardinality failures can escape, and includes a second Cabinet
restart/reload.

When the isolated runner enables `CABINET_ACCEPTANCE_OBSERVABILITY=1` together
with `CABINET_ACCEPTANCE_ISOLATED=1`, each checkpoint also captures the
default-off, read-only acceptance detail contract. It contains only hashed
identities, counts, bounded provider/model classifications, safe attempt
counters, and failure classes. Normal Cabinet processes return 404 for that
route.

When `origin/main` advances during a parallel run, pin the authorized immutable
stream-start revision explicitly:

```bash
CABINET_ACCEPTANCE_BASE_REVISION=<full-commit-oid> \
  node scripts/production-acceptance/run.mjs
```

Post-merge validation must omit that override so the runner resolves the latest
`origin/main`.

If a bounded browser run is interrupted, preserve the partial artifacts and
mark the unexecuted areas honestly:

```bash
node scripts/production-acceptance/finalize-interrupted.mjs
```

Use `harness-preflight.spec.ts` to verify the isolated fixture can bypass
onboarding/tour overlays and interact with the room drawers before a full run.
