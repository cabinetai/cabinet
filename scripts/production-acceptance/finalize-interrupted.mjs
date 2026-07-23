#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const outputDir = path.resolve(
  process.env.CABINET_ACCEPTANCE_OUTPUT_DIR ??
    "docs/research/parallel/acceptance-harness"
);
const resultPath = path.join(outputDir, "acceptance-result.json");
const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));

const requiredChecks = [
  ["route-manifest", "routes"],
  ["desktop-navigation", "navigation"],
  ["drawers-data-team", "drawers"],
  ["new-composer", "new"],
  ["search-terminal-unavailable", "availability"],
  ["tasks-route", "tasks"],
  ["primary-application-routes", "routes"],
  ["org-chart", "organization"],
  ["org-chart-trigger-present", "organization"],
  ["org-chart-trigger-enabled", "organization"],
  ["org-chart-trigger-click", "organization"],
  ["org-chart-dialog", "organization"],
  ["org-chart-bounds-and-close", "organization"],
  ["operator-mode", "Hermes"],
  ["governed-skills", "Skills"],
  ["hermes-operator-sections", "Hermes"],
  ["developer-diagnostics-48", "Developer"],
  ["fixture-two-turn-contract", "conversation"],
  ["live-two-turn-contract", "conversation"],
  ["conversation-direct-reload-persistence", "conversation"],
  ["restart-route-persistence", "restart"],
  ["launchd-child-restart", "supervision"],
  ["history-navigation", "navigation"],
  ["mobile-reduced-motion-overflow", "responsive"],
  ["legacy-daemon-output-accounting", "network"],
  ["complete-route-inventory", "routes"],
  ["console-health", "browser"],
  ["mutation-accounting", "safety"],
];

const checks = new Map(result.checks.map((check) => [check.id, check]));
for (const [id, area] of requiredChecks) {
  if (!checks.has(id)) {
    checks.set(id, {
      id,
      area,
      status: "not_run",
      summary: "Not run because the bounded acceptance process was interrupted.",
    });
  }
}
result.checks = [...checks.values()];

if (!result.blockers.some((blocker) => blocker.id === "acceptance-run-interrupted")) {
  result.blockers.push({
    id: "acceptance-run-interrupted",
    area: "harness",
    summary:
      "The bounded acceptance process was interrupted; completed checks are preserved and remaining checks are NOT_RUN.",
    reproduction: [
      "Inspect the last completed check in acceptance-result.json.",
      "Rerun the fixture-only acceptance process with the same tested base.",
    ],
    ownerHint: "acceptance harness",
  });
}

result.verdict = "NOT_ACCEPTED";
result.generatedAt = new Date().toISOString();
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");

const rows = result.checks
  .map(
    (check) =>
      `| ${check.area} | ${check.id} | ${check.status.toUpperCase()} | ${check.summary.replaceAll("|", "\\|")} |`
  )
  .join("\n");
const blockers = result.blockers
  .map((blocker) => `- \`${blocker.id}\`: ${blocker.summary}`)
  .join("\n");
const report = `# Production acceptance harness

Verdict: **NOT_ACCEPTED**

This bounded, isolated run was interrupted. Completed checks retain their
recorded status; checks that did not begin are marked **NOT_RUN**, not failed.

## Checks

| Area | Check | Status | Result |
| --- | --- | --- | --- |
${rows}

## Exact blockers

${blockers}

## Accounting from the completed portion

- Requests: ${result.network.total}
- Mutations observed in isolated state: ${result.network.mutations}
- Legacy daemon-output requests: ${result.network.legacyDaemonOutputRequests}
- Search requests: ${result.network.searchRequests}
- PTY create/write requests: ${result.network.ptyCreateOrWriteRequests}
- Live model message requests: ${result.network.modelMessageRequests ?? 0}
- Consequential Hermes mutations: ${result.network.consequentialHermesMutations ?? 0}
- Production touched: false
`;
fs.writeFileSync(path.join(outputDir, "report.md"), report);
process.stdout.write(`${resultPath}\n`);
