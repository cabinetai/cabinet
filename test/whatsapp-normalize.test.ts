import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMessage } from "../server/whatsapp/normalize";

// Minimal stand-ins for Baileys' proto.IWebMessageInfo. We only build the
// fields normalizeMessage reads, matching the shapes seen on messages.upsert.
function dmText(overrides: Record<string, unknown> = {}) {
  return {
    key: { remoteJid: "14155550000@s.whatsapp.net", id: "ABC123", fromMe: false },
    pushName: "Alice",
    messageTimestamp: 1700000000,
    message: { conversation: "hello there" },
    ...overrides,
  };
}

test("normalizes a plain DM text message", () => {
  assert.deepEqual(normalizeMessage("lisa", dmText()), {
    account_id: "lisa",
    id: "ABC123",
    chat_jid: "14155550000@s.whatsapp.net",
    is_group: false,
    sender: "14155550000@s.whatsapp.net",
    sender_name: "Alice",
    text: "hello there",
    type: "text",
    timestamp: "2023-11-14T22:13:20.000Z",
    from_me: false,
  });
});

test("group message uses the participant as sender and flags is_group", () => {
  const out = normalizeMessage("lisa", {
    key: {
      remoteJid: "1234567890-1479221994@g.us",
      id: "G1",
      fromMe: false,
      participant: "972500000000@s.whatsapp.net",
    },
    pushName: "Bob",
    messageTimestamp: 1700000000,
    message: { extendedTextMessage: { text: "group hi" } },
  });
  assert.equal(out?.is_group, true);
  assert.equal(out?.sender, "972500000000@s.whatsapp.net");
  assert.equal(out?.text, "group hi");
  assert.equal(out?.type, "text");
});

test("media messages keep captions and are typed; empty caption survives", () => {
  const img = normalizeMessage(
    "a",
    dmText({ message: { imageMessage: { caption: "look" } } })
  );
  assert.equal(img?.type, "image");
  assert.equal(img?.text, "look");

  const audio = normalizeMessage("a", dmText({ message: { audioMessage: {} } }));
  assert.equal(audio?.type, "audio");
  assert.equal(audio?.text, "");
});

test("drops status broadcasts, protocol envelopes, and empty messages", () => {
  assert.equal(
    normalizeMessage("a", dmText({ key: { remoteJid: "status@broadcast", id: "S" } })),
    null
  );
  assert.equal(
    normalizeMessage("a", dmText({ message: { protocolMessage: { type: 3 } } })),
    null
  );
  assert.equal(normalizeMessage("a", { key: { remoteJid: "x@s.whatsapp.net" } }), null);
  assert.equal(normalizeMessage("a", null), null);
});

test("falls back to the number when pushName is missing, and carries from_me", () => {
  const out = normalizeMessage(
    "a",
    dmText({
      pushName: undefined,
      key: { remoteJid: "14155550000@s.whatsapp.net", id: "X", fromMe: true },
    })
  );
  assert.equal(out?.sender_name, "14155550000");
  assert.equal(out?.from_me, true);
});
