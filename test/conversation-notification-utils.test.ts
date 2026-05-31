import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationNotificationIdentity,
  dedupeConversationNotifications,
  shouldEnqueueConversationNotification,
  shouldEnqueueConversationStart,
} from "../src/lib/agents/conversation-notification-utils";

test("conversation notifications only enqueue on a non-terminal to terminal transition", () => {
  assert.equal(shouldEnqueueConversationNotification("running", "completed"), true);
  assert.equal(shouldEnqueueConversationNotification("running", "failed"), true);
  assert.equal(shouldEnqueueConversationNotification("completed", "completed"), false);
  assert.equal(shouldEnqueueConversationNotification("failed", "failed"), false);
  assert.equal(shouldEnqueueConversationNotification("completed", "failed"), false);
  assert.equal(shouldEnqueueConversationNotification("cancelled", "completed"), true);
});

test("conversation notification identities are cabinet-aware", () => {
  assert.equal(
    buildConversationNotificationIdentity({
      id: "conv-1",
      cabinetPath: "vc-os",
      status: "completed",
    }),
    "vc-os::conv-1::completed"
  );
  assert.equal(
    buildConversationNotificationIdentity({
      id: "conv-1",
      status: "completed",
    }),
    "__ops__::conv-1::completed"
  );
});

test("conversation start notifications fire for background triggers only", () => {
  assert.equal(shouldEnqueueConversationStart("manual"), false);
  assert.equal(shouldEnqueueConversationStart("job"), true);
  assert.equal(shouldEnqueueConversationStart("heartbeat"), true);
  assert.equal(shouldEnqueueConversationStart("agent"), true);
});

test("duplicate conversation notifications are deduped by conversation identity", () => {
  const deduped = dedupeConversationNotifications([
    { id: "conv-1", cabinetPath: "vc-os", status: "completed" as const, seq: 1 },
    { id: "conv-1", cabinetPath: "vc-os", status: "completed" as const, seq: 2 },
    { id: "conv-1", cabinetPath: "vc-os", status: "failed" as const, seq: 3 },
  ]);

  assert.deepEqual(
    deduped.map((item) => item.seq),
    [1, 3]
  );
});
