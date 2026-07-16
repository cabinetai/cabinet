import { expect, test } from "@playwright/test";

import {
  continueConversation,
  getConversation,
  patchConversation,
  startConversation,
  waitForStatus,
} from "../test/support/cabinet-api";
import { claudeFailure, claudeReply } from "../test/support/fake-agent-cli";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

/**
 * Multi-turn control: what Cabinet does across successive CLI invocations.
 *
 * None of this is visible in a single-turn test, and all of it is where the
 * costly bugs live — a conversation that silently loses its session and replays
 * the whole transcript every turn still *looks* fine on screen, it just burns
 * tokens and drifts. The fake records every invocation, so these assert on the
 * argv Cabinet actually built for turn N given what turn N-1 returned.
 */

const SESSION = "sess-turn-one";

test.describe.configure({ mode: "serial" });

let cabinet: CabinetInstance;

test.beforeAll(async () => {
  cabinet = await bootCabinet({ fakeAgents: [{ name: "claude" }] });
});

test.afterAll(async () => {
  await cabinet?.close();
});

test("a follow-up turn resumes the session captured from the first", async () => {
  const claude = cabinet.agent("claude");
  await claude.reset([
    claudeReply("first", { sessionId: SESSION }),
    claudeReply("second", { sessionId: SESSION }),
  ]);

  const conversation = await startConversation(cabinet, { userMessage: "one" });
  await waitForStatus(cabinet, conversation.id, "completed");

  const response = await continueConversation(cabinet, conversation.id, "two");
  expect(response.status, await response.text()).toBeLessThan(300);
  await waitForStatus(cabinet, conversation.id, "completed");

  const invocations = await claude.waitForInvocations(2);

  // The whole point: turn 2 hands the CLI back the session id turn 1 emitted, so
  // the model keeps its context. Without it Cabinet must re-send the entire
  // transcript as a prompt — correct, but quadratically more expensive, and a
  // regression here is invisible to the naked eye.
  expect(invocations[1].has("--resume")).toBe(true);
  expect(invocations[1].flag("--resume")).toBe(SESSION);

  // And because it resumed, the prompt is the short "here is the next message"
  // shape, not a replay of the whole conversation.
  expect(invocations[1].stdin).toContain("two");
  expect(invocations[1].stdin).not.toContain("first");
});

test("a follow-up sent mid-run is rejected instead of racing the live turn", async () => {
  const claude = cabinet.agent("claude");
  // The agent is still thinking when the follow-up lands.
  await claude.reset([{ ...claudeReply("slow"), delayMs: 10_000 }]);

  const conversation = await startConversation(cabinet, { userMessage: "one" });
  await claude.waitForInvocations(1);

  const response = await continueConversation(cabinet, conversation.id, "interrupting");

  // 409, not 202. Without this guard a second adapter races the first on one
  // transcript, and a single Stop then kills only one of them.
  expect(response.status).toBe(409);
  expect((await response.json()).errorKind).toBe("busy");

  // Exactly one CLI process was ever spawned — the rejection happened before any
  // second spawn, which is the property that actually matters.
  expect(await claude.invocations()).toHaveLength(1);

  await patchConversation(cabinet, conversation.id, { action: "stop" });
});

test("a run that omits the cabinet block is asked for one, exactly once", async () => {
  const claude = cabinet.agent("claude");
  await claude.reset([
    // `cabinet: null` = a model that ignored the epilogue's required trailer.
    claudeReply("I forgot the trailer", { sessionId: SESSION, cabinet: null }),
    claudeReply("sorry", { sessionId: SESSION, cabinet: { summary: "recovered" } }),
  ]);

  const conversation = await startConversation(cabinet, { userMessage: "one" });
  await waitForStatus(cabinet, conversation.id, "completed");

  const invocations = await claude.waitForInvocations(2);

  // The retry is a real second CLI invocation, and it carries the retry prompt.
  expect(invocations[1].stdin).toMatch(/cabinet/i);

  // "Exactly once" is the assertion with teeth. The retry only fires when the
  // block is missing, so a bug that fired it unconditionally — or that failed to
  // notice the retry succeeded and looped — would double or unbound the token
  // cost of every run in the product. Nothing on screen would look wrong.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  expect(await claude.invocations()).toHaveLength(2);

  const meta = await getConversation(cabinet, conversation.id);
  expect(meta.summary).toBe("recovered");
});

test("an expired session falls back to replaying the transcript", async () => {
  const claude = cabinet.agent("claude");
  await claude.reset([
    claudeReply("first", { sessionId: SESSION }),
    // Turn 2 resumes — and the CLI says that session is gone. This is the real
    // failure mode after a `claude` upgrade or a machine restart.
    claudeFailure("Error: no conversation found with session id sess-turn-one"),
    claudeReply("recovered", { sessionId: "sess-fresh" }),
  ]);

  const conversation = await startConversation(cabinet, { userMessage: "one" });
  await waitForStatus(cabinet, conversation.id, "completed");

  await continueConversation(cabinet, conversation.id, "two");
  await waitForStatus(cabinet, conversation.id, "completed");

  const invocations = await claude.waitForInvocations(3);

  expect(invocations[1].has("--resume")).toBe(true);

  // Cabinet recognised the error as an expired session, dropped the dead session
  // and re-ran WITHOUT --resume, replaying the history in the prompt instead. The
  // user sees a reply; they never learn the session died. Get this wrong and the
  // turn just fails in their face.
  expect(invocations[2].has("--resume")).toBe(false);
  expect(invocations[2].stdin).toContain("first");

  const meta = await getConversation(cabinet, conversation.id);
  expect(meta.status).toBe("completed");
});
