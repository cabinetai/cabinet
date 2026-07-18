import { expect, test } from "@playwright/test";

import { startConversation, waitForStatus } from "../test/support/cabinet-api";
import { claudeReply } from "../test/support/fake-agent-cli";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

/**
 * The tracer bullet: the core product loop, end to end, through every layer.
 *
 *   harness → seeded CABINET_DATA_DIR → daemon → Next.js app → browser
 *           → conversation API → adapter → fake `claude` CLI → SSE → DOM
 *
 * The agent is a fake CLI replaying canned stream JSON, so this needs no API key
 * and no network — which is what makes it safe to block merges and to run on
 * fork PRs.
 *
 * The second test is the other half of the same contract. What the browser shows
 * only proves Cabinet parsed the CLI's *output*; it says nothing about what
 * Cabinet *asked for*. A regression that dropped `--output-format stream-json`,
 * or passed the prompt as an argv instead of on stdin, would still render a
 * reply here — and would fail against a real Claude. So we assert on the
 * recorded invocation too.
 */

const REPLY = "pong-from-the-fake-agent";

test.describe.configure({ mode: "serial" });

let cabinet: CabinetInstance;

test.beforeAll(async () => {
  cabinet = await bootCabinet({ fakeAgents: [{ name: "claude" }] });
});

test.afterAll(async () => {
  await cabinet?.close();
});

test.beforeEach(async () => {
  await cabinet.agent("claude").reset([claudeReply(REPLY)]);
});

test("a user message runs the agent and its reply renders", async ({ page }) => {
  const conversation = await startConversation(cabinet, { userMessage: "ping" });

  // /tasks/[id] renders the conversation directly, with no AppShell — so this
  // exercises the agent loop rather than the onboarding wizard.
  await page.goto(`${cabinet.appUrl}/tasks/${conversation.id}`);

  // The user's opening turn is rendered from disk...
  const userTurns = page.locator('[data-testid="turn"][data-turn-role="user"]');
  await expect(userTurns.first()).toHaveText(/ping/);

  // ...and the agent's reply arrives over SSE once the fake CLI's stream is
  // parsed by the real adapter and flushed into the conversation store.
  const agentTurns = page.locator('[data-testid="turn"][data-turn-role="agent"]');
  await expect(agentTurns.first()).toContainText(REPLY, { timeout: 60_000 });

  // Exactly one agent turn, because the fake emits a well-formed ```cabinet
  // block. Omit it and the runner spends a second CLI invocation asking for one
  // (see agent-turns.spec.ts), producing a second turn with identical text —
  // which is why this assertion used to need a `.first()` and a paragraph of
  // apology. Pinning the count turns that race into a fact.
  await expect(agentTurns).toHaveCount(1);
});

test("the adapter invokes the CLI with Claude's print-mode contract", async () => {
  const conversation = await startConversation(cabinet, { userMessage: "ping" });
  await waitForStatus(cabinet, conversation.id, "completed");

  const [invocation] = await cabinet.agent("claude").waitForInvocations(1);

  // Print mode + stream-json is what makes the run non-interactive and parseable.
  // Drop any one of these and a real Claude either blocks waiting on a TTY or
  // emits prose the stream parser cannot read.
  expect(invocation.args).toEqual(
    expect.arrayContaining([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
    ])
  );

  // The prompt goes on stdin, never in argv — prompts routinely exceed ARG_MAX.
  expect(invocation.stdin).toContain("ping");
  expect(invocation.args.join(" ")).not.toContain("ping");

  // The epilogue rides along with it: it is what teaches the model the ```cabinet
  // contract that every downstream feature (summaries, artifacts, actions) reads.
  expect(invocation.stdin).toContain("```cabinet");

  // The opening turn has no session to resume.
  expect(invocation.has("--resume")).toBe(false);

  // cwd is inside the KB. Load-bearing, not incidental: the agent writes files
  // with its own tools, so cwd IS the blast radius. A regression that launched it
  // in the repo root would hand an agent Cabinet's own source to edit.
  expect(invocation.cwd.startsWith(cabinet.dataDir)).toBe(true);
});
