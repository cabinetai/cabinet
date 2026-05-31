import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  readSkillCatalog,
  syncSkillsToTmpdir,
  cleanupSkillsTmpdir,
} from "./skills-injection";

function withTempHome<T>(fn: (homeDir: string) => T): T {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-skills-test-"));
  const prevHome = process.env.HOME;
  process.env.HOME = tmp;
  try {
    return fn(tmp);
  } finally {
    process.env.HOME = prevHome;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function createSkill(home: string, slug: string, content: string): string {
  const dir = path.join(home, ".cabinet", "skills", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), content, "utf-8");
  return dir;
}

test("readSkillCatalog returns nothing from a fresh legacy home", () => {
  withTempHome((home) => {
    const catalog = readSkillCatalog();
    // The catalog now spans multiple origins (cabinet-root, system, legacy-home).
    // We can only assert the empty-tmp-HOME contribution: nothing from this
    // home dir should appear. Other origins (e.g. the repo's `.agents/skills/`)
    // may legitimately contribute skills.
    const fromLegacyHome = catalog.filter((e) => e.path.startsWith(home));
    assert.deepEqual(fromLegacyHome, []);
  });
});

test("readSkillCatalog reads heading + description from SKILL.md", () => {
  withTempHome((home) => {
    createSkill(home, "code-review", "# Code Review\n\nReview a PR for regressions.\n");
    createSkill(home, "no-md", ""); // slug-named fallback
    const catalog = readSkillCatalog();
    const byReview = catalog.find((e) => e.slug === "code-review");
    assert.ok(byReview, "code-review should be present in the catalog");
    assert.equal(byReview.name, "Code Review");
    assert.equal(byReview.description, "Review a PR for regressions.");
    const byNoMd = catalog.find((e) => e.slug === "no-md");
    assert.ok(byNoMd, "no-md should be present in the catalog (slug fallback)");
    assert.equal(byNoMd.name, "no-md");
  });
});

test("syncSkillsToTmpdir symlinks selected skills, ignores unknown", () => {
  withTempHome((home) => {
    createSkill(home, "a", "# A");
    createSkill(home, "b", "# B");
    createSkill(home, "c", "# C");
    const result = syncSkillsToTmpdir("session-1", ["a", "c", "missing"]);
    assert.ok(result);
    assert.equal(result.resolved.length, 2);
    const entries = fs.readdirSync(result.dir).sort();
    assert.deepEqual(entries, ["a", "c"]);
    assert.equal(
      fs.lstatSync(path.join(result.dir, "a")).isSymbolicLink(),
      true
    );
    cleanupSkillsTmpdir("session-1");
    assert.equal(fs.existsSync(result.dir), false);
  });
});

test("syncSkillsToTmpdir returns null when selection or catalog is empty", () => {
  withTempHome(() => {
    assert.equal(syncSkillsToTmpdir("s", []), null);
    createSkill(process.env.HOME!, "x", "# X");
    assert.equal(syncSkillsToTmpdir("s", ["unknown"]), null);
  });
});

test("syncSkillsToTmpdir is idempotent — re-sync reflects new selection", () => {
  withTempHome((home) => {
    createSkill(home, "a", "# A");
    createSkill(home, "b", "# B");
    const first = syncSkillsToTmpdir("session-2", ["a"]);
    assert.ok(first);
    assert.deepEqual(fs.readdirSync(first.dir).sort(), ["a"]);
    const second = syncSkillsToTmpdir("session-2", ["b"]);
    assert.ok(second);
    assert.equal(second.dir, first.dir);
    assert.deepEqual(fs.readdirSync(second.dir).sort(), ["b"]);
    cleanupSkillsTmpdir("session-2");
  });
});
