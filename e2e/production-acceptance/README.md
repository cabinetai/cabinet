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
- binds only to `127.0.0.1:4304` by default; final integration explicitly
  selects isolated port `4305`;
- defaults to the registered `fixture-non-model` transport;
- sends no live model messages and performs no governed Skill mutation;
- writes `acceptance-result.json`, `report.md`, `result.json`,
  `screenshot-manifest.json`, and screenshots under
  `docs/research/parallel/acceptance-harness/`.

The fixture transport only proves runner orchestration. It cannot make the
verdict `ACCEPTED`. `CABINET_ACCEPTANCE_TRANSPORT=deliberate-failure` proves
that a conversation failure blocks only dependent stages. The final
integration selects `CABINET_ACCEPTANCE_TRANSPORT=acp`; that transport drives
Cabinet's real conversation routes and records the actual number of initial
and continuation requests.

The harness assigns browser issues to the active stage. A typed HTTP-200
unavailable health projection remains visible in the report without becoming
an application error. Unreadable projections, HTTP 5xx failures, page errors,
and unrelated console errors remain acceptance failures.

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
