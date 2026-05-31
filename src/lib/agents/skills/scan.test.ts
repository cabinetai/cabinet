import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { scanForSkills } from "./scan";

function withTempLinkedRepo<T>(
  fn: (root: string) => Promise<T> | T,
): Promise<T> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-scan-test-"));
  return Promise.resolve(fn(tmp)).finally(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });
}

function createSkill(root: string, subdir: string, slug: string, body: string): string {
  const dir = path.join(root, subdir, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), body, "utf-8");
  return dir;
}

test("scanForSkills walks linked-repo skill dirs", async () => {
  await withTempLinkedRepo(async (root) => {
    createSkill(root, ".agents/skills", "alpha", "---\nname: alpha\n---\n# Alpha\n");
    createSkill(root, ".cursor/skills", "beta", "---\nname: beta\n---\n# Beta\n");
    createSkill(root, ".windsurf/skills", "gamma", "# Gamma — slug fallback\n");

    const results = await scanForSkills({ linkedRepos: [root] });
    const keys = results.map((r) => r.key).sort();
    assert.ok(keys.includes("alpha"));
    assert.ok(keys.includes("beta"));
    assert.ok(keys.includes("gamma"));
  });
});

test("scanForSkills uses frontmatter `name:` when present", async () => {
  await withTempLinkedRepo(async (root) => {
    createSkill(
      root,
      ".agents/skills",
      "test",
      "---\nname: Pretty Name\ndescription: hi\n---\n# body\n",
    );
    const results = await scanForSkills({ linkedRepos: [root] });
    const test = results.find((r) => r.key === "test");
    assert.ok(test);
    assert.equal(test.name, "Pretty Name");
  });
});

test("scanForSkills falls back to slug when no frontmatter name", async () => {
  await withTempLinkedRepo(async (root) => {
    createSkill(root, ".agents/skills", "no-fm", "# heading\n");
    const results = await scanForSkills({ linkedRepos: [root] });
    const found = results.find((r) => r.key === "no-fm");
    assert.ok(found);
    assert.equal(found.name, "no-fm");
  });
});

test("scanForSkills returns empty when no recognizable subdirs exist", async () => {
  await withTempLinkedRepo(async (root) => {
    fs.mkdirSync(path.join(root, "random-dir"), { recursive: true });
    fs.writeFileSync(path.join(root, "random-dir", "SKILL.md"), "# fake\n");
    const results = await scanForSkills({ linkedRepos: [root] });
    // The scan only walks known subdir patterns; this skill isn't in one of
    // them so it shouldn't surface.
    assert.equal(results.find((r) => r.key === "random-dir"), undefined);
  });
});

test("scanForSkills skips dotfile dirs that aren't named skills", async () => {
  await withTempLinkedRepo(async (root) => {
    createSkill(root, ".agents/skills", "real", "# Real\n");
    fs.mkdirSync(path.join(root, ".agents/skills/.hidden"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".agents/skills/.hidden/SKILL.md"),
      "# hidden\n",
    );
    const results = await scanForSkills({ linkedRepos: [root] });
    const keys = results.map((r) => r.key);
    assert.ok(keys.includes("real"));
    assert.ok(!keys.includes(".hidden"));
  });
});
