import assert from "node:assert/strict";
import test from "node:test";

import { MessageBus } from "../server/whatsapp/bus";
import type { NormalizedMessage } from "../server/whatsapp/types";

function msg(id: string, account = "a"): NormalizedMessage {
  return {
    account_id: account,
    id,
    chat_jid: "x@s.whatsapp.net",
    is_group: false,
    sender: "x@s.whatsapp.net",
    sender_name: "X",
    text: `m-${id}`,
    type: "text",
    timestamp: "2026-01-01T00:00:00.000Z",
    from_me: false,
  };
}

test("delivers to subscribers and honors unsubscribe", () => {
  const bus = new MessageBus();
  const seen: string[] = [];
  const unsub = bus.subscribe((m) => seen.push(m.id));
  bus.publish(msg("1"));
  unsub();
  bus.publish(msg("2"));
  assert.deepEqual(seen, ["1"]);
});

test("a throwing subscriber does not block the others", () => {
  const bus = new MessageBus();
  const seen: string[] = [];
  bus.subscribe(() => {
    throw new Error("bad subscriber");
  });
  bus.subscribe((m) => seen.push(m.id));
  bus.publish(msg("1"));
  assert.deepEqual(seen, ["1"]);
});

test("ring buffer caps backlog and recent() filters by account", () => {
  const bus = new MessageBus(3);
  for (let i = 1; i <= 5; i++) bus.publish(msg(String(i), i % 2 ? "odd" : "even"));
  assert.deepEqual(
    bus.recent().map((m) => m.id),
    ["3", "4", "5"]
  );
  assert.deepEqual(
    bus.recent(1).map((m) => m.id),
    ["5"]
  );
  assert.deepEqual(
    bus.recent(undefined, "odd").map((m) => m.id),
    ["3", "5"]
  );
});
