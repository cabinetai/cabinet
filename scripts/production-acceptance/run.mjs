#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const outputDir = path.resolve(
  process.env.CABINET_ACCEPTANCE_OUTPUT_DIR ??
    "docs/research/parallel/acceptance-harness"
);
const acceptanceBaseRef =
  process.env.CABINET_ACCEPTANCE_BASE_REVISION ?? "origin/main";

function run(command, args, extraEnv = {}, allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) process.exit(result.status ?? 1);
  return result.status ?? 1;
}

const base = spawnSync("git", ["rev-parse", acceptanceBaseRef], {
  cwd: repoRoot,
  encoding: "utf8",
});
if (base.status !== 0) process.exit(base.status ?? 1);
const acceptanceBaseRevision = base.stdout.trim();
const changedApplication = spawnSync(
  "git",
  [
    "diff",
    "--name-only",
    acceptanceBaseRevision,
    "--",
    "src",
    "server",
    "electron",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "playwright.config.ts",
  ],
  { cwd: repoRoot, encoding: "utf8" }
);
const allowIntegrationDiff =
  process.env.CABINET_ACCEPTANCE_ALLOW_INTEGRATION_DIFF === "1";
if (changedApplication.stdout.trim() && !allowIntegrationDiff) {
  process.stderr.write(
    `Refusing acceptance: application/shared runtime differs from exact base ${acceptanceBaseRevision}.\n`
  );
  process.exit(2);
}
if (allowIntegrationDiff) {
  const branch = spawnSync("git", ["branch", "--show-current"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (branch.status !== 0 || branch.stdout.trim() !== "fix/acp-exact-response-final-v2") {
    process.stderr.write(
      "Refusing integration acceptance outside fix/acp-exact-response-final-v2.\n",
    );
    process.exit(2);
  }
}

if (!fs.existsSync(path.join(repoRoot, ".next/BUILD_ID")) || process.argv.includes("--build")) {
  run("npm", ["run", "build"]);
}

const playwrightStatus = run(
  "npx",
  [
    "playwright",
    "test",
    "e2e/production-acceptance/production-acceptance.spec.ts",
    "--workers=1",
    "--reporter=list",
  ],
  {
    CABINET_ACCEPTANCE_OUTPUT_DIR: outputDir,
    CABINET_ACCEPTANCE_BASE_REVISION: acceptanceBaseRevision,
    CABINET_ACCEPTANCE_TRANSPORT:
      process.env.CABINET_ACCEPTANCE_TRANSPORT ?? "fixture",
    CABINET_ACCEPTANCE_SKILLS_MODE:
      process.env.CABINET_ACCEPTANCE_SKILLS_MODE ?? "fixture",
    CABINET_ACCEPTANCE_PORT:
      process.env.CABINET_ACCEPTANCE_PORT ?? "4343",
    CABINET_ACCEPTANCE_BROWSER_PATH:
      process.env.CABINET_ACCEPTANCE_BROWSER_PATH ?? "in-app Browser preflight plus Playwright authoritative runner",
    CABINET_ACCEPTANCE_ISOLATED: "1",
    CABINET_ACCEPTANCE_OBSERVABILITY: "1",
  },
  true
);

const resultPath = path.join(outputDir, "acceptance-result.json");
if (!fs.existsSync(resultPath)) {
  process.stderr.write(`Acceptance runner exited ${playwrightStatus} without a result artifact.\n`);
  process.exit(playwrightStatus || 1);
}
const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
process.stdout.write(`\n${result.verdict}\n${resultPath}\n`);
if (result.verdict !== "ACCEPTED") process.exitCode = 3;
