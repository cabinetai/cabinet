import assert from "node:assert/strict";
import test from "node:test";

import type { AcceptanceCheck } from "./contracts";
import {
  dependencyStatus,
  independentStagesAfterFailure,
  type AcceptanceStage,
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

test("independent routes continue after a conversation failure", () => {
  const stages: AcceptanceStage[] = [
    {
      id: "conversation-direct-reload",
      area: "conversation",
      dependsOn: ["live-two-turn-contract"],
    },
    { id: "settings-route", area: "routes" },
    { id: "mobile-room", area: "responsive" },
  ];
  assert.deepEqual(independentStagesAfterFailure(stages, "live-two-turn-contract"), [
    "settings-route",
    "mobile-room",
  ]);
});
