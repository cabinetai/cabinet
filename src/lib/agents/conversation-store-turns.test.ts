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
  await store?.closeConversationStore();
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("conversation-store lifecycle drains pending work before close completes", async () => {
  const lifecycle = new store.ConversationStoreLifecycle();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let completed = false;

  assert.equal(lifecycle.schedule(async () => {
    await gate;
    completed = true;
  }), true);

  const closing = lifecycle.close();
  await Promise.resolve();
  assert.equal(completed, false, "close must remain pending while owned work is active");
  release();
  await closing;
  assert.equal(completed, true);
});

test("conversation-store lifecycle rejects new work after close and closes repeatedly", async () => {
  const lifecycle = new store.ConversationStoreLifecycle();
  await lifecycle.close();
  let ran = false;
  assert.equal(lifecycle.schedule(async () => { ran = true; }), false);
  await lifecycle.close();
  assert.equal(ran, false, "no background write may start after close");
});

test("conversation-store lifecycle keeps cleanup failures visible", async () => {
  const lifecycle = new store.ConversationStoreLifecycle();
  assert.equal(lifecycle.schedule(async () => {
    throw new Error("expected cleanup failure");
  }), true);
  await assert.rejects(
    lifecycle.close(),
    /Conversation store background work failed during shutdown/
  );
});

test("conversation-store lifecycle instances do not share pending work", async () => {
  const first = new store.ConversationStoreLifecycle();
  const second = new store.ConversationStoreLifecycle();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  assert.equal(first.schedule(() => gate), true);
  await second.close();
  assert.equal(second.schedule(async () => {}), false);
  assert.equal(first.schedule(async () => {}), true);
  release();
  await first.close();
});

test("timer-backed background work is settled before temporary cleanup", async () => {
  const lifecycle = new store.ConversationStoreLifecycle();
  const ownedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-lifecycle-test-"));
  const marker = path.join(ownedRoot, "complete");
  assert.equal(lifecycle.schedule(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await fs.writeFile(marker, "done", "utf8");
  }), true);
  await lifecycle.close();
  assert.equal(await fs.readFile(marker, "utf8"), "done");
  await fs.rm(ownedRoot, { recursive: true, force: true });
  await assert.rejects(fs.access(ownedRoot), { code: "ENOENT" });
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

test("prompt acceptance never exposes a new user turn under stale completed metadata", async () => {
  const meta = await makeSingleShotConversation(
    "Acceptance ordering",
    "User request:\ninitial",
    "Initial.\n```cabinet\nSUMMARY: initial\n```"
  );
  let settled = false;
  const accepting = store
    .acceptConversationPrompt(meta.id, {
      content: `follow-up-${"x".repeat(4 * 1024 * 1024)}`,
    })
    .finally(() => {
      settled = true;
    });

  while (!settled) {
    const detail = await store.readConversationDetail(meta.id, undefined, {
      withTurns: true,
    });
    const userCount =
      detail?.turns?.filter((turn) => turn.role === "user").length ?? 0;
    assert.equal(
      userCount >= 2 && detail?.meta.status === "completed",
      false,
      "a visible follow-up user turn must already have running lifecycle metadata"
    );
    await Promise.resolve();
  }

  const accepted = await accepting;
  assert.equal(accepted.accepted, true);
  const detail = await store.readConversationDetail(meta.id, undefined, {
    withTurns: true,
  });
  assert.equal(detail?.meta.status, "running");
  assert.equal(
    detail?.turns?.filter((turn) => turn.role === "user").length,
    2
  );
});

test("readConversationTurns fabricates a pending agent turn while running with no output yet", async () => {
  const meta = await store.createConversation({
    agentSlug: "general",
    title: "In flight",
    trigger: "manual",
    prompt: "User request:\ndo something",
  });
  // createConversation defaults to status "running". With no transcript bytes
  // yet, readTurnOne deliberately fabricates an empty *pending* agent turn so
  // the UI shows a typing indicator (not a blank gap) during adapter
  // cold-start, rather than returning the user turn alone.
  const turns = await store.readConversationTurns(meta.id);
  assert.equal(turns.length, 2, "user turn + fabricated pending agent placeholder");
  assert.equal(turns[0].role, "user");
  assert.equal(turns[1].role, "agent");
  assert.equal(turns[1].pending, true);
  assert.equal(turns[1].content, "");
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

test("finalizeConversation preserves artifacts merged from later turns", async () => {
  const meta = await makeSingleShotConversation(
    "Late finalize",
    "User request:\nstart",
    "Initial.\n```cabinet\nSUMMARY: initial\nARTIFACT: reports/source.md\n```"
  );
  await store.appendUserTurn(meta.id, { content: "render as png" });
  await store.appendAgentTurn(meta.id, {
    content: "Rendering...",
    pending: true,
  });
  await store.updateAgentTurn(meta.id, 2, {
    content:
      "Rendered.\n```cabinet\nSUMMARY: rendered\nARTIFACT: reports/output.png\n```",
    pending: false,
  });

  await store.finalizeConversation(meta.id, {
    status: "completed",
    exitCode: 0,
    output: "Initial.\n```cabinet\nSUMMARY: initial\nARTIFACT: reports/source.md\n```",
  });

  const reread = await store.readConversationMeta(meta.id);
  assert.deepEqual(reread?.artifactPaths, [
    "reports/source.md",
    "reports/output.png",
  ]);

  const artifactFile = await fs.readFile(
    path.join(tempRoot, ".agents", ".conversations", meta.id, "artifacts.json"),
    "utf8"
  );
  assert.deepEqual(JSON.parse(artifactFile), [
    { path: "reports/source.md" },
    { path: "reports/output.png" },
  ]);

  const eventsBeforeRead = await store.readEventLog(meta.id);
  const detail = await store.readConversationDetail(meta.id);
  assert.ok(detail);
  const eventsAfterRead = await store.readEventLog(meta.id);
  assert.equal(
    eventsAfterRead.length,
    eventsBeforeRead.length,
    "reading a repaired conversation must not append another task.updated event"
  );
});

test("read-repair strips placeholder artifacts and then stays idempotent", async () => {
  const meta = await makeSingleShotConversation(
    "Placeholder repair",
    "User request:\nstart",
    "Done.\n```cabinet\nSUMMARY: done\nARTIFACT: reports/real.md\n```"
  );

  // Inject the unfilled ARTIFACT hint into stored meta — the placeholder shape
  // that `needsRepair` flags via isPlaceholderCabinetValue. (Matches
  // PLACEHOLDER_ARTIFACT_HINT in conversation-store.ts.)
  const metaFile = path.join(
    tempRoot, ".agents", ".conversations", meta.id, "meta.json"
  );
  const stored = JSON.parse(await fs.readFile(metaFile, "utf8"));
  stored.artifactPaths = [
    "relative/path/to/file for every KB file you created or updated",
    ...stored.artifactPaths,
  ];
  await fs.writeFile(metaFile, JSON.stringify(stored, null, 2));

  // First read triggers repair: the placeholder is dropped, the real path kept.
  await store.readConversationDetail(meta.id);
  const repaired = await store.readConversationMeta(meta.id);
  assert.deepEqual(repaired?.artifactPaths, ["reports/real.md"]);

  // artifacts.json mirrors the cleaned list.
  const artifactFile = await fs.readFile(
    path.join(tempRoot, ".agents", ".conversations", meta.id, "artifacts.json"),
    "utf8"
  );
  assert.deepEqual(JSON.parse(artifactFile), [{ path: "reports/real.md" }]);

  // Idempotent: now that the placeholder is gone, a further read must not
  // re-finalize (no new task.updated event).
  const before = await store.readEventLog(meta.id);
  await store.readConversationDetail(meta.id);
  const after = await store.readEventLog(meta.id);
  assert.equal(
    after.length,
    before.length,
    "a placeholder-repaired conversation must not re-finalize on later reads"
  );
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

test("readEventLog resumes strictly after the last stable event sequence", async () => {
  const meta = await store.createConversation({
    agentSlug: "general",
    title: "Replay sequence",
    trigger: "manual",
    prompt: "User request:\nreplay",
  });
  const first = await store.appendEventLog(meta.id, { type: "runtime.event", marker: "first" });
  const second = await store.appendEventLog(meta.id, { type: "runtime.event", marker: "second" });
  const third = await store.appendEventLog(meta.id, { type: "runtime.event", marker: "third" });
  assert.ok(first && second && third);

  const replay = await store.readEventLog(meta.id, { fromSeq: first });
  assert.deepEqual(replay.map((event) => event.seq), [second, third]);
  assert.deepEqual(replay.map((event) => event.marker), ["second", "third"]);
  assert.equal(new Set(replay.map((event) => event.seq)).size, replay.length);
});

test("late Hermes runtime events cannot regress a completed conversation to streaming", async () => {
  const meta = await store.createConversation({
    agentSlug: "general",
    title: "Hermes terminal status",
    trigger: "manual",
    prompt: "User request:\nresume",
    providerId: "hermes",
    adapterType: "hermes_runtime",
  });
  await store.writeConversationMeta({
    ...meta,
    status: "completed",
    hermes: {
      profile: "operator-os",
      sessionId: "stored-session",
      runId: "run-1",
      eventSequence: 4,
      status: "completed",
      artifactPaths: [],
      updatedAt: new Date().toISOString(),
    },
  });

  await store.appendRuntimeEvent(meta.id, {
    type: "message.delta",
    sessionId: "stored-session",
    liveSessionId: "live-session",
    runId: "run-1",
    payload: { text: "late" },
    occurredAt: new Date().toISOString(),
  });

  const reread = await store.readConversationMeta(meta.id);
  assert.equal(reread?.hermes?.status, "completed");
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

test("synthetic restart keeps one stable 2/2 turn sequence", async () => {
  const meta = await makeSingleShotConversation(
    "Restart durability",
    "User request:\ninitial",
    "Initial response.\n```cabinet\nSUMMARY: initial\n```"
  );
  await store.writeSession(meta.id, {
    kind: "hermes_runtime",
    resumeId: "native-session-stable",
    alive: true,
  });

  // Checkpoint D: a fresh disk read after the initial completion.
  const afterInitialRestart = await store.readConversationTurns(meta.id);
  assert.deepEqual(
    afterInitialRestart.map((turn) => [turn.turn, turn.role]),
    [[1, "user"], [1, "agent"]]
  );

  const userInput = {
    content: "follow-up",
    requestId: "request-follow-up",
  };
  const firstUser = await store.appendUserTurn(meta.id, userInput);
  const duplicateUser = await store.appendUserTurn(meta.id, userInput);
  assert.equal(
    duplicateUser?.id,
    firstUser?.id,
    "duplicate submission must return the stable server-owned user turn"
  );

  const placeholderInput = {
    content: "",
    pending: true,
    requestId: "request-follow-up",
  };
  const firstPlaceholder = await store.appendAgentTurn(meta.id, placeholderInput);
  const duplicatePlaceholder = await store.appendAgentTurn(meta.id, placeholderInput);
  assert.equal(
    duplicatePlaceholder?.id,
    firstPlaceholder?.id,
    "duplicate placeholder creation must return the stable assistant turn"
  );

  const committed = await store.commitTurnResult(meta.id, {
    requestId: "request-follow-up",
    assistant: {
      content: "Follow-up response.",
      sessionId: "native-session-stable",
    },
    session: {
      kind: "hermes_runtime",
      resumeId: "native-session-stable",
      alive: true,
    },
  });
  assert.equal(committed?.assistantTurn.id, firstPlaceholder?.id);
  const duplicateCompletion = await store.commitTurnResult(meta.id, {
    requestId: "request-follow-up",
    assistant: {
      content: "ignored duplicate completion",
      sessionId: "native-session-stable",
    },
    session: {
      kind: "hermes_runtime",
      resumeId: "native-session-stable",
      alive: true,
    },
  });
  assert.equal(duplicateCompletion?.assistantTurn.id, firstPlaceholder?.id);

  // Checkpoint H: a second fresh disk read must prove exact cardinality.
  const afterSecondRestart = await store.readConversationTurns(meta.id);
  assert.equal(
    afterSecondRestart.filter((turn) => turn.role === "user").length,
    2
  );
  assert.equal(
    afterSecondRestart.filter((turn) => turn.role === "agent").length,
    2
  );
  assert.equal((await store.readSession(meta.id))?.resumeId, "native-session-stable");
});

test("stream chunks are idempotent and late chunks cannot reopen completion", async () => {
  const meta = await makeSingleShotConversation(
    "Chunk durability",
    "User request:\ninitial",
    "Initial.\n```cabinet\nSUMMARY: initial\n```"
  );
  await store.appendUserTurn(meta.id, {
    content: "follow-up",
    requestId: "chunk-request",
  });
  const first = await store.appendAgentTurnChunk(meta.id, {
    requestId: "chunk-request",
    chunkId: "chunk-1",
    content: "Hello",
  });
  const duplicate = await store.appendAgentTurnChunk(meta.id, {
    requestId: "chunk-request",
    chunkId: "chunk-1",
    content: "Hello",
  });
  assert.equal(duplicate?.id, first?.id);
  assert.equal(duplicate?.content, "Hello");

  await store.appendAgentTurnChunk(meta.id, {
    requestId: "chunk-request",
    chunkId: "chunk-2",
    content: " world",
  });
  const completed = await store.appendAgentTurn(meta.id, {
    requestId: "chunk-request",
    content: "Hello world",
    pending: false,
  });
  const late = await store.appendAgentTurnChunk(meta.id, {
    requestId: "chunk-request",
    chunkId: "chunk-late",
    content: " ignored",
  });
  assert.equal(late?.id, completed?.id);
  assert.equal(late?.content, "Hello world");
  assert.equal(late?.pending, undefined);
});

test("restart preserves crash-before and crash-after finalization states", async () => {
  const meta = await makeSingleShotConversation(
    "Crash boundaries",
    "User request:\ninitial",
    "Initial.\n```cabinet\nSUMMARY: initial\n```"
  );
  await store.appendUserTurn(meta.id, {
    content: "follow-up",
    requestId: "crash-request",
  });
  const pending = await store.appendAgentTurn(meta.id, {
    content: "partial",
    pending: true,
    requestId: "crash-request",
  });

  const afterCrashBefore = await store.readConversationTurns(meta.id);
  const pendingAfterRestart = afterCrashBefore.find(
    (turn) => turn.id === pending?.id
  );
  assert.equal(pendingAfterRestart?.pending, true);
  assert.equal(pendingAfterRestart?.content, "partial");

  const committed = await store.commitTurnResult(meta.id, {
    requestId: "crash-request",
    assistant: { content: "final" },
    session: {
      kind: "hermes_runtime",
      resumeId: "crash-session",
      alive: true,
    },
  });
  const afterCrashAfter = await store.readConversationTurns(meta.id);
  const finalizedAfterRestart = afterCrashAfter.find(
    (turn) => turn.id === pending?.id
  );
  assert.equal(finalizedAfterRestart?.pending, undefined);
  assert.equal(finalizedAfterRestart?.content, "final");
  assert.ok(finalizedAfterRestart?.completedAt);

  // Simulate a process dying after each canonical turn rename but before its
  // meta write. Replaying the same request repairs meta without new turn IDs.
  await store.writeConversationMeta({
    ...meta,
    status: "completed",
    turnCount: 1,
  });
  const repairedUser = await store.appendUserTurn(meta.id, {
    content: "follow-up",
    requestId: "crash-request",
  });
  assert.equal(repairedUser?.id, pendingAfterRestart && afterCrashBefore.find(
    (turn) => turn.role === "user" && turn.requestId === "crash-request"
  )?.id);
  assert.equal((await store.readConversationMeta(meta.id))?.status, "running");
  assert.equal((await store.readConversationMeta(meta.id))?.turnCount, 2);

  await store.writeConversationMeta({
    ...meta,
    status: "running",
    turnCount: 2,
  });
  const repairedAssistant = await store.appendAgentTurn(meta.id, {
    content: "final",
    pending: false,
    requestId: "crash-request",
  });
  assert.equal(repairedAssistant?.id, committed?.assistantTurn.id);
  assert.equal((await store.readConversationMeta(meta.id))?.status, "completed");
});

test("session-load replay is rejected by the turn store", async () => {
  const meta = await makeSingleShotConversation(
    "Replay gate",
    "User request:\ninitial",
    "Initial.\n```cabinet\nSUMMARY: initial\n```"
  );
  assert.equal(
    await store.appendUserTurn(meta.id, {
      content: "historical user",
      requestId: "load-history",
      source: "session-load",
    }),
    null
  );
  assert.equal(
    await store.appendAgentTurn(meta.id, {
      content: "historical assistant",
      requestId: "load-history",
      source: "session-load",
    }),
    null
  );
  const turns = await store.readConversationTurns(meta.id);
  assert.equal(turns.length, 2);
});

test("separate conversations never share generated turn identities", async () => {
  const first = await makeSingleShotConversation(
    "Identity A",
    "User request:\na",
    "A.\n```cabinet\nSUMMARY: a\n```"
  );
  const second = await makeSingleShotConversation(
    "Identity B",
    "User request:\nb",
    "B.\n```cabinet\nSUMMARY: b\n```"
  );
  const firstTurn = await store.appendUserTurn(first.id, {
    content: "next",
    requestId: "same-request-label",
  });
  const secondTurn = await store.appendUserTurn(second.id, {
    content: "next",
    requestId: "same-request-label",
  });
  assert.notEqual(firstTurn?.id, secondTurn?.id);
});

test("history delay and failure remain visible without erasing canonical turns", async () => {
  const meta = await makeSingleShotConversation(
    "History isolation",
    "User request:\ninitial",
    "Initial.\n```cabinet\nSUMMARY: initial\n```"
  );
  const user = await store.appendUserTurn(meta.id, {
    content: "durable",
    requestId: "history-request",
  });

  const lifecycle = new store.ConversationStoreLifecycle();
  let release!: () => void;
  const delay = new Promise<void>((resolve) => { release = resolve; });
  lifecycle.schedule(async () => {
    await delay;
    throw new Error("synthetic history failure");
  });
  const closing = lifecycle.close();
  assert.equal(
    (await store.readConversationTurns(meta.id)).some((turn) => turn.id === user?.id),
    true
  );
  release();
  await assert.rejects(closing, /background work failed during shutdown/);
  assert.equal(
    (await store.readConversationTurns(meta.id)).some((turn) => turn.id === user?.id),
    true
  );
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
