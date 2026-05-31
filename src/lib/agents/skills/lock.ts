import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import { listSkills } from "./loader";
import type { SkillFileInventoryEntry } from "./types";

/**
 * `skills-lock.json` activation. Schema upgraded from the v1 stub to a v2
 * shape that tracks per-skill provenance + per-file SHA so updates can show
 * a diff before applying. See docs/SKILLS_PLAN.md Phase 4.
 */

export interface SkillsLockEntry {
  source: string;
  sourceType: "github" | "skills_sh" | "local_path" | "url" | "catalog";
  ref: string | null;
  scope: string;          // "root" | "cabinet:<path>"
  installedAt: string;    // ISO timestamp
  /** Per-file SHA-256 keyed by relative path. */
  files?: Record<string, string>;
  computedHash?: string;  // legacy v1 — sum hash of all files
  note?: string;
}

export interface SkillsLockFile {
  version: 2;
  skills: Record<string, SkillsLockEntry>;
}

const LOCK_PATH = path.join(PROJECT_ROOT, "skills-lock.json");

async function readLockFile(): Promise<SkillsLockFile> {
  try {
    const raw = await fs.readFile(LOCK_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SkillsLockFile> & {
      version?: number;
      skills?: Record<string, unknown>;
    };
    // v1 → v2 migration: v1 had `{ version: 1, skills: { <key>: { source, sourceType, computedHash } } }`.
    // We preserve those fields on read so they keep their old meaning until updated.
    const skills: Record<string, SkillsLockEntry> = {};
    if (parsed.skills) {
      for (const [key, value] of Object.entries(parsed.skills)) {
        if (!value || typeof value !== "object") continue;
        const v = value as Partial<SkillsLockEntry> & { computedHash?: string };
        skills[key] = {
          source: typeof v.source === "string" ? v.source : "",
          sourceType:
            v.sourceType === "github" ||
            v.sourceType === "skills_sh" ||
            v.sourceType === "local_path" ||
            v.sourceType === "url" ||
            v.sourceType === "catalog"
              ? v.sourceType
              : "github",
          ref: typeof v.ref === "string" ? v.ref : null,
          scope: typeof v.scope === "string" ? v.scope : "root",
          installedAt: typeof v.installedAt === "string" ? v.installedAt : new Date(0).toISOString(),
          files: v.files,
          computedHash: v.computedHash,
          note: v.note,
        };
      }
    }
    return { version: 2, skills };
  } catch {
    return { version: 2, skills: {} };
  }
}

async function writeLockFile(file: SkillsLockFile): Promise<void> {
  await fs.writeFile(LOCK_PATH, JSON.stringify(file, null, 2) + "\n", "utf-8");
}

export async function readSkillsLock(): Promise<SkillsLockFile> {
  return readLockFile();
}

export async function updateSkillsLock(
  key: string,
  entry: Omit<SkillsLockEntry, "files">,
): Promise<void> {
  const lock = await readLockFile();
  const fileHashes = await computeFileHashes(key);
  lock.skills[key] = { ...entry, files: fileHashes };
  await writeLockFile(lock);
}

export async function removeFromSkillsLock(key: string): Promise<void> {
  const lock = await readLockFile();
  if (lock.skills[key]) {
    delete lock.skills[key];
    await writeLockFile(lock);
  }
}

async function computeFileHashes(key: string): Promise<Record<string, string>> {
  const skills = await listSkills();
  const skill = skills.find((s) => s.key === key);
  if (!skill) return {};
  const out: Record<string, string> = {};
  for (const file of skill.fileInventory) {
    const abs = path.join(skill.path, file.path);
    try {
      const data = await fs.readFile(abs);
      out[file.path] = crypto.createHash("sha256").update(data).digest("hex");
    } catch {
      // Symlink target missing or unreadable; skip.
    }
  }
  return out;
}

export interface SkillDriftReport {
  key: string;
  scope: string;
  drift: "missing" | "modified" | "unmodified" | "no-lock";
  changedFiles?: string[];
}

/**
 * Verify each skill in the lock against its on-disk files. Returns one
 * report per skill in the lock; UI/CLI can highlight modifications.
 */
export async function verifySkillsLock(): Promise<SkillDriftReport[]> {
  const lock = await readLockFile();
  const skills = await listSkills();
  const byKey = new Map(skills.map((s) => [s.key, s]));
  const reports: SkillDriftReport[] = [];

  for (const [key, entry] of Object.entries(lock.skills)) {
    const skill = byKey.get(key);
    if (!skill) {
      reports.push({ key, scope: entry.scope, drift: "missing" });
      continue;
    }
    if (!entry.files) {
      reports.push({ key, scope: entry.scope, drift: "no-lock" });
      continue;
    }
    const changedFiles: string[] = [];
    for (const fileEntry of skill.fileInventory as SkillFileInventoryEntry[]) {
      const expected = entry.files[fileEntry.path];
      if (!expected) continue; // file appeared after lock — not "modified" per se
      const abs = path.join(skill.path, fileEntry.path);
      try {
        const data = await fs.readFile(abs);
        const actual = crypto.createHash("sha256").update(data).digest("hex");
        if (actual !== expected) changedFiles.push(fileEntry.path);
      } catch {
        changedFiles.push(fileEntry.path);
      }
    }
    reports.push({
      key,
      scope: entry.scope,
      drift: changedFiles.length > 0 ? "modified" : "unmodified",
      changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
    });
  }

  return reports;
}
