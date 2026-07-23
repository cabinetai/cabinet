# Production acceptance harness

Run from the repository root:

```bash
node scripts/production-acceptance/run.mjs
```

The runner:

- refuses to run when application/shared runtime files differ from `origin/main`;
- builds the production app when `.next/BUILD_ID` is absent;
- uses isolated temporary `HOME` and `CABINET_DATA_DIR` roots;
- binds only to `127.0.0.1:4207`;
- defaults to the registered `fixture-non-model` transport;
- sends no live model messages and performs no governed Skill mutation;
- writes `acceptance-result.json`, `report.md`, `result.json`,
  `screenshot-manifest.json`, and screenshots under
  `docs/research/parallel/acceptance-harness/`.

The fixture transport only proves runner orchestration. It cannot make the
verdict `ACCEPTED`. A live transport must be explicitly implemented and
registered only after it passes the separate mandatory live gate.

If a bounded browser run is interrupted, preserve the partial artifacts and
mark the unexecuted areas honestly:

```bash
node scripts/production-acceptance/finalize-interrupted.mjs
```

Use `harness-preflight.spec.ts` to verify the isolated fixture can bypass
onboarding/tour overlays and interact with the room drawers before a full run.
