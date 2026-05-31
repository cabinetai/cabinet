import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { CABINET_MANIFEST } from "./paths.js";

export interface CabinetManifest {
  schemaVersion: number;
  id: string;
  name: string;
  kind: "root" | "child";
  version: string;
  description: string;
  entry: string;
  parent?: {
    shared_context?: string[];
  };
  access?: {
    mode?: string;
  };
}

/**
 * Read and parse a .cabinet YAML file from a directory.
 * Returns null if the file doesn't exist.
 */
export function readCabinetManifest(dir: string): CabinetManifest | null {
  const manifestPath = path.join(dir, CABINET_MANIFEST);
  if (!fs.existsSync(manifestPath)) return null;

  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = yaml.load(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") return null;

  return {
    schemaVersion: (parsed.schemaVersion as number) || 1,
    id: (parsed.id as string) || "",
    name: (parsed.name as string) || path.basename(dir),
    kind: (parsed.kind as "root" | "child") || "root",
    version: (parsed.version as string) || "0.1.0",
    description: (parsed.description as string) || "",
    entry: (parsed.entry as string) || "index.md",
    parent: parsed.parent as CabinetManifest["parent"],
    access: parsed.access as CabinetManifest["access"],
  };
}

/**
 * Write a .cabinet YAML file to a directory.
 */
export function writeCabinetManifest(dir: string, manifest: CabinetManifest): void {
  const manifestPath = path.join(dir, CABINET_MANIFEST);

  // Build YAML content manually for clean formatting
  const lines: string[] = [
    `schemaVersion: ${manifest.schemaVersion}`,
    `id: ${manifest.id}`,
    `name: ${manifest.name}`,
    `kind: ${manifest.kind}`,
    `version: ${manifest.version}`,
    `description: ${manifest.description || ""}`,
    `entry: ${manifest.entry}`,
  ];

  if (manifest.parent?.shared_context?.length) {
    lines.push("");
    lines.push("parent:");
    lines.push("  shared_context:");
    for (const ctx of manifest.parent.shared_context) {
      lines.push(`    - ${ctx}`);
    }
  }

  if (manifest.access?.mode) {
    lines.push("");
    lines.push("access:");
    lines.push(`  mode: ${manifest.access.mode}`);
  }

  fs.writeFileSync(manifestPath, lines.join("\n") + "\n", "utf8");
}

/**
 * Recursively discover all .cabinet files under a directory.
 * Returns relative paths from the root directory.
 */
export function discoverCabinets(rootDir: string): string[] {
  const results: string[] = [];

  // Check if root itself is a cabinet
  if (fs.existsSync(path.join(rootDir, CABINET_MANIFEST))) {
    results.push(".");
  }

  walkForCabinets(rootDir, rootDir, results);
  return results;
}

function walkForCabinets(baseDir: string, currentDir: string, results: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;

    const fullPath = path.join(currentDir, entry.name);
    const manifestPath = path.join(fullPath, CABINET_MANIFEST);

    if (fs.existsSync(manifestPath)) {
      const relativePath = path.relative(baseDir, fullPath);
      results.push(relativePath);
    }

    // Continue walking into subdirectories
    walkForCabinets(baseDir, fullPath, results);
  }
}

/**
 * Count agents in a cabinet directory.
 */
export function countAgents(cabinetDir: string): number {
  const agentsDir = path.join(cabinetDir, ".agents");
  if (!fs.existsSync(agentsDir)) return 0;

  try {
    return fs.readdirSync(agentsDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith("."))
      .filter(e => fs.existsSync(path.join(agentsDir, e.name, "persona.md")))
      .length;
  } catch {
    return 0;
  }
}

/**
 * Count jobs in a cabinet directory.
 */
export function countJobs(cabinetDir: string): number {
  const jobsDir = path.join(cabinetDir, ".jobs");
  if (!fs.existsSync(jobsDir)) return 0;

  try {
    return fs.readdirSync(jobsDir)
      .filter(f => f.endsWith(".yaml") || f.endsWith(".yml"))
      .length;
  } catch {
    return 0;
  }
}
