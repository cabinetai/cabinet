#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const outputDir = path.resolve(
  process.env.CABINET_ACCEPTANCE_OUTPUT_DIR ??
    "docs/research/parallel/acceptance-harness"
);
const resultPath = path.join(outputDir, "acceptance-result.json");
const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));

const requiredNotRun = [
  ["operator-mode", "Hermes", "Operator mode was not reached after the bounded Org chart locator timeout."],
  ["governed-skills", "Skills", "Governed Skills was not reached after the bounded Org chart locator timeout."],
  ["developer-diagnostics-48", "Developer", "The 48-row diagnostic assertion was not reached after the bounded Org chart locator timeout."],
  ["fixture-two-turn-contract", "conversation", "The non-model runner contract was not reached after the bounded Org chart locator timeout."],
  ["live-two-turn-contract", "conversation", "No transport passed the mandatory live gate; zero live model messages were sent."],
  ["restart-route-persistence", "restart", "Isolated restart persistence was not reached after the bounded Org chart locator timeout."],
  ["launchd-child-restart", "supervision", "Production launchd child recovery was not exercised from the isolated harness."],
  ["history-navigation", "navigation", "Back/forward coverage was not reached after the bounded Org chart locator timeout."],
  ["mobile-reduced-motion-overflow", "responsive", "Mobile and reduced-motion coverage was not reached after the bounded Org chart locator timeout."],
  ["legacy-daemon-output-accounting", "network", "Direct conversation/reload network accounting was not reached."],
  ["console-health", "browser", "End-to-end console health could not be concluded from the interrupted run."],
];

const checks = new Map(result.checks.map((check) => [check.id, check]));
for (const [id, area, summary] of requiredNotRun) {
  const existing = checks.get(id);
  if (!existing || existing.summary.includes("Target page, context or browser has been closed")) {
    checks.set(id, { id, area, status: "not_run", summary });
  }
}
if (checks.has("org-chart")) {
  checks.set("org-chart", {
    id: "org-chart",
    area: "organization",
    status: "blocked",
    summary:
      "Harness timed out locating Org chart on the isolated Team route; product behavior was not established.",
  });
}
result.checks = [...checks.values()];
result.blockers = [
  {
    id: "acceptance-run-incomplete-org-chart-locator",
    area: "harness",
    summary:
      "The bounded exact-main run stopped at the Org chart locator, leaving later acceptance areas not run.",
    reproduction: [
      "Open the isolated Team route.",
      "Resolve the current Org chart trigger contract.",
      "Rerun with per-action timeouts.",
    ],
    ownerHint: "acceptance harness",
  },
  {
    id: "no-live-transport-passed-mandatory-gate",
    area: "conversation",
    summary:
      "The exact live two-turn conversation, same-session resume, and live persistence are blocked.",
    reproduction: [
      "Register only a transport that passes the mandatory live gate.",
      "Run the exact initial prompt and follow-up serially.",
      "Verify the same live session after reload, direct URL, and restart.",
    ],
    ownerHint: "transport integration coordinator",
  },
  {
    id: "launchd-child-restart-not-proven",
    area: "supervision",
    summary:
      "The production supervised wrapper is not proven to recover after the Next child exits.",
    reproduction: [
      "Run the production-only supervision acceptance after the supervision fix.",
      "Terminate only the Next child.",
      "Verify an automatic healthy replacement.",
    ],
    ownerHint: "supervision stabilization stream",
  },
];
result.verdict = "NOT_ACCEPTED";
result.generatedAt = new Date().toISOString();
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");

const rows = result.checks
  .map(
    (check) =>
      `| ${check.area} | ${check.id} | ${check.status.toUpperCase()} | ${check.summary.replaceAll("|", "\\|")} |`
  )
  .join("\n");
const report = `# Production acceptance harness

Verdict: **NOT_ACCEPTED**

This was a bounded, isolated exact-main run on port 4207. It sent zero live model messages and did not touch production or canonical data.

## Result boundary

Six browser checks completed before the run stopped at the Org chart locator. Later areas are marked **NOT_RUN**. They are harness incompleteness, not product failures. The mandatory live-transport gate and production launchd child recovery independently block acceptance.

## Checks

| Area | Check | Status | Result |
| --- | --- | --- | --- |
${rows}

## Exact blockers

- \`acceptance-run-incomplete-org-chart-locator\`: the harness stopped before later areas could run.
- \`no-live-transport-passed-mandatory-gate\`: live two-turn, resume, and persistence are unproven.
- \`launchd-child-restart-not-proven\`: production child recovery is unproven.

## Accounting from the completed portion

- Requests: ${result.network.total}
- Mutations observed in isolated state: ${result.network.mutations}
- Legacy daemon-output requests: ${result.network.legacyDaemonOutputRequests}
- Search requests: ${result.network.searchRequests}
- PTY create/write requests: ${result.network.ptyCreateOrWriteRequests}
- Live model messages: 0

## Recommendation

Resolve the Org chart trigger contract, integrate only a transport that passes the mandatory live gate, then rerun the bounded harness with per-action timeouts after stabilization.
`;
fs.writeFileSync(path.join(outputDir, "report.md"), report);
fs.writeFileSync(
  path.join(outputDir, "result.json"),
  JSON.stringify(
    {
      stream: "acceptance-harness",
      status: "blocked",
      branch: result.branch,
      commit: null,
      merge_candidate: true,
      tests: Object.fromEntries(result.checks.map((check) => [check.id, check.status])),
      blockers: result.blockers.map((blocker) => blocker.summary),
      recommendation:
        "Resolve the harness Org chart locator, integrate only a mandatory-gate transport, and rerun after stabilization.",
      production_touched: false,
    },
    null,
    2
  ) + "\n"
);
