import test from "node:test";
import assert from "node:assert/strict";
import { buildOptaleActionRegistry } from "./action-registry";

test("buildOptaleActionRegistry exposes command and agent proposal actions", () => {
  const registry = buildOptaleActionRegistry({
    commandCenter: {
      cabinet: { path: ".", name: "Root" },
      visibilityMode: "all",
      controls: ["launch_conversation", "review_actions"],
      operatorOnlyControls: ["create_task"],
      conversations: [
        {
          id: "run-1",
          agentSlug: "research",
          cabinetPath: ".",
          title: "Research run",
          trigger: "manual",
          status: "running",
          startedAt: "2026-05-03T00:00:00.000Z",
          promptPath: ".agents/.conversations/run-1/prompt.md",
          transcriptPath: ".agents/.conversations/run-1/transcript.md",
          mentionedPaths: [],
          artifactPaths: [],
          pendingActions: [
            {
              id: "action-1",
              createdAt: "2026-05-03T00:01:00.000Z",
              action: {
                type: "LAUNCH_TASK",
                agent: "copywriter",
                title: "Draft",
                prompt: "Draft a summary.",
              },
              warnings: [],
            },
            {
              id: "action-2",
              createdAt: "2026-05-03T00:02:00.000Z",
              action: {
                type: "SCHEDULE_JOB",
                agent: "unknown",
                name: "Followup",
                schedule: "* * * * *",
                prompt: "Follow up.",
              },
              warnings: [
                {
                  code: "unknown_agent",
                  severity: "hard",
                  message: "Missing agent.",
                },
              ],
            },
          ],
        },
      ],
    } as never,
  });

  assert.equal(registry.counts.commandActions, 8);
  assert.equal(registry.counts.agentProposalTypes, 3);
  assert.equal(registry.counts.pendingQueues, 1);
  assert.equal(registry.counts.pendingActions, 2);
  assert.equal(registry.counts.hardBlockedActions, 1);
  assert.equal(
    registry.operationalSpine.bindingCount,
    registry.actions.length + registry.queues.length,
  );
  assert.equal(
    registry.operationalSpine.capabilities.lineage_edge.reserved,
    registry.actions.length + registry.queues.length,
  );
  assert.ok(
    registry.actions.some(
      (action) =>
        action.id === "command:launch_conversation" &&
        action.status === "available" &&
        action.oagContract?.targetObjectTypes.includes("Agent") &&
        action.oagContract?.resultObjectTypes.includes("Run") &&
        action.operationalSpine?.subjectType === "action_type",
    ),
  );
  assert.ok(
    registry.actions.some(
      (action) =>
        action.id === "command:create_task" &&
        action.status === "unavailable" &&
        action.facts.some(
          (fact) =>
            fact.label === "Availability" && fact.value === "operator-only",
        ),
    ),
  );
  assert.ok(
    registry.actions.some(
      (action) =>
        action.id === "agent-proposal:LAUNCH_TASK" &&
        action.status === "enabled" &&
        action.oagContract?.approval === "human_review" &&
        action.oagContract?.targetObjectTypes.includes("Agent"),
    ),
  );
  assert.equal(registry.queues[0]?.href, "#/tasks/run-1");
  assert.equal(
    registry.queues[0]?.operationalSpine?.subjectType,
    "action_queue",
  );
});
