import fs from "fs";
import os from "os";
import path from "path";
import { ensureDir, findCabinetRoot, slugify } from "./paths.js";
import {
  writeCabinetManifest,
  type CabinetManifest,
} from "./cabinet-manifest.js";

export interface ScaffoldCabinetDirOptions {
  targetDir: string;
  name: string;
  kind: "root" | "child";
  preserveIndex?: boolean;
}

export interface ResolvedCabinetRoot {
  cabinetDir: string;
  name: string;
  bootstrapped: boolean;
  /**
   * The directory the user started from (typically process.cwd()).
   * When upward traversal found a parent `.cabinet`, `cabinetDir !== startedFrom`
   * and the caller can warn the user that an existing cabinet was reused
   * instead of treating their current dir as a fresh cabinet.
   */
  startedFrom: string;
  /** True when findCabinetRoot walked up to an ancestor, not cwd itself. */
  resolvedFromAncestor: boolean;
}

function buildCabinetManifest(
  name: string,
  kind: "root" | "child"
): CabinetManifest {
  const slug = slugify(name) || "cabinet";
  const manifest: CabinetManifest = {
    schemaVersion: 1,
    id: slug,
    name,
    kind,
    version: "0.1.0",
    description: "",
    entry: "index.md",
  };

  if (kind === "child") {
    manifest.parent = {
      shared_context: [],
    };
    manifest.access = {
      mode: "subtree-plus-parent-brief",
    };
  }

  return manifest;
}

export function inferCabinetName(targetDir: string): string {
  const base = path.basename(path.resolve(targetDir)).trim();
  if (!base || base === path.parse(targetDir).root) {
    return "Cabinet";
  }

  return base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function scaffoldCabinetDir(
  options: ScaffoldCabinetDirOptions
): CabinetManifest {
  const {
    targetDir,
    name,
    kind,
    preserveIndex = false,
  } = options;

  ensureDir(targetDir);
  ensureDir(path.join(targetDir, ".agents"));
  ensureDir(path.join(targetDir, ".jobs"));
  ensureDir(path.join(targetDir, ".cabinet-state"));

  const manifest = buildCabinetManifest(name, kind);
  writeCabinetManifest(targetDir, manifest);

  const indexPath = path.join(targetDir, "index.md");
  if (!preserveIndex || !fs.existsSync(indexPath)) {
    const now = new Date().toISOString();
    const indexContent = [
      "---",
      `title: ${name}`,
      `created: '${now}'`,
      `modified: '${now}'`,
      "tags: []",
      "order: 1",
      "---",
      "",
      `# ${name}`,
      "",
    ].join("\n");

    fs.writeFileSync(indexPath, indexContent, "utf8");
  }

  return manifest;
}

export function resolveCabinetRoot(
  startDir = process.cwd()
): { cabinetDir: string; startedFrom: string; resolvedFromAncestor: boolean } | null {
  const startedFrom = path.resolve(startDir);
  const cabinetDir = findCabinetRoot(startedFrom);
  if (!cabinetDir) return null;
  return {
    cabinetDir,
    startedFrom,
    resolvedFromAncestor: path.resolve(cabinetDir) !== startedFrom,
  };
}

function refuseBootstrap(label: string, resolved: string): never {
  // Bootstrapping into HOME or filesystem root scribbles .agents/, .jobs/,
  // .cabinet-state/, .cabinet, and index.md across the user's most important
  // directory — and then crashes with ENOTDIR when ensureCabinetHome() tries
  // to mkdir ~/.cabinet/app on top of the .cabinet manifest file. Refuse
  // before scaffolding anything.
  process.stderr.write(
    `\x1b[31m✗\x1b[0m Refusing to create a cabinet in ${label} (${resolved}).\n` +
      `  Cabinet indexes every supported file under the cabinet directory and\n` +
      `  would scaffold .agents/, .jobs/, .cabinet-state/, .cabinet, and index.md here.\n\n` +
      `  Recommended: pick a fresh empty folder, e.g. ~/Documents/Cabinet:\n` +
      `    mkdir -p ~/Documents/Cabinet && cd ~/Documents/Cabinet && npx cabinetai run\n\n` +
      `  Or point at a specific directory with --data-dir:\n` +
      `    npx cabinetai run --data-dir ~/Documents/Cabinet\n`
  );
  process.exit(1);
}

function assertSafeBootstrapTarget(resolved: string): void {
  if (resolved === path.resolve(os.homedir())) {
    refuseBootstrap("your home directory", resolved);
  }
  if (resolved === path.parse(resolved).root) {
    refuseBootstrap("the filesystem root", resolved);
  }
}

export function bootstrapCabinetAt(targetDir: string): ResolvedCabinetRoot {
  const resolved = path.resolve(targetDir);
  assertSafeBootstrapTarget(resolved);
  const name = inferCabinetName(resolved);
  scaffoldCabinetDir({
    targetDir: resolved,
    name,
    kind: "root",
    preserveIndex: true,
  });
  return {
    cabinetDir: resolved,
    name,
    bootstrapped: true,
    startedFrom: resolved,
    resolvedFromAncestor: false,
  };
}

export function resolveOrBootstrapCabinetRoot(
  startDir = process.cwd()
): ResolvedCabinetRoot {
  const startedFrom = path.resolve(startDir);
  const found = resolveCabinetRoot(startedFrom);
  if (found) {
    return {
      cabinetDir: found.cabinetDir,
      name: inferCabinetName(found.cabinetDir),
      bootstrapped: false,
      startedFrom,
      resolvedFromAncestor: found.resolvedFromAncestor,
    };
  }
  return bootstrapCabinetAt(startedFrom);
}
