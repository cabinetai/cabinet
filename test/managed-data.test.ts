import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  shouldSeedDefaultContent,
}: {
  shouldSeedDefaultContent: (managedDataDir: string) => boolean;
} = require("../electron/managed-data.cjs");

test("starter content is seeded into a new managed directory", () => {
  const managedDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-new-"));

  try {
    assert.equal(shouldSeedDefaultContent(managedDataDir), true);
  } finally {
    fs.rmSync(managedDataDir, { recursive: true, force: true });
  }
});

test("starter content is not seeded into an established Cabinet", () => {
  const managedDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "cabinet-existing-")
  );

  try {
    fs.writeFileSync(path.join(managedDataDir, ".cabinet"), "{}");
    assert.equal(shouldSeedDefaultContent(managedDataDir), false);
  } finally {
    fs.rmSync(managedDataDir, { recursive: true, force: true });
  }
});
