import assert from "node:assert/strict";
import test from "node:test";

import type { ConversationPersistenceEvidence } from "./contracts";
import {
  assertExactAcceptanceToken,
  buildConversationCheckpoint,
  LiveCabinetAcpTransport,
} from "./transport";

test("exact-token failures never retain assistant content", () => {
  const privateResponse = "CABINET_ACCEPTANCE_OK plus private model output";
  assert.throws(
    () => assertExactAcceptanceToken(privateResponse, "initial"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "initial response was not the exact acceptance token");
      assert.doesNotMatch(error.message, /private model output/);
      return true;
    },
  );
});

test("content-free checkpoint records exact cardinality and duplicate identities", () => {
  const checkpoint = buildConversationCheckpoint(
    "H",
    "second_restart_reloaded",
    {
      meta: { id: "conversation-private", status: "completed" },
      session: { resumeId: "session-private", alive: false },
      turns: [
        { id: "u1", turn: 1, role: "user", content: "private" },
        { id: "a1", turn: 1, role: "agent", content: "private" },
        { id: "u2", turn: 2, role: "user", content: "private" },
        { id: "a2", turn: 2, role: "agent", content: "private" },
      ],
      persistence: {
        pendingRequiredWrites: 0,
        inMemoryCounts: { user: 2, assistant: 2, completedAssistant: 2, total: 4 },
      },
    },
    null,
  );

  assert.deepEqual(checkpoint.durableStoreCounts, {
    user: 2,
    assistant: 2,
    completedAssistant: 2,
    total: 4,
    duplicateTurnIdentities: 0,
  });
  assert.equal(checkpoint.pendingRequiredWrites, 0);
  assert.doesNotMatch(JSON.stringify(checkpoint), /private/);
});

test("pending and failed assistant lifecycle states are preserved without content", () => {
  const checkpoint = buildConversationCheckpoint(
    "E",
    "follow_up_accepted",
    {
      meta: { id: "conversation", status: "running" },
      turns: [
        { id: "u2", turn: 2, role: "user", content: "hidden" },
        { id: "a2", turn: 2, role: "agent", content: "", pending: true },
        { id: "a3", turn: 3, role: "agent", content: "hidden", exitCode: 1 },
      ],
    },
    "follow-up",
  );

  assert.deepEqual(
    checkpoint.turns.map((turn) => turn.lifecycleState),
    ["completed", "pending", "failed"],
  );
  assert.doesNotMatch(JSON.stringify(checkpoint), /hidden/);
});

test("failed cardinality still exports the complete diagnostic ledger", async () => {
  const originalFetch = globalThis.fetch;
  const completedDetail = {
    meta: { id: "conversation-private", status: "completed" },
    session: { resumeId: "session-private", alive: false },
    turns: [
      { id: "u1", turn: 1, role: "user", content: "hidden" },
      { id: "a1", turn: 1, role: "agent", content: "CABINET_ACCEPTANCE_OK" },
      { id: "u2", turn: 2, role: "user", content: "hidden" },
    ],
  };
  let postCount = 0;
  let restarts = 0;
  let evidence: ConversationPersistenceEvidence | null = null;
  const requests: Array<{ method: string; pathname: string }> = [];
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") {
      postCount += 1;
      return Response.json(
        postCount === 1
          ? { conversation: { id: "conversation-private", status: "running" } }
          : { ok: true },
      );
    }
    return Response.json(completedDetail);
  };
  try {
    await assert.rejects(
      new LiveCabinetAcpTransport().runTwoTurnContract(
        {
          appUrl: "http://127.0.0.1:4314",
          restart: async () => {
            restarts += 1;
          },
        },
        (value) => {
          evidence = value;
        },
        (method, pathname) => requests.push({ method, pathname }),
      ),
      /exactly two user and two assistant turns/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(restarts, 2);
  assert.equal(evidence?.checkpoints.length, 8);
  assert.equal(evidence?.checkpoints.at(-1)?.checkpoint, "H");
  assert.equal(evidence?.exactFinalCardinality, false);
  assert.deepEqual(requests, [
    { method: "POST", pathname: "/api/agents/conversations" },
    {
      method: "POST",
      pathname: "/api/agents/conversations/conversation-private/continue",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(evidence), /hidden|private/);
});
