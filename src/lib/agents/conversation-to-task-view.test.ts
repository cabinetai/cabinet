import test from "node:test";
import assert from "node:assert/strict";
import { conversationMetaToTaskMeta } from "./conversation-to-task-view";
import type { ConversationMeta } from "@/types/conversations";

function makeMeta(overrides: Partial<ConversationMeta> = {}): ConversationMeta {
  return {
    id: "child-convo",
    agentSlug: "researcher",
    cabinetPath: "client-alpha",
    title: "Research follow-up",
    trigger: "agent",
    status: "completed",
    startedAt: "2026-05-03T00:00:00.000Z",
    promptPath: "",
    transcriptPath: "",
    mentionedPaths: [],
    artifactPaths: [],
    ...overrides,
  };
}

test("conversationMetaToTaskMeta mirrors agent action lineage fields", () => {
  const task = conversationMetaToTaskMeta(
    makeMeta({
      parentTaskId: "parent-convo",
      triggeringAgent: "ceo",
      spawnDepth: 2,
    }),
  );

  assert.equal(task.parentTaskId, "parent-convo");
  assert.equal(task.triggeringAgent, "ceo");
  assert.equal(task.spawnDepth, 2);
});
