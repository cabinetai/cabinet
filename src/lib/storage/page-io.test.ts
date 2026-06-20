import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ensureContainerDir } from "@/lib/storage/page-io";

const exists = (p: string) => fs.access(p).then(() => true, () => false);

test("ensureContainerDir promotes a standalone page into a container", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pageio-"));
  try {
    const page = path.join(root, "Day 264");
    await fs.writeFile(`${page}.md`, "# Day 264\nbody\n");
    await ensureContainerDir(page);
    assert.equal(await fs.readFile(path.join(page, "index.md"), "utf8"), "# Day 264\nbody\n");
    assert.equal(await exists(`${page}.md`), false);
    // idempotent
    await ensureContainerDir(page);
    assert.equal(await fs.readFile(path.join(page, "index.md"), "utf8"), "# Day 264\nbody\n");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ensureContainerDir heals an already-broken dir+sibling pair", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pageio-"));
  try {
    const page = path.join(root, "Day 264");
    // a sub-page already created (the broken state), but the original is orphaned
    await fs.mkdir(path.join(page, "Day 265"), { recursive: true });
    await fs.writeFile(path.join(page, "Day 265", "index.md"), "# child\n");
    await fs.writeFile(`${page}.md`, "# Day 264\norphaned\n");
    await ensureContainerDir(page);
    assert.equal(await fs.readFile(path.join(page, "index.md"), "utf8"), "# Day 264\norphaned\n");
    assert.equal(await exists(`${page}.md`), false);
    assert.ok(await exists(path.join(page, "Day 265", "index.md")), "child untouched");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ensureContainerDir is a no-op without a sibling .md", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pageio-"));
  try {
    const page = path.join(root, "Folder");
    await fs.mkdir(page);
    await ensureContainerDir(page);
    assert.equal(await exists(path.join(page, "index.md")), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
