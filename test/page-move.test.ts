import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "../src/lib/storage/path-utils";
import { movePage } from "../src/lib/storage/page-io";

function uniqueName(prefix: string): string {
  return `__${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test("movePage moves a standalone markdown file out of a linked directory", async () => {
  const externalRoot = path.join(
    DATA_DIR,
    "..",
    uniqueName("linked-source-root")
  );
  const linkName = uniqueName("linked-folder");
  const destinationName = uniqueName("move-destination");
  const linkPath = path.join(DATA_DIR, linkName);
  const destinationPath = path.join(DATA_DIR, destinationName);
  const externalFilePath = path.join(externalRoot, "linked-note.md");
  const movedFilePath = path.join(destinationPath, "linked-note.md");

  try {
    await fs.mkdir(externalRoot, { recursive: true });
    await fs.mkdir(destinationPath, { recursive: true });
    await fs.writeFile(
      externalFilePath,
      "---\ntitle: Linked note\n---\n\nHello from the linked folder.\n",
      "utf-8"
    );

    await fs.symlink(
      externalRoot,
      linkPath,
      process.platform === "win32" ? "junction" : "dir"
    );

    const newPath = await movePage(`${linkName}/linked-note`, destinationName);

    assert.equal(newPath, `${destinationName}/linked-note`);
    await assert.rejects(fs.access(externalFilePath));
    await fs.access(movedFilePath);

    const movedContent = await fs.readFile(movedFilePath, "utf-8");
    assert.match(movedContent, /Hello from the linked folder\./);
  } finally {
    await fs.rm(linkPath, { recursive: true, force: true });
    await fs.rm(destinationPath, { recursive: true, force: true });
    await fs.rm(externalRoot, { recursive: true, force: true });
  }
});
