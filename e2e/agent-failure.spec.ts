import { expect, test } from "@playwright/test";

import {
  patchConversation,
  startConversation,
  waitForStatus,
} from "../test/support/cabinet-api";
import { claudeFailure, claudeReply } from "../test/support/fake-agent-cli";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

/**
 * When the agent CLI fails, and when the user pulls the plug.
 *
 * Cabinet never shows the user raw stderr. It classifies it (error-classification.ts)
 * into an errorKind and a remediation hint, because "the run failed" is useless
 * and "your Claude login expired, run `claude login`" is actionable. That
 * classification is a pure function of the CLI's stderr and exit code — which is
 * exactly what a scripted fake can produce on demand, and what no test could
 * produce before.
 *
 * These are the paths a user hits on their worst day, so they are the ones most
 * worth pinning: an agent that dies at 2am should leave a legible corpse.
 */

test.describe.configure({ mode: "serial" });

let cabinet: CabinetInstance;

test.beforeAll(async () => {
  cabinet = await bootCabinet({ fakeAgents: [{ name: "claude" }] });
});

test.afterAll(async () => {
  await cabinet?.close();
});

test("an expired login is classified, not surfaced as a bare failure", async () => {
  await cabinet
    .agent("claude")
    .reset([claudeFailure("Invalid API key · Please run /login\n401 not logged in")]);

  const conversation = await startConversation(cabinet, { userMessage: "ping" });
  const meta = await waitForStatus(cabinet, conversation.id, "failed");

  expect(meta.errorKind).toBe("auth_expired");
  // The hint is the whole point of classifying — it tells the user what to do.
  expect(meta.errorHint).toBeTruthy();
  expect(meta.exitCode).not.toBe(0);
});

test("a rate limit is classified as retryable, not as a broken agent", async () => {
  await cabinet
    .agent("claude")
    .reset([claudeFailure("Error: 429 rate limit exceeded, please retry later")]);

  const conversation = await startConversation(cabinet, { userMessage: "ping" });
  const meta = await waitForStatus(cabinet, conversation.id, "failed");

  // Distinguishing this from auth_expired is what lets the UI offer "retry"
  // rather than sending the user off to re-authenticate for no reason.
  expect(meta.errorKind).toBe("rate_limited");
});

test("a failed run leaves the task failed and renders the failure in the UI", async ({
  page,
}) => {
  await cabinet.agent("claude").reset([claudeFailure("boom: the CLI exploded", 2)]);

  const conversation = await startConversation(cabinet, { userMessage: "ping" });
  await waitForStatus(cabinet, conversation.id, "failed");

  await page.goto(`${cabinet.appUrl}/tasks/${conversation.id}`);

  // The user's message survives a failed run — losing it would mean retyping.
  await expect(
    page.locator('[data-testid="turn"][data-turn-role="user"]').first()
  ).toHaveText(/ping/);
});

test("stopping a running agent kills the CLI and settles the task", async () => {
  const claude = cabinet.agent("claude");
  // `hang` never exits. A fake that returns promptly could finish before the stop
  // request lands, and the test would pass without ever exercising the kill path.
  await claude.reset([{ ...claudeReply("never gets here"), hang: true }]);

  const conversation = await startConversation(cabinet, { userMessage: "start a long job" });
  await claude.waitForInvocations(1);

  const response = await patchConversation(cabinet, conversation.id, { action: "stop" });
  expect(response.status, await response.text()).toBeLessThan(300);

  // Stop finalizes the conversation itself rather than waiting for the process to
  // report — a killed CLI may never say anything again, and a task stuck on
  // "running" forever is the bug this guards.
  const meta = await waitForStatus(cabinet, conversation.id, "failed", 30_000);
  expect(meta.status).toBe("failed");

  // And it did not quietly respawn.
  expect(await claude.invocations()).toHaveLength(1);
});
