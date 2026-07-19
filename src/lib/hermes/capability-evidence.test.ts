import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("capability evidence enforces sequential, evidence-backed operator promotions", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-capability-"));
  const previous = process.env.CABINET_DATA_DIR; process.env.CABINET_DATA_DIR = root;
  try {
    const { promoteCapability } = await import(`./capability-evidence?test=${Date.now()}`);
    const draft = await promoteCapability({ capability: "research", profile: "operator-os", to: "Draft", actor: "Jeremy", reason: "Canonical Hermes skill exists." });
    assert.equal(draft.stage, "Draft");
    await assert.rejects(() => promoteCapability({ capability: "research", profile: "operator-os", to: "Approved", actor: "Jeremy", reason: "skip" }), /advance exactly one stage/);
    await assert.rejects(() => promoteCapability({ capability: "research", profile: "operator-os", to: "Tested", actor: "Jeremy", reason: "test" }), /run ID and outcome/);
    const tested = await promoteCapability({ capability: "research", profile: "operator-os", to: "Tested", actor: "Jeremy", reason: "Acceptance run passed.", evidence: { runId: "run_1", outcome: "passed" } });
    assert.equal(tested.history.length, 2);
    assert.equal(tested.history[1]?.evidence.runId, "run_1");
  } finally { if (previous === undefined) delete process.env.CABINET_DATA_DIR; else process.env.CABINET_DATA_DIR = previous; await fs.rm(root, { recursive: true, force: true }); }
});
