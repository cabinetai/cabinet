import { expect, test } from "@playwright/test";

import { claudeReplyStream } from "../test/support/fake-agent-cli";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

/**
 * The tracer bullet: the core product loop, end to end, through every layer.
 *
 *   harness → seeded CABINET_DATA_DIR → daemon → Next.js app → browser
 *           → conversation API → adapter → fake `claude` CLI → SSE → DOM
 *
 * The agent is a fake CLI replaying canned stream JSON, so this needs no API
 * key and no network — which is what makes it safe to block merges and to run
 * on fork PRs.
 */

const REPLY = "pong-from-the-fake-agent";

let cabinet: CabinetInstance;

test.beforeAll(async () => {
  cabinet = await bootCabinet({
    fakeAgents: [{ name: "claude", lines: claudeReplyStream(REPLY) }],
  });
});

test.afterAll(async () => {
  await cabinet?.close();
});

test("a user message runs the agent and its reply renders", async ({ page }) => {
  // Creating a conversation IS the "send the first message" action: the route
  // starts the run unless draftOnly is set.
  const response = await page.request.post(
    `${cabinet.appUrl}/api/agents/conversations`,
    { data: { agentSlug: "editor", userMessage: "ping", source: "manual" } }
  );
  expect(response.status(), await response.text()).toBe(201);
  const { conversation } = await response.json();

  // /tasks/[id] renders the conversation directly, with no AppShell — so this
  // exercises the agent loop rather than the onboarding wizard.
  await page.goto(`${cabinet.appUrl}/tasks/${conversation.id}`);

  // The user's opening turn is rendered from disk. (The runner may append
  // further user-role turns of its own later in the run, so anchor on the first.)
  const userTurns = page.locator('[data-testid="turn"][data-turn-role="user"]');
  await expect(userTurns.first()).toHaveText(/ping/);

  // ...and the agent's reply arrives over SSE once the fake CLI's stream is
  // parsed by the real adapter and flushed into the conversation store.
  //
  // .first() matters. The runner performs a follow-up cycle after the opening
  // turn, and the fake CLI replays the same canned stream on every invocation,
  // so more than one agent turn can legitimately carry this text. Asserting on
  // the unfiltered set is a race: locally the assertion resolves before the
  // second turn lands, but on slower CI both exist and strict mode fails.
  const reply = page
    .locator('[data-testid="turn"][data-turn-role="agent"]')
    .filter({ hasText: REPLY })
    .first();
  await expect(reply).toBeVisible({ timeout: 60_000 });
});
