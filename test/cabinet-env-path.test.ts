import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { cabinetEnvPath } from "@/lib/runtime/cabinet-env";

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
