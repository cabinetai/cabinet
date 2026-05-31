import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import {
  readSkillsLock,
  removeFromSkillsLock,
  updateSkillsLock,
  verifySkillsLock,
} from "./lock";

const LOCK_FILE = path.join(PROJECT_ROOT, "skills-lock.json");

/**
 * Each test snapshots and restores `skills-lock.json` so we don't clobber
 * the real lockfile. We can't mock PROJECT_ROOT (resolved at module load).
 */
function withSnapshot<T>(fn: () => Promise<T>): Promise<T> {
  let snapshot: string | null = null;
  try {
    snapshot = fs.readFileSync(LOCK_FILE, "utf-8");
  } catch {
    /* no prior file */
  }
  fs.rmSync(LOCK_FILE, { force: true });
  return Promise.resolve(fn()).finally(() => {
    if (snapshot !== null) {
      fs.writeFileSync(LOCK_FILE, snapshot, "utf-8");
    } else {
      fs.rmSync(LOCK_FILE, { force: true });
    }
  });
}

test("readSkillsLock returns v2 default when file is missing", async () => {
  await withSnapshot(async () => {
    const lock = await readSkillsLock();
    assert.equal(lock.version, 2);
    assert.deepEqual(lock.skills, {});
  });
});

test("updateSkillsLock writes a v2 entry with provenance", async () => {
  await withSnapshot(async () => {
    await updateSkillsLock("alpha", {
      source: "github:foo/bar",
      sourceType: "github",
      ref: "main",
      scope: "root",
      installedAt: "2026-04-25T12:00:00.000Z",
    });
    const lock = await readSkillsLock();
    assert.ok(lock.skills.alpha);
    assert.equal(lock.skills.alpha.source, "github:foo/bar");
    assert.equal(lock.skills.alpha.sourceType, "github");
    assert.equal(lock.skills.alpha.ref, "main");
    assert.equal(lock.skills.alpha.scope, "root");
  });
});

test("removeFromSkillsLock deletes the entry", async () => {
  await withSnapshot(async () => {
    await updateSkillsLock("alpha", {
      source: "github:foo/bar",
      sourceType: "github",
      ref: null,
      scope: "root",
      installedAt: "2026-04-25T12:00:00.000Z",
    });
    let lock = await readSkillsLock();
    assert.ok(lock.skills.alpha);
    await removeFromSkillsLock("alpha");
    lock = await readSkillsLock();
    assert.equal(lock.skills.alpha, undefined);
  });
});

test("v1 lock entries (computedHash schema) read as v2 with sourceType preserved", async () => {
  await withSnapshot(async () => {
    const v1 = {
      version: 1,
      skills: {
        legacy: {
          source: "shadcn/ui",
          sourceType: "github",
          computedHash: "abc123",
        },
      },
    };
    fs.writeFileSync(LOCK_FILE, JSON.stringify(v1, null, 2), "utf-8");
    const lock = await readSkillsLock();
    assert.equal(lock.version, 2);
    assert.ok(lock.skills.legacy);
    assert.equal(lock.skills.legacy.source, "shadcn/ui");
    assert.equal(lock.skills.legacy.sourceType, "github");
    assert.equal(lock.skills.legacy.scope, "root");
    assert.equal(lock.skills.legacy.computedHash, "abc123");
  });
});

test("verifySkillsLock reports `missing` for locked-but-absent skills", async () => {
  await withSnapshot(async () => {
    await updateSkillsLock("ghost", {
      source: "local:/non-existent",
      sourceType: "local_path",
      ref: null,
      scope: "root",
      installedAt: "2026-04-25T12:00:00.000Z",
    });
    const reports = await verifySkillsLock();
    const ghost = reports.find((r) => r.key === "ghost");
    assert.ok(ghost);
    assert.equal(ghost.drift, "missing");
  });
});
