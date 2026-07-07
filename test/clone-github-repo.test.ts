import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import simpleGit from "simple-git";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/system/clone-github-repo/route";
import { DATA_DIR } from "@/lib/storage/path-utils";

function makeReq(body: any) {
  const url = new URL("/api/system/clone-github-repo", "http://localhost:4000");
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("clone-github-repo route clones remote, writes config files, and creates symlink", async () => {
  const fixtureDir = path.resolve("./tmp/test-github-clone");
  const sourceRepoPath = path.join(fixtureDir, "source-repo");
  const destRepoPath = path.join(fixtureDir, "destination-repo");
  const name = `test-clone-${Date.now()}`;
  const cabinetSymlinkPath = path.join(DATA_DIR, name);

  // Clean up any old runs
  await fs.rm(fixtureDir, { recursive: true, force: true }).catch(() => {});
  await fs.unlink(cabinetSymlinkPath).catch(() => {});

  try {
    // 1. Create source repository
    await fs.mkdir(sourceRepoPath, { recursive: true });
    const git = simpleGit(sourceRepoPath);
    await git.init();
    await git.addConfig("user.email", "test@cabinet.dev");
    await git.addConfig("user.name", "Test");
    await fs.writeFile(path.join(sourceRepoPath, "README.md"), "# Source Repo");
    await git.add("README.md");
    await git.commit("Initial commit");

    // Get current branch
    const branchSummary = await git.branchLocal();
    const branchName = branchSummary.current || "main";

    // 2. Call POST API
    const req = makeReq({
      remote: sourceRepoPath,
      localPath: destRepoPath,
      name: name,
      branch: branchName,
      description: "Test description for clone",
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(res.status, 200, `Expected 200 response, got ${res.status} with error: ${data.error}`);
    assert.equal(data.ok, true);
    assert.equal(data.path, name);

    // 3. Verify destination folder contains cloned files
    const readmeContent = await fs.readFile(path.join(destRepoPath, "README.md"), "utf8");
    assert.equal(readmeContent, "# Source Repo");

    // 4. Verify .cabinet-meta exists and is correct
    const metaRaw = await fs.readFile(path.join(destRepoPath, ".cabinet-meta"), "utf8");
    const meta = yaml.load(metaRaw) as any;
    assert.equal(meta.title, name);
    assert.deepEqual(meta.tags, ["repo"]);
    assert.equal(meta.description, "Test description for clone");

    // 5. Verify .repo.yaml exists and is correct
    const repoRaw = await fs.readFile(path.join(destRepoPath, ".repo.yaml"), "utf8");
    const repoConfig = yaml.load(repoRaw) as any;
    assert.equal(repoConfig.name, name);
    assert.equal(repoConfig.local, destRepoPath);
    assert.equal(repoConfig.remote, sourceRepoPath);
    assert.equal(repoConfig.branch, branchName);
    assert.equal(repoConfig.source, "both");
    assert.equal(repoConfig.description, "Test description for clone");

    // 6. Verify symlink exists in the cabinet data directory
    const symlinkStat = await fs.lstat(cabinetSymlinkPath);
    assert.ok(symlinkStat.isSymbolicLink(), "Cabinet path should be a symlink");
    const target = await fs.readlink(cabinetSymlinkPath);
    assert.equal(path.resolve(target), destRepoPath);

  } finally {
    // Cleanup
    await fs.rm(fixtureDir, { recursive: true, force: true }).catch(() => {});
    await fs.unlink(cabinetSymlinkPath).catch(() => {});
  }
});

test("clone-github-repo route clones directly inside cabinet without symlink when paths match", async () => {
  const fixtureDir = path.resolve("./tmp/test-github-clone-inline");
  const sourceRepoPath = path.join(fixtureDir, "source-repo");
  const name = `test-clone-inline-${Date.now()}`;
  const cabinetPath = path.join(DATA_DIR, name);

  // Clean up any old runs
  await fs.rm(fixtureDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(cabinetPath, { recursive: true, force: true }).catch(() => {});

  try {
    // 1. Create source repository
    await fs.mkdir(sourceRepoPath, { recursive: true });
    const git = simpleGit(sourceRepoPath);
    await git.init();
    await git.addConfig("user.email", "test@cabinet.dev");
    await git.addConfig("user.name", "Test");
    await fs.writeFile(path.join(sourceRepoPath, "README.md"), "# Source Repo Inline");
    await git.add("README.md");
    await git.commit("Initial commit");

    // Get current branch
    const branchSummary = await git.branchLocal();
    const branchName = branchSummary.current || "main";

    // 2. Call POST API with localPath matching cabinetPath
    const req = makeReq({
      remote: sourceRepoPath,
      localPath: cabinetPath,
      name: name,
      branch: branchName,
      description: "Test description for inline clone",
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(res.status, 200, `Expected 200 response, got ${res.status} with error: ${data.error}`);
    assert.equal(data.ok, true);
    assert.equal(data.path, name);

    // 3. Verify destination folder contains cloned files
    const readmeContent = await fs.readFile(path.join(cabinetPath, "README.md"), "utf8");
    assert.equal(readmeContent, "# Source Repo Inline");

    // 4. Verify .cabinet-meta exists and is correct
    const metaRaw = await fs.readFile(path.join(cabinetPath, ".cabinet-meta"), "utf8");
    const meta = yaml.load(metaRaw) as any;
    assert.equal(meta.title, name);

    // 5. Verify .repo.yaml exists and is correct
    const repoRaw = await fs.readFile(path.join(cabinetPath, ".repo.yaml"), "utf8");
    const repoConfig = yaml.load(repoRaw) as any;
    assert.equal(repoConfig.name, name);
    assert.equal(repoConfig.local, cabinetPath);

    // 6. Verify it is a real directory, NOT a symbolic link
    const symlinkStat = await fs.lstat(cabinetPath);
    assert.ok(symlinkStat.isDirectory(), "Cabinet path should be a directory");
    assert.ok(!symlinkStat.isSymbolicLink(), "Cabinet path should not be a symlink");

  } finally {
    // Cleanup
    await fs.rm(fixtureDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(cabinetPath, { recursive: true, force: true }).catch(() => {});
  }
});
