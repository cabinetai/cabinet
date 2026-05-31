import type { Command } from "commander";
import fs from "fs";
import path from "path";
import { log, success, dim } from "../lib/log.js";
import { CABINET_HOME, telemetryDir } from "../lib/paths.js";
import { listInstalledVersions } from "../lib/app-manager.js";
import { confirm } from "../lib/prompt.js";

export function registerUninstall(program: Command): void {
  program
    .command("uninstall")
    .alias("remove")
    .description("Remove cached app versions from ~/.cabinet")
    .option("--all", "Also remove global state, config, and telemetry data")
    .option("-y, --yes", "Skip the confirmation prompt")
    .action(async (opts: { all?: boolean; yes?: boolean }) => {
      await uninstall(opts);
    });
}

async function uninstall(opts: { all?: boolean; yes?: boolean }): Promise<void> {
  const cabinetExists = fs.existsSync(CABINET_HOME);
  const telemetry = telemetryDir();
  const telemetryExists = fs.existsSync(telemetry);

  if (opts.all) {
    if (!cabinetExists && !telemetryExists) {
      success("Nothing to remove.");
      return;
    }
  } else {
    if (!cabinetExists) {
      success("Nothing to remove — ~/.cabinet does not exist.");
      return;
    }
  }

  const versions = cabinetExists ? listInstalledVersions() : [];

  if (!opts.all && versions.length === 0) {
    success("No cached app versions found.");
    return;
  }

  console.log("");
  log(opts.all ? "Cabinet uninstall (--all)" : "Cabinet uninstall");
  console.log("");
  console.log("  This will delete:");

  if (opts.all) {
    if (cabinetExists) {
      dim(`${CABINET_HOME}`);
      const parts: string[] = [];
      if (versions.length > 0) {
        parts.push(`${versions.length} cached app version${versions.length !== 1 ? "s" : ""} (${versions.join(", ")})`);
      }
      parts.push("global state");
      parts.push("config.json");
      dim(`  ${parts.join(", ")}`);
    }
    if (telemetryExists) {
      dim(`${telemetry}`);
      dim(`  anonymous install_id, telemetry queue, session state`);
    }
  } else {
    dim(`${path.join(CABINET_HOME, "app")}`);
    dim(`  cached app version${versions.length !== 1 ? "s" : ""}: ${versions.join(", ")}`);
  }

  console.log("");
  console.log("  Your cabinet directories and their data are never touched —");
  console.log("  those you'd delete manually.");
  console.log("");

  if (!opts.yes) {
    const ok = await confirm("Continue?");
    if (!ok) {
      log("Aborted.");
      return;
    }
  }

  if (opts.all) {
    if (cabinetExists) {
      fs.rmSync(CABINET_HOME, { recursive: true, force: true });
      log(`Removed ${CABINET_HOME}`);
    }
    if (telemetryExists) {
      fs.rmSync(telemetry, { recursive: true, force: true });
      log(`Removed ${telemetry}`);
    }
    success("Cabinet uninstalled. Your cabinet directories and data are untouched.");
    return;
  }

  const appDir = path.join(CABINET_HOME, "app");
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });

  success(`Removed ${versions.length} cached app version${versions.length !== 1 ? "s" : ""}: ${versions.join(", ")}`);
  log("Next 'npx cabinetai run' will re-download the app.");
}
