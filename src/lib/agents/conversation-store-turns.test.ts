import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
type Store = typeof import("./conversation-store");
let store: Store;

before(async () => {
  tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "cabinet-convo-turns-test-")
  );
  process.env.CABINET_DATA_DIR = tempRoot;
  store = await import("./conversation-store");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

async function makeSingleShotConversation(title: string, prompt: string, agentOutput: string) {
  const meta = await store.createConversation({
    agentSlug: "general",
    title,
    trigger: "manual",
    prompt,
    providerId: "claude-code",
    adapterType: "claude_local",
  });
  // Simulate what the runner does after adapter completes:
  await store.appendConversationTranscript(meta.id, agentOutput);
  const finalized = await store.finalizeConversation(meta.id, {
    status: "completed",
    exitCode: 0,
    output: agentOutput,
  });
  return finalized!;
}

test("readConversationTurns synthesizes turn 1 from prompt + transcript on a single-shot", async () => {
  const output = [
    "Hi! I created the poem.",
    "",
    "```cabinet",
    "SUMMARY: Added a poem about moonlight.",
    "CONTEXT: The poems collection lives at poems/index.md",
    "ARTIFACT: poems/index.md",
    "```",
  ].join("\n");

  const meta = await makeSingleShotConversation(
    "Moonlight poem",
    "User request:\nWrite a poem about moonlight.",
    output
  );

  const turns = await store.readConversationTurns(meta.id);
  assert.equal(turns.length, 2, "turn 1 user + turn 1 agent");
  assert.equal(turns[0].role, "user");
  assert.equal(turns[0].turn, 1);
  assert.match(turns[0].content, /Write a poem about moonlight/);
  assert.equal(turns[1].role, "agent");
  assert.equal(turns[1].turn, 1);
  assert.match(turns[1].content, /I created the poem/);
});

test("readConversationTurns returns only user turn 1 when the conversation is still running", async () => {
  const meta = await store.createConversation({
    agentSlug: "general",
    title: "In flight",
    trigger: "manual",
    prompt: "User request:\ndo something",
  });
  const turns = await store.readConversationTurns(meta.id);
  assert.equal(turns.length, 1);
  assert.equal(turns[0].role, "user");
});

test("appendUserTurn + appendAgentTurn build up multi-turn state and aggregate tokens", async () => {
  const meta = await makeSingleShotConversation(
    "Start",
    "User request:\nfirst prompt",
    "First agent reply.\n```cabinet\nSUMMARY: first\n```"
  );

  const user2 = await store.appendUserTurn(
    meta.id,
    { content: "Follow-up question" }
  );
  assert.ok(user2);
  assert.equal(user2.turn, 2);
  assert.equal(user2.role, "user");

  const agent2 = await store.appendAgentTurn(meta.id, {
    content:
      "Second agent reply.\n```cabinet\nSUMMARY: second\nARTIFACT: foo/bar.md\n```",
    tokens: { input: 100, output: 40, cache: 20 },
  });
  assert.ok(agent2);
  assert.equal(agent2.turn, 2);
  assert.equal(agent2.role, "agent");
  assert.deepEqual(agent2.artifacts, ["foo/bar.md"]);

  const reread = await store.readConversationMeta(meta.id);
  assert.ok(reread);
  assert.equal(reread.tokens?.total, 140);
  assert.equal(reread.summary, "second", "rolling summary updates from latest cabinet block");
  assert.deepEqual(
    reread.artifactPaths.includes("foo/bar.md"),
    true,
    "artifact union carries across turns"
  );
});

test("appendAgentTurn with awaitingInput flips meta.awaitingInput=true", async () => {
  const meta = await makeSingleShotConversation(
    "Awaiting",
    "User request:\ngo",
    "Done.\n```cabinet\nSUMMARY: done\n```"
  );
  await store.appendUserTurn(meta.id, { content: "another" });
  const agent = await store.appendAgentTurn(meta.id, {
    content: "Should I go with option A or B?\n```cabinet\nSUMMARY: paused\n```",
    tokens: { input: 50, output: 10 },
    awaitingInput: true,
  });
  assert.ok(agent);
  const reread = await store.readConversationMeta(meta.id);
  assert.equal(reread?.awaitingInput, true);
});

test("updateAgentTurn settles a pending turn", async () => {
  const meta = await makeSingleShotConversation(
    "Pending flow",
    "User request:\ngo",
    "OK.\n```cabinet\nSUMMARY: ok\n```"
  );
  await store.appendUserTurn(meta.id, { content: "next" });
  await store.appendAgentTurn(meta.id, {
    content: "Working…",
    pending: true,
  });
  const settled = await store.updateAgentTurn(meta.id, 2, {
    content: "Final.\n```cabinet\nSUMMARY: all-done\nARTIFACT: a.md\n```",
    pending: false,
    tokens: { input: 300, output: 80 },
  });
  assert.ok(settled);
  const reread = await store.readConversationMeta(meta.id);
  assert.equal(reread?.status, "completed");
  assert.equal(reread?.tokens?.total, 380);
  assert.ok(reread?.artifactPaths.includes("a.md"));
});

test("writeSession + readSession round-trip", async () => {
  const meta = await makeSingleShotConversation(
    "Session",
    "User request:\ngo",
    "OK.\n```cabinet\nSUMMARY: ok\n```"
  );
  await store.writeSession(meta.id, {
    kind: "claude_local",
    resumeId: "sess-xyz",
    alive: true,
    lastUsedAt: new Date().toISOString(),
  });
  const back = await store.readSession(meta.id);
  assert.equal(back?.resumeId, "sess-xyz");
  assert.equal(back?.alive, true);
});

test("summaryEditedAt within 5 minutes prevents auto-update", async () => {
  const meta = await makeSingleShotConversation(
    "User summary",
    "User request:\ngo",
    "OK.\n```cabinet\nSUMMARY: auto-sum\n```"
  );
  // Simulate user hand-edit just now
  const patched = { ...meta, summary: "my manual summary", summaryEditedAt: new Date().toISOString() };
  await store.writeConversationMeta(patched);

  await store.appendUserTurn(meta.id, { content: "continue" });
  await store.appendAgentTurn(meta.id, {
    content: "done again.\n```cabinet\nSUMMARY: new-auto\n```",
    tokens: { input: 10, output: 2 },
  });
  const reread = await store.readConversationMeta(meta.id);
  assert.equal(reread?.summary, "my manual summary", "user edit wins");
});

test("readConversationDetail with withTurns returns turns + session", async () => {
  const meta = await makeSingleShotConversation(
    "With turns",
    "User request:\nfirst",
    "First.\n```cabinet\nSUMMARY: first\n```"
  );
  await store.writeSession(meta.id, {
    kind: "claude_local",
    resumeId: "s1",
    alive: true,
  });
  await store.appendUserTurn(meta.id, { content: "second" });
  await store.appendAgentTurn(meta.id, {
    content: "Second.\n```cabinet\nSUMMARY: second\n```",
    tokens: { input: 50, output: 10 },
  });

  const detail = await store.readConversationDetail(meta.id, undefined, {
    withTurns: true,
  });
  assert.ok(detail);
  assert.ok(detail.turns);
  assert.equal(detail.turns.length, 4, "t1-user, t1-agent, t2-user, t2-agent");
  assert.equal(detail.session?.resumeId, "s1");
});

test("backward compat: existing single-shot conversations without withTurns look identical", async () => {
  const meta = await makeSingleShotConversation(
    "Legacy",
    "User request:\nlegacy",
    "Legacy reply.\n```cabinet\nSUMMARY: legacy\n```"
  );
  const detail = await store.readConversationDetail(meta.id);
  assert.ok(detail);
  assert.equal(detail.turns, undefined, "no turns without withTurns flag");
  assert.equal(detail.session, undefined);
  assert.equal(detail.meta.id, meta.id);
  assert.match(detail.transcript, /Legacy reply/);
});

test("ARTIFACT line with comma-separated paths yields one artifact per file", async () => {
  const meta = await makeSingleShotConversation(
    "Multi-artifact",
    "User request:\nmake two files",
    [
      "Done.",
      "",
      "```cabinet",
      "SUMMARY: wrote two files",
      "ARTIFACT: cv-lab/cv.md, PROGRESS.md",
      "```",
    ].join("\n")
  );
  assert.deepEqual(meta.artifactPaths, ["cv-lab/cv.md", "PROGRESS.md"]);
});

test("normalizeArtifactPaths splits mixed separators and rejects placeholders", () => {
  assert.deepEqual(
    store.normalizeArtifactPaths("a/one.md, b/two.md ; c/three.md"),
    ["a/one.md", "b/two.md", "c/three.md"]
  );
  assert.deepEqual(
    store.normalizeArtifactPaths("relative/path/to/file for every KB file you created or updated"),
    []
  );
  assert.deepEqual(store.normalizeArtifactPaths("solo/only.md"), ["solo/only.md"]);
});

test("isCabinetBlockMissing returns true when the agent reply has no cabinet block", () => {
  const prose =
    "Built [index.html](/Users/me/Development/cabinet/data/x/y/index.html). It has a dark theme and some nice graphs.";
  assert.equal(store.isCabinetBlockMissing(prose), true);
});

test("isCabinetBlockMissing returns false for a well-formed cabinet block (with or without ARTIFACT)", () => {
  const withArtifact = [
    "Done.",
    "",
    "```cabinet",
    "SUMMARY: added poem",
    "ARTIFACT: poems/index.md",
    "```",
  ].join("\n");
  assert.equal(store.isCabinetBlockMissing(withArtifact), false);

  const readOnly = [
    "Here is what I found.",
    "",
    "```cabinet",
    "SUMMARY: answered question",
    "ARTIFACT: none",
    "```",
  ].join("\n");
  assert.equal(store.isCabinetBlockMissing(readOnly), false);
});

test("isCabinetBlockMissing returns true for empty output", () => {
  assert.equal(store.isCabinetBlockMissing(""), true);
  assert.equal(store.isCabinetBlockMissing("   \n\n  "), true);
});

test("isCabinetBlockMissing returns true for an empty cabinet fence (no fields)", () => {
  const empty = "Done.\n```cabinet\n```";
  assert.equal(store.isCabinetBlockMissing(empty), true);
});

test("finalizeConversation classifies codex model_unavailable when errorHint is omitted", async () => {
  const errorMsg =
    "The 'gpt-5.2-codex' model is not supported when using Codex with a ChatGPT account.";
  const meta = await store.createConversation({
    agentSlug: "general",
    title: "Model gate",
    trigger: "manual",
    prompt: "User request:\ntest",
    adapterType: "codex_local",
    providerId: "codex-cli",
  });
  await store.appendConversationTranscript(meta.id, errorMsg);
  const finalized = await store.finalizeConversation(meta.id, {
    status: "failed",
    exitCode: 1,
    output: errorMsg,
  });
  assert.equal(finalized?.errorKind, "model_unavailable");
  assert.match(finalized?.errorHint ?? "", /isn't available on this account's plan/i);

  const turns = await store.readConversationTurns(finalized!.id);
  const agent = turns.find((turn) => turn.role === "agent");
  assert.match(agent?.content ?? "", /not supported when using Codex/i);
});
