import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { CABINET_MANIFEST_FILE } from "../src/lib/cabinets/files";
import { ROOT_CABINET_PATH } from "../src/lib/cabinets/paths";
import {
  invalidateCabinetOverviewCache,
  readCabinetOverview,
} from "../src/lib/cabinets/overview";
import { DATA_DIR } from "../src/lib/storage/path-utils";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

test("root cabinet overview works without requiring a root manifest", async () => {
  const hasRootManifest = await pathExists(
    path.join(DATA_DIR, CABINET_MANIFEST_FILE),
  );

  invalidateCabinetOverviewCache(ROOT_CABINET_PATH);
  try {
    const overview = await readCabinetOverview(ROOT_CABINET_PATH, {
      visibilityMode: "own",
    });

    assert.equal(overview.cabinet.path, ROOT_CABINET_PATH);
    assert.equal(overview.parent, null);
    assert.equal(overview.visibleCabinets[0]?.path, ROOT_CABINET_PATH);

    if (!hasRootManifest) {
      assert.equal(overview.cabinet.id, "root");
      assert.equal(overview.cabinet.name, "Home");
      assert.equal(overview.cabinet.kind, "workspace");
    }
  } finally {
    invalidateCabinetOverviewCache(ROOT_CABINET_PATH);
  }
});
