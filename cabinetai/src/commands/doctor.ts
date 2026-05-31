import type { Command } from "commander";
import { success, warning } from "../lib/log.js";
import { runAllChecks, type CheckResult } from "../lib/health-checks.js";
import { VERSION } from "../version.js";

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Run health checks on the Cabinet environment")
    .option("--quiet", "Suppress output, auto-fix only")
    .option("--fix", "Attempt to fix all fixable issues")
    .action(async (opts: { quiet?: boolean; fix?: boolean }) => {
      await runDoctor(opts);
    });
}

async function runDoctor(opts: { quiet?: boolean; fix?: boolean }): Promise<void> {
  const { checks, asyncChecks } = runAllChecks(VERSION);
  const resolvedAsync = await Promise.all(asyncChecks);
  const allChecks = [...checks, ...resolvedAsync];

  if (!opts.quiet) {
    console.log("\n  Cabinet Doctor\n");
  }

  let hasFailures = false;
  let hasWarnings = false;

  for (const check of allChecks) {
    if (check.status === "fail") hasFailures = true;
    if (check.status === "warn") hasWarnings = true;

    if (!opts.quiet) {
      printCheck(check);
    }

    if (opts.fix && check.fix && check.status !== "pass") {
      if (!opts.quiet) {
        console.log(`    Fixing...`);
      }
      check.fix();
    }
  }

  if (!opts.quiet) {
    console.log("");
    if (hasFailures) {
      warning("Some checks failed. Run with --fix to attempt auto-repair.");
    } else if (hasWarnings) {
      warning("Some warnings. Cabinet should still work.");
    } else {
      success("All checks passed.");
    }
    console.log("");
  }

  if (hasFailures && !opts.fix) {
    process.exitCode = 1;
  }
}

function printCheck(check: CheckResult): void {
  const icon =
    check.status === "pass"
      ? "\x1b[32m✓\x1b[0m"
      : check.status === "warn"
        ? "\x1b[33m!\x1b[0m"
        : "\x1b[31m✗\x1b[0m";

  console.log(`  ${icon} ${check.name}: ${check.message}`);
}
