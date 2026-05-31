import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "../src/lib/storage/path-utils";
import {
  scaffoldCabinet,
  seedGettingStartedDir,
} from "../src/lib/storage/cabinet-scaffold";

function uniqueCabinetPath(prefix: string): string {
  return path.join(
    DATA_DIR,
    `__${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

test("scaffoldCabinet seeds getting-started docs into new cabinets", async () => {
  const targetDir = uniqueCabinetPath("scaffold-getting-started");

  try {
    await fs.mkdir(targetDir, { recursive: true });

    await scaffoldCabinet(targetDir, {
      name: "Scaffold Seed Test",
      kind: "child",
    });

    await fs.access(path.join(targetDir, "getting-started", "index.md"));
    await fs.access(
      path.join(targetDir, "getting-started", "apps-and-repos", "index.md")
    );
  } finally {
    await fs.rm(targetDir, { recursive: true, force: true });
  }
});

test("seedGettingStartedDir preserves existing docs while filling missing files", async () => {
  const targetDir = uniqueCabinetPath("merge-getting-started");
  const customContent = "# Custom getting started\n";
  const existingIndexPath = path.join(targetDir, "getting-started", "index.md");

  try {
    await fs.mkdir(path.dirname(existingIndexPath), { recursive: true });
    await fs.writeFile(existingIndexPath, customContent, "utf-8");

    await seedGettingStartedDir(targetDir);

    const actual = await fs.readFile(existingIndexPath, "utf-8");
    assert.equal(actual, customContent);

    await fs.access(
      path.join(
        targetDir,
        "getting-started",
        "symlinks-and-load-knowledge",
        "index.md"
      )
    );
  } finally {
    await fs.rm(targetDir, { recursive: true, force: true });
  }
});
