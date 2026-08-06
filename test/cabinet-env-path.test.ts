import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cabinetEnvPath,
  readCabinetEnvFile,
  removeCabinetEnv,
  upsertCabinetEnv,
} from "@/lib/runtime/cabinet-env";

test("CABINET_ENV_PATH keeps desktop secrets outside the workspace", () => {
  const original = process.env.CABINET_ENV_PATH;
  process.env.CABINET_ENV_PATH = path.join(
    path.sep,
    "machine-local",
    "workspace",
    ".cabinet.env",
  );

  try {
    assert.equal(
      cabinetEnvPath(),
      path.resolve(process.env.CABINET_ENV_PATH),
    );
  } finally {
    if (original === undefined) {
      delete process.env.CABINET_ENV_PATH;
    } else {
      process.env.CABINET_ENV_PATH = original;
    }
  }
});

test("workspace sync preference persists in the machine-local cabinet env", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-sync-setting-"));
  const envPath = path.join(root, ".cabinet.env");
  const originalPath = process.env.CABINET_ENV_PATH;
  const originalValue = process.env.CABINET_SYNC_ENABLED;
  process.env.CABINET_ENV_PATH = envPath;

  try {
    upsertCabinetEnv("CABINET_SYNC_ENABLED", "false");
    assert.equal(
      readCabinetEnvFile().values.CABINET_SYNC_ENABLED,
      "false",
    );
    assert.match(fs.readFileSync(envPath, "utf8"), /CABINET_SYNC_ENABLED=false/);

    removeCabinetEnv("CABINET_SYNC_ENABLED");
    assert.equal(
      readCabinetEnvFile().values.CABINET_SYNC_ENABLED,
      undefined,
    );
  } finally {
    if (originalPath === undefined) delete process.env.CABINET_ENV_PATH;
    else process.env.CABINET_ENV_PATH = originalPath;
    if (originalValue === undefined) delete process.env.CABINET_SYNC_ENABLED;
    else process.env.CABINET_SYNC_ENABLED = originalValue;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
