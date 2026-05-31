import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { BACKUP_ROOT, DATA_DIR } from "@/lib/storage/path-utils";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";

const PROJECT_BACKUP_IGNORES = new Set([
  ".git",
  ".next",
  "node_modules",
  ".cabinet-backups",
  "out",
  "dist",
  "coverage",
]);

const ENV_FILE_NAME = ".cabinet.env";

/**
 * Backups exclude two categories of files by default. Both are opt-in:
 *
 *   - **API keys** (`.cabinet.env`): contains plaintext secrets. Default
 *     off so a backup file isn't quietly exfiltratable.
 *   - **Skills bundles** (`.agents/skills/`): often large, often re-fetchable
 *     from upstream, and usually not worth dragging through every snapshot.
 *
 * Both flags default to `false`. Callers explicitly opt in.
 */
export interface BackupOptions {
  includeEnvKeys?: boolean;
  includeSkills?: boolean;
}

function timestampToken(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function shouldCopyProjectRelative(relativePath: string): boolean {
  if (!relativePath) return true;
  const first = relativePath.split(path.sep)[0];
  return !PROJECT_BACKUP_IGNORES.has(first);
}

function isEnvKeysRelative(relativePath: string): boolean {
  return relativePath === ENV_FILE_NAME;
}

/**
 * True when `relativePath` points at a `.agents/skills` directory or
 * anything under it, anywhere in the tree. Catches both cabinet-root
 * (`.agents/skills/<key>`) and cabinet-scoped (`data/<cabinet>/.agents/skills/<key>`)
 * layouts, plus the directory itself (so the empty parent isn't copied either).
 */
function isSkillsRelative(relativePath: string): boolean {
  if (!relativePath) return false;
  const segments = relativePath.split(path.sep);
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i] === ".agents" && segments[i + 1] === "skills") return true;
  }
  return false;
}

async function ensureBackupRoot(): Promise<void> {
  await fs.mkdir(BACKUP_ROOT, { recursive: true });
}

function ensureBackupRootSync(): void {
  fsSync.mkdirSync(BACKUP_ROOT, { recursive: true });
}

export async function createDataBackup(
  reason = "manual-backup",
  options: BackupOptions = {},
): Promise<string> {
  await ensureBackupRoot();
  const backupRoot = path.join(BACKUP_ROOT, `${timestampToken()}-${reason}`);
  const destination = path.join(backupRoot, "data");
  await fs.mkdir(backupRoot, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.cp(DATA_DIR, destination, {
    recursive: true,
    filter: (src) => {
      const relative = path.relative(DATA_DIR, src);
      if (!options.includeSkills && isSkillsRelative(relative)) return false;
      return true;
    },
  });
  if (options.includeEnvKeys) {
    const envFile = path.join(PROJECT_ROOT, ENV_FILE_NAME);
    try {
      await fs.copyFile(envFile, path.join(backupRoot, ENV_FILE_NAME));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      // ENOENT: file simply doesn't exist (no keys configured), silently skip.
      // Anything else gets surfaced.
      if (code !== "ENOENT") throw err;
    }
  }
  return destination;
}

export function createDataBackupSync(
  reason = "pre-migration",
  options: BackupOptions = {},
): string {
  ensureBackupRootSync();
  const backupRoot = path.join(BACKUP_ROOT, `${timestampToken()}-${reason}`);
  const destination = path.join(backupRoot, "data");
  fsSync.mkdirSync(backupRoot, { recursive: true });
  fsSync.mkdirSync(DATA_DIR, { recursive: true });
  fsSync.cpSync(DATA_DIR, destination, {
    recursive: true,
    filter: (src) => {
      const relative = path.relative(DATA_DIR, src);
      if (!options.includeSkills && isSkillsRelative(relative)) return false;
      return true;
    },
  });
  if (options.includeEnvKeys) {
    const envFile = path.join(PROJECT_ROOT, ENV_FILE_NAME);
    try {
      fsSync.copyFileSync(envFile, path.join(backupRoot, ENV_FILE_NAME));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") throw err;
    }
  }
  return destination;
}

export async function createProjectSnapshotBackup(
  reason = "pre-update",
  options: BackupOptions = {},
): Promise<string> {
  await ensureBackupRoot();
  const destination = path.join(BACKUP_ROOT, `${timestampToken()}-${reason}`, "project");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(PROJECT_ROOT, destination, {
    recursive: true,
    filter: (src) => {
      const relative = path.relative(PROJECT_ROOT, src);
      if (!shouldCopyProjectRelative(relative)) return false;
      if (!options.includeEnvKeys && isEnvKeysRelative(relative)) return false;
      if (!options.includeSkills && isSkillsRelative(relative)) return false;
      return true;
    },
  });
  return destination;
}
