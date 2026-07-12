import { strict as assert } from "node:assert";
import { test } from "node:test";

import { resolveTriggerBadge } from "./trigger-badge";

test("known triggers keep their label and icon", () => {
  assert.deepEqual(resolveTriggerBadge("manual")?.label, "Manual");
  assert.equal(resolveTriggerBadge("manual")?.icon, "bot");
  assert.equal(resolveTriggerBadge("job")?.icon, "clock");
  assert.equal(resolveTriggerBadge("heartbeat")?.icon, "heartbeat");
  assert.equal(resolveTriggerBadge("telegram")?.icon, "telegram");
  assert.equal(resolveTriggerBadge("agent")?.label, "Agent");
  assert.equal(resolveTriggerBadge("channel")?.label, "Channel");
});

test("every known trigger resolves to a non-empty className", () => {
  for (const trigger of ["manual", "job", "heartbeat", "agent", "telegram", "channel"]) {
    const style = resolveTriggerBadge(trigger);
    assert.ok(style, `${trigger} should resolve`);
    assert.ok(style.className.length > 0, `${trigger} should have a className`);
  }
});

test("missing trigger renders no badge", () => {
  assert.equal(resolveTriggerBadge(undefined), null);
  assert.equal(resolveTriggerBadge(""), null);
});

// Regression: issue #85. Task data is written to disk by agents and older
// Cabinet versions, so `trigger` can hold a value outside the TaskTrigger
// union. The lookup used to return undefined and crash the whole board on
// `style.label`.
test("unknown trigger falls back to a usable badge instead of crashing", () => {
  const style = resolveTriggerBadge("webhook");
  assert.ok(style, "unknown trigger should still resolve to a badge");
  assert.equal(style.label, "webhook");
  assert.equal(style.icon, "unknown");
  assert.ok(style.className.length > 0);
});

// Inherited Object.prototype keys must not be mistaken for known triggers:
// `TRIGGER_STYLES["constructor"]` is truthy but has no label/className/icon.
test("prototype-chain keys are treated as unknown triggers", () => {
  for (const trigger of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    const style = resolveTriggerBadge(trigger);
    assert.ok(style, `${trigger} should resolve to a badge`);
    assert.equal(style.icon, "unknown", `${trigger} should be treated as unknown`);
    assert.equal(typeof style.label, "string");
    assert.equal(typeof style.className, "string");
  }
});
