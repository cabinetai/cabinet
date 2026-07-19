import assert from "node:assert/strict";
import test from "node:test";
import { parseOpenCliDoctor, readOpenCliDiagnostics } from "./opencli-diagnostics";

test("OpenCLI diagnostics distinguish external CLI connectivity from a Hermes skill", () => {
  const result = parseOpenCliDoctor(`opencli v1.8.5 doctor (node v22)\n[OK] Daemon: running on port 19825 (v1.8.5)\n[OK] Extension: connected (v1.0.22)\nProfiles:\n  • r6gdu7du: connected v1.0.22\n[OK] Connectivity: connected`);
  assert.equal(result.available, true);
  assert.equal(result.version, "1.8.5");
  assert.equal(result.daemon, "running");
  assert.equal(result.extension, "connected");
  assert.deepEqual(result.profiles, [{ name: "r6gdu7du", status: "connected", version: "1.0.22" }]);
  assert.equal(result.invocation, "terminal");
});

test("OpenCLI diagnostics fail closed when the binary is unavailable", async () => {
  const result = await readOpenCliDiagnostics(async () => { throw new Error("ENOENT"); });
  assert.equal(result.available, false);
  assert.equal(result.profiles.length, 0);
});
