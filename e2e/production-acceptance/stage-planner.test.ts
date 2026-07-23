import assert from "node:assert/strict";
import test from "node:test";

import type { AcceptanceCheck } from "./contracts";
import {
  dependencyStatus,
} from "./stage-planner";

const failedConversation: AcceptanceCheck = {
  id: "live-two-turn-contract",
  area: "conversation",
  status: "failed",
  summary: "Deliberate fixture failure.",
};

test("conversation-dependent stages are BLOCKED after a primary conversation failure", () => {
  assert.deepEqual(
    dependencyStatus(
      {
        id: "conversation-direct-reload",
        area: "conversation",
        dependsOn: ["live-two-turn-contract"],
      },
      [failedConversation],
    ),
    {
      status: "blocked",
      summary: "Blocked by live-two-turn-contract:failed.",
    },
  );
});

test("missing prerequisite results are NOT_RUN rather than BLOCKED", () => {
  assert.deepEqual(
    dependencyStatus(
      {
        id: "conversation-direct-reload",
        area: "conversation",
        dependsOn: ["live-two-turn-contract"],
      },
      [],
    ),
    {
      status: "not_run",
      summary: "Prerequisite result missing: live-two-turn-contract.",
    },
  );
});
