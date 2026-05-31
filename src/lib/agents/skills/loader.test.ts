import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { listSkills, readSkill, resolveDesiredSkills, buildSkillIndex } from "./loader";

function withTempHome<T>(fn: (homeDir: string) => Promise<T> | T): Promise<T> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-loader-test-"));
  const prevHome = process.env.HOME;
  process.env.HOME = tmp;
  return Promise.resolve(fn(tmp)).finally(() => {
    process.env.HOME = prevHome;
    fs.rmSync(tmp, { recursive: true, force: true });
  });
}

function createSkill(home: string, slug: string, content: string): string {
  const dir = path.join(home, ".cabinet", "skills", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), content, "utf-8");
  return dir;
}

test("listSkills includes legacy-home origin entries", async () => {
  await withTempHome(async (home) => {
    createSkill(home, "alpha", "---\nname: alpha\ndescription: A test skill\n---\n# Alpha\nbody\n");
    const skills = await listSkills();
    const alpha = skills.find((s) => s.key === "alpha");
    assert.ok(alpha, "alpha should be discovered from legacy-home");
    assert.equal(alpha.origin, "legacy-home");
    assert.equal(alpha.name, "alpha");
    assert.equal(alpha.description, "A test skill");
    assert.equal(alpha.editable, false);
  });
});

test("readSkill returns the bundle including body", async () => {
  await withTempHome(async (home) => {
    createSkill(home, "beta", "---\nname: beta\ndescription: Beta skill\n---\n# Beta\nThis is the body.\n");
    const bundle = await readSkill("beta");
    assert.ok(bundle);
    assert.equal(bundle.key, "beta");
    assert.match(bundle.body, /This is the body/);
  });
});

test("readSkill returns null for unknown key", async () => {
  await withTempHome(async () => {
    const bundle = await readSkill("does-not-exist", { includeSystem: false });
    assert.equal(bundle, null);
  });
});

test("resolveDesiredSkills hydrates persona's skill keys, drops missing", async () => {
  await withTempHome(async (home) => {
    createSkill(home, "one", "# One\nfirst");
    createSkill(home, "two", "# Two\nsecond");
    const bundles = await resolveDesiredSkills(["one", "missing", "two"]);
    assert.equal(bundles.length, 2);
    assert.deepEqual(
      bundles.map((b) => b.key),
      ["one", "two"],
    );
  });
});

test("buildSkillIndex returns null for empty input", () => {
  assert.equal(buildSkillIndex([]), null);
});

test("buildSkillIndex lists name + description", async () => {
  await withTempHome(async (home) => {
    createSkill(
      home,
      "git-commit",
      "---\nname: git-commit\ndescription: Use when committing\n---\n# Git Commit\n",
    );
    const bundles = await resolveDesiredSkills(["git-commit"]);
    const text = buildSkillIndex(bundles);
    assert.ok(text);
    assert.match(text, /Skills available to you/);
    assert.match(text, /git-commit/);
    assert.match(text, /Use when committing/);
  });
});

test("listSkills sorts by key for stable ordering", async () => {
  await withTempHome(async (home) => {
    createSkill(home, "zulu", "# Zulu\n");
    createSkill(home, "alpha", "# Alpha\n");
    createSkill(home, "mike", "# Mike\n");
    const skills = await listSkills();
    const fromHome = skills.filter((s) => s.origin === "legacy-home").map((s) => s.key);
    assert.deepEqual(fromHome, ["alpha", "mike", "zulu"]);
  });
});
