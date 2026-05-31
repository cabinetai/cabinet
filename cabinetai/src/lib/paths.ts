import path from "path";
import os from "os";
import fs from "fs";

/** Global Cabinet home directory: ~/.cabinet/ */
export const CABINET_HOME = path.join(os.homedir(), ".cabinet");

/** Directory where version-pinned app installs live */
export function appVersionDir(version: string): string {
  const clean = validateVersion(version);
  return path.join(CABINET_HOME, "app", `v${clean}`);
}

/** Global state directory */
export function stateDir(): string {
  return path.join(CABINET_HOME, "state");
}

/** Global config file path */
export function globalConfigPath(): string {
  return path.join(CABINET_HOME, "config.json");
}

/**
 * Telemetry directory. Mirrors src/lib/telemetry/paths.ts so the CLI can clean
 * up the same location the running app writes to.
 */
export function telemetryDir(): string {
  const override = process.env.CABINET_TELEMETRY_DIR?.trim();
  if (override) return path.resolve(override);
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "cabinet-telemetry");
  }
  if (process.platform === "win32") {
    const roaming = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(roaming, "cabinet-telemetry");
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdgConfig, "cabinet");
}

/** The .cabinet manifest filename */
export const CABINET_MANIFEST = ".cabinet";

/** Strict semver pattern for version strings. */
const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

/**
 * Validate a version string is strict semver (no path traversal, no flags).
 * Strips leading "v" before checking.
 */
export function validateVersion(version: string): string {
  const cleaned = version.replace(/^v/, "");
  if (!SEMVER_RE.test(cleaned)) {
    throw new Error(`Invalid version: "${version}". Expected format: X.Y.Z`);
  }
  return cleaned;
}

/**
 * Walk up from startDir looking for a .cabinet file.
 * Returns the directory containing it, or null if not found.
 */
export function findCabinetRoot(startDir?: string): string | null {
  let dir = path.resolve(startDir || process.cwd());
  const root = path.parse(dir).root;

  while (true) {
    const manifestPath = path.join(dir, CABINET_MANIFEST);
    if (fs.existsSync(manifestPath)) {
      // Verify it's a file, not a directory (though .cabinet should be a file)
      const stat = fs.statSync(manifestPath);
      if (stat.isFile()) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === root) return null;
    dir = parent;
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Ensure CABINET_HOME exists with the expected subdirectory structure.
 */
export function ensureCabinetHome(): void {
  ensureDir(path.join(CABINET_HOME, "app"));
  ensureDir(path.join(CABINET_HOME, "state"));
}

/**
 * Slugify a name for use as a directory name.
 * Lowercase, hyphens, strip special chars.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
