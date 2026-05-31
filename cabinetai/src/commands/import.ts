import type { Command } from "commander";
import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";
import { log, success, warning, error } from "../lib/log.js";
import { findCabinetRoot, CABINET_MANIFEST } from "../lib/paths.js";

const REGISTRY_REPO = "https://github.com/hilash/cabinets";

export function registerImport(program: Command): void {
  program
    .command("import <template>")
    .description("Import a cabinet template from the registry")
    .action(async (template: string) => {
      try {
        await importTemplate(template);
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
      }
    });
}

async function importTemplate(template: string): Promise<void> {
  const slug = template.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!slug) {
    error(`Invalid template name: "${template}"`);
  }
  const targetDir = path.resolve(process.cwd(), slug);

  if (fs.existsSync(targetDir)) {
    error(`Directory "${slug}" already exists.`);
  }

  log(`Importing template "${template}" from registry...`);

  // Download the registry repo
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-import-"));

  try {
    // Clone the registry repo (sparse checkout of just the template dir)
    log("Fetching registry...");
    const cloneResult = spawnSync(
      "git",
      ["clone", "--depth", "1", "--filter=blob:none", "--sparse", `${REGISTRY_REPO}.git`, "registry"],
      { cwd: tempDir, stdio: "pipe" }
    );

    if (cloneResult.status !== 0) {
      const stderr = cloneResult.stderr?.toString() || "";
      error(`Failed to fetch registry: ${stderr.trim()}`);
    }

    const registryDir = path.join(tempDir, "registry");

    // Set sparse checkout to just the template directory
    spawnSync("git", ["sparse-checkout", "set", slug], {
      cwd: registryDir,
      stdio: "pipe",
    });

    const templateSource = path.join(registryDir, slug);

    if (!fs.existsSync(templateSource) || !fs.existsSync(path.join(templateSource, CABINET_MANIFEST))) {
      // Try looking in subdirectories (the registry might have a flat or nested layout)
      const available = findAvailableTemplates(registryDir);
      if (available.length > 0) {
        console.log("");
        warning(`Template "${template}" not found.`);
        console.log("  Available templates:");
        for (const t of available) {
          console.log(`    - ${t}`);
        }
        console.log("");
      } else {
        error(`Template "${template}" not found in the registry.`);
      }
      return;
    }

    // Copy template to target
    log(`Installing template to ./${slug}/...`);
    fs.cpSync(templateSource, targetDir, { recursive: true });

    // Remove any .git artifacts from the copy
    const gitDir = path.join(targetDir, ".git");
    if (fs.existsSync(gitDir)) {
      fs.rmSync(gitDir, { recursive: true, force: true });
    }

    success(`Template "${template}" imported to ./${slug}/`);

    const cabinetRoot = findCabinetRoot(process.cwd());
    if (cabinetRoot) {
      console.log(`\n  Imported as a sub-cabinet of ${cabinetRoot}`);
    }

    console.log(`
  Next steps:

    cd ${slug}
    npx cabinetai run
`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function findAvailableTemplates(registryDir: string): string[] {
  // Re-clone without sparse to list templates
  // For now, just return empty — full clone is expensive
  try {
    const entries = fs.readdirSync(registryDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith("."))
      .filter(e => fs.existsSync(path.join(registryDir, e.name, CABINET_MANIFEST)))
      .map(e => e.name);
  } catch {
    return [];
  }
}
