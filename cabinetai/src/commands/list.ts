import type { Command } from "commander";
import path from "path";
import { warning } from "../lib/log.js";
import { findCabinetRoot } from "../lib/paths.js";
import {
  discoverCabinets,
  readCabinetManifest,
  countAgents,
  countJobs,
} from "../lib/cabinet-manifest.js";

export function registerList(program: Command): void {
  program
    .command("list")
    .description("List all cabinets in the current directory")
    .action(() => {
      listCabinets();
    });
}

function listCabinets(): void {
  const cabinetRoot = findCabinetRoot();
  const searchDir = cabinetRoot || process.cwd();

  const cabinetPaths = discoverCabinets(searchDir);

  if (cabinetPaths.length === 0) {
    warning("No cabinets found in this directory.");
    console.log('  Run "cabinetai create <name>" to create one.');
    return;
  }

  // Collect data for each cabinet
  const rows: { name: string; kind: string; path: string; agents: number; jobs: number }[] = [];

  for (const relPath of cabinetPaths) {
    const fullPath = relPath === "." ? searchDir : path.join(searchDir, relPath);
    const manifest = readCabinetManifest(fullPath);
    if (!manifest) continue;

    rows.push({
      name: manifest.name,
      kind: manifest.kind,
      path: relPath,
      agents: countAgents(fullPath),
      jobs: countJobs(fullPath),
    });
  }

  if (rows.length === 0) {
    warning("No valid cabinet manifests found.");
    return;
  }

  // Calculate column widths
  const cols = {
    name: Math.max(4, ...rows.map(r => r.name.length)),
    kind: Math.max(4, ...rows.map(r => r.kind.length)),
    path: Math.max(4, ...rows.map(r => r.path.length)),
    agents: 6,
    jobs: 4,
  };

  // Print header
  const header = [
    "Name".padEnd(cols.name),
    "Kind".padEnd(cols.kind),
    "Path".padEnd(cols.path),
    "Agents".padEnd(cols.agents),
    "Jobs".padEnd(cols.jobs),
  ].join("  ");

  const separator = [
    "─".repeat(cols.name),
    "─".repeat(cols.kind),
    "─".repeat(cols.path),
    "─".repeat(cols.agents),
    "─".repeat(cols.jobs),
  ].join("  ");

  console.log("");
  console.log(`  ${header}`);
  console.log(`  ${separator}`);

  for (const row of rows) {
    const line = [
      row.name.padEnd(cols.name),
      row.kind.padEnd(cols.kind),
      row.path.padEnd(cols.path),
      String(row.agents).padEnd(cols.agents),
      String(row.jobs).padEnd(cols.jobs),
    ].join("  ");
    console.log(`  ${line}`);
  }

  console.log("");
}
