import assert from "node:assert/strict";
import test from "node:test";

import { AcceptanceRecorder } from "./recorder";

test("Node conversation requests are counted without retaining conversation identity", () => {
  const recorder = new AcceptanceRecorder();
  recorder.request("POST", "/api/agents/conversations");
  recorder.request(
    "POST",
    "/api/agents/conversations/private-conversation-identity/continue",
  );

  assert.equal(recorder.network.total, 2);
  assert.equal(recorder.network.modelMessageRequests, 2);
  assert.equal(recorder.network.mutations, 2);
  assert.deepEqual(recorder.network.byPath, {
    "/api/agents/conversations": 1,
    "/api/agents/conversations/:id/continue": 1,
  });
  assert.doesNotMatch(
    JSON.stringify(recorder.network),
    /private-conversation-identity/,
  );
});
