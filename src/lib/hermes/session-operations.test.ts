import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
let operations: typeof import("./session-operations");

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-hermes-operations-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  operations = await import("./session-operations");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("Hermes session operations return one completed result for duplicate submissions", async () => {
  const identity = "branch:parent:stable-operation";
  const first = await operations.claimHermesSessionOperation(identity);
  assert.equal(first.claimed, true);

  const whileRunning = await operations.claimHermesSessionOperation(identity);
  assert.deepEqual(whileRunning, { claimed: false, result: undefined });

  const result = { ok: true, sessionId: "branch-session", conversationId: "projection" };
  await operations.completeHermesSessionOperation(identity, result);

  const duplicate = await operations.claimHermesSessionOperation(identity);
  assert.deepEqual(duplicate, { claimed: false, result });

  const operationDir = path.join(tempRoot, ".cabinet-state", "hermes-session-operations");
  const [record] = await fs.readdir(operationDir);
  assert.equal((await fs.stat(path.join(operationDir, record))).mode & 0o777, 0o600);
});

test("a failed Hermes session operation can release its claim for a safe retry", async () => {
  const identity = "branch:parent:retry-operation";
  assert.equal((await operations.claimHermesSessionOperation(identity)).claimed, true);
  await operations.releaseHermesSessionOperation(identity);
  assert.equal((await operations.claimHermesSessionOperation(identity)).claimed, true);
});
