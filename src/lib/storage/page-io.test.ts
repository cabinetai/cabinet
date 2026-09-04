import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ensureContainerDir } from "@/lib/storage/page-io";

const exists = (p: string) => fs.access(p).then(() => true, () => false);

test("ensureContainerDir preserves a standalone page and creates its sibling folder", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pageio-"));
  try {
    const page = path.join(root, "Day 264");
    await fs.writeFile(`${page}.md`, "# Day 264\nbody\n");
    await ensureContainerDir(page);
    assert.equal(await fs.readFile(`${page}.md`, "utf8"), "# Day 264\nbody\n");
    assert.ok(await exists(page), "directory is created");
    assert.equal(await exists(path.join(page, "index.md")), false, "no index.md created");
    // idempotent
    await ensureContainerDir(page);
    assert.equal(await fs.readFile(`${page}.md`, "utf8"), "# Day 264\nbody\n");
    assert.ok(await exists(page), "directory still exists");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ensureContainerDir is a no-op if both sibling .md and folder exist", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pageio-"));
  try {
    const page = path.join(root, "Day 264");
    await fs.mkdir(page);
    await fs.writeFile(`${page}.md`, "# Day 264\nbody\n");
    await fs.writeFile(path.join(page, "subpage.md"), "# subpage\n");
    await ensureContainerDir(page);
    assert.equal(await fs.readFile(`${page}.md`, "utf8"), "# Day 264\nbody\n");
    assert.ok(await exists(page), "directory is preserved");
    assert.equal(await exists(path.join(page, "index.md")), false, "no index.md created");
    assert.equal(await fs.readFile(path.join(page, "subpage.md"), "utf8"), "# subpage\n");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ensureContainerDir creates folder without sibling .md", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pageio-"));
  try {
    const page = path.join(root, "Folder");
    await ensureContainerDir(page);
    assert.ok(await exists(page), "directory is created");
    assert.equal(await exists(path.join(page, "index.md")), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
