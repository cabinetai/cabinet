import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  inferCabinetName,
  resolveOrBootstrapCabinetRoot,
  scaffoldCabinetDir,
} from "../cabinetai/src/lib/scaffold";
import { readCabinetManifest } from "../cabinetai/src/lib/cabinet-manifest";

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test("resolveOrBootstrapCabinetRoot bootstraps the current directory when no cabinet exists", () => {
  const targetDir = createTempDir("cabinetai-run");
  const existingIndexPath = path.join(targetDir, "index.md");
  const existingIndex = "# Existing project index\n";

  try {
    fs.writeFileSync(existingIndexPath, existingIndex, "utf8");

    const result = resolveOrBootstrapCabinetRoot(targetDir);

    assert.equal(result.cabinetDir, targetDir);
    assert.equal(result.bootstrapped, true);
    assert.equal(result.name, inferCabinetName(targetDir));

    const manifest = readCabinetManifest(targetDir);
    assert.ok(manifest);
    assert.equal(manifest?.kind, "root");
    assert.equal(fs.readFileSync(existingIndexPath, "utf8"), existingIndex);
    assert.ok(fs.existsSync(path.join(targetDir, ".agents")));
    assert.ok(fs.existsSync(path.join(targetDir, ".jobs")));
    assert.ok(fs.existsSync(path.join(targetDir, ".cabinet-state")));
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test("resolveOrBootstrapCabinetRoot reuses an existing parent cabinet", () => {
  const rootDir = createTempDir("cabinetai-root");
  const nestedDir = path.join(rootDir, "nested");

  try {
    scaffoldCabinetDir({
      targetDir: rootDir,
      name: "Root Cabinet",
      kind: "root",
    });
    fs.mkdirSync(nestedDir, { recursive: true });

    const result = resolveOrBootstrapCabinetRoot(nestedDir);

    assert.equal(result.cabinetDir, rootDir);
    assert.equal(result.bootstrapped, false);
    assert.equal(fs.existsSync(path.join(nestedDir, ".cabinet")), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
