import type { Command } from "commander";
import fs from "fs";
import path from "path";
import { log, success, warning, error } from "../lib/log.js";
import { confirm } from "../lib/prompt.js";
import { CABINET_MANIFEST, findCabinetRoot } from "../lib/paths.js";

export function registerResetConfig(program: Command): void {
  program
    .command("reset-config")
    .description(
      "Forget the current cabinet binding by removing the .cabinet manifest. " +
        "Content stays — only the marker file is deleted, so the next `cabinetai run` " +
        "treats this directory as a fresh location."
    )
    .option(
      "-y, --yes",
      "Don't prompt for confirmation (use in scripts; default is interactive)"
    )
    .action(async (opts: { yes?: boolean }) => {
      try {
        await resetConfig(opts);
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
      }
    });
}

async function resetConfig(opts: { yes?: boolean }): Promise<void> {
  const cwd = process.cwd();
  const cabinetDir = findCabinetRoot(cwd);
  if (!cabinetDir) {
    log(`No .cabinet manifest found from ${cwd} upward — nothing to reset.`);
    return;
  }

  const manifestPath = path.join(cabinetDir, CABINET_MANIFEST);
  console.log("");
  warning("This will remove the cabinet manifest:");
  console.log(`    ${manifestPath}`);
  console.log("");
  console.log(
    `  Your content (${cabinetDir}) stays untouched — only the marker file is deleted.\n` +
      "  After reset, the next `cabinetai run` will treat your cwd as a fresh location\n" +
      "  (and either find a different ancestor cabinet, or bootstrap a new one)."
  );
  console.log("");

  const ok = opts.yes ? true : await confirm("Remove the manifest?", false);
  if (!ok) {
    log("Cancelled — nothing changed.");
    return;
  }

  try {
    fs.unlinkSync(manifestPath);
    success(`Removed ${manifestPath}`);
    log(
      `Cabinet at ${cabinetDir} is no longer bound. Run \`cabinetai run --data-dir <path>\` ` +
        `to bind a different directory, or \`cabinetai run\` to bootstrap from your cwd.`
    );
  } catch (err) {
    error(
      `Failed to remove ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
