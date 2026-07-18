import test from "node:test";
import assert from "node:assert/strict";
import {
  CABINET_RUNTIME_MODES,
  parseCabinetRuntimeMode,
} from "./runtime-config";

test("Cabinet runtime mode defaults to the existing Cabinet implementation", () => {
  assert.equal(parseCabinetRuntimeMode(undefined), "cabinet");
  assert.equal(parseCabinetRuntimeMode(""), "cabinet");
  assert.equal(parseCabinetRuntimeMode("   "), "cabinet");
});

test("Cabinet runtime mode accepts the documented values", () => {
  assert.deepEqual(CABINET_RUNTIME_MODES, ["cabinet", "hermes"]);
  assert.equal(parseCabinetRuntimeMode("cabinet"), "cabinet");
  assert.equal(parseCabinetRuntimeMode(" HERMES "), "hermes");
});

test("Cabinet runtime mode rejects typos instead of silently selecting a runtime", () => {
  assert.throws(
    () => parseCabinetRuntimeMode("hermes-preview"),
    /Invalid CABINET_RUNTIME_MODE/
  );
});
