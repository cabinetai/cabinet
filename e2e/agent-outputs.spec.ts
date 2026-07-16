import { expect, test } from "@playwright/test";

import {
  approveActions,
  getConversation,
  getConversationDetail,
  listConversations,
  startConversation,
  waitForStatus,
} from "../test/support/cabinet-api";
import { claudeReply } from "../test/support/fake-agent-cli";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

/**
 * What a run actually *produces* — the part of the product that outlives the
 * conversation.
 *
 * Two distinct mechanisms, easy to conflate:
 *
 *   artifacts  The agent writes files ITSELF. Its cwd is inside the KB and it
 *              runs with --dangerously-skip-permissions, so its own Write tool
 *              mutates the knowledge base. Cabinet does not apply the write; it
 *              only *records* the paths it finds on ARTIFACT: lines. So the fake
 *              must genuinely create the file (`files:`) AND declare it — which
 *              is what makes this a real test of the seam rather than of a
 *              string parser.
 *
 *   actions    The agent PROPOSES work (LAUNCH_TASK, SCHEDULE_JOB, …). Cabinet
 *              parks these as pending and dispatches nothing until a human
 *              approves. This is the blast-radius boundary of the whole agentic
 *              system: an agent that could self-dispatch could fork-bomb the
 *              user's machine. It deserves an e2e test, and until now had none.
 */

// Only `type: lead` personas may dispatch (resolvePersonaCanDispatch). The seed
// fixture's `editor` is a specialist, so a LAUNCH_TASK from it is rejected with a
// hard `persona_cannot_dispatch` warning — correct, but it means the dispatch
// path can only be reached through a lead. Hence a second persona.
const BOSS_PERSONA = `---
name: Boss
slug: boss
emoji: "\u{1F454}"
type: lead
department: engineering
role: Delegation
provider: claude-code
heartbeat: ""
heartbeatEnabled: false
budget: 100
active: true
workdir: /data
workspace: /
channels:
  - general
focus: []
---

You are Boss, a fixture lead used by the end-to-end suite. You delegate.
`;

test.describe.configure({ mode: "serial" });

let cabinet: CabinetInstance;

test.beforeAll(async () => {
  cabinet = await bootCabinet({
    fakeAgents: [{ name: "claude" }],
    files: { ".agents/boss/persona.md": BOSS_PERSONA },
  });
});

test.afterAll(async () => {
  await cabinet?.close();
});

test("a file the agent writes lands in the KB and is recorded as an artifact", async () => {
  await cabinet.agent("claude").reset([
    claudeReply("Wrote the note.", {
      // The agent's own tool call, simulated honestly: a real file, at a path
      // relative to the cwd Cabinet chose.
      files: { "notes/e2e-artifact.md": "# From the agent\n\nHello from the fake CLI.\n" },
      cabinet: { summary: "wrote a note", artifacts: ["notes/e2e-artifact.md"] },
    }),
  ]);

  const conversation = await startConversation(cabinet, {
    userMessage: "write me a note",
  });
  await waitForStatus(cabinet, conversation.id, "completed");

  // The file is really on disk in the knowledge base — not merely claimed.
  await expect(cabinet.read("notes/e2e-artifact.md")).resolves.toContain(
    "Hello from the fake CLI"
  );

  // ...and Cabinet linked it to the conversation, which is what surfaces it in
  // the UI and lets the user click through from the task to the page.
  const detail = await getConversationDetail(cabinet, conversation.id);
  expect(detail.meta.artifactPaths).toContain("notes/e2e-artifact.md");
  expect(detail.artifacts.map((artifact) => artifact.path)).toContain(
    "notes/e2e-artifact.md"
  );
  expect(detail.meta.summary).toBe("wrote a note");
});

test("a proposed task is parked as pending and dispatches nothing on its own", async () => {
  await cabinet.agent("claude").reset([
    claudeReply("I'll hand this to the editor.", {
      cabinet: {
        summary: "delegating",
        lines: ["LAUNCH_TASK: editor | Tidy the notes | Please tidy up notes/."],
      },
    }),
  ]);

  const conversation = await startConversation(cabinet, {
    agentSlug: "boss",
    userMessage: "get the notes tidied",
  });
  await waitForStatus(cabinet, conversation.id, "completed");

  const meta = await getConversation(cabinet, conversation.id);
  expect(meta.pendingActions).toHaveLength(1);

  // The assertion that matters: proposing is not doing. Exactly one CLI process
  // has run — the proposer's. No child agent was spawned behind the user's back.
  expect(await cabinet.agent("claude").invocations()).toHaveLength(1);

  // Counted by trigger, not in total: tests in this file share one Cabinet, so
  // earlier conversations are still on disk. `trigger: "agent"` is what a
  // dispatched child is stamped with, and there must be none.
  const dispatched = (await listConversations(cabinet)).filter(
    (item) => item.trigger === "agent"
  );
  expect(dispatched).toHaveLength(0);
});

test("approving a proposed task dispatches it as a real child run", async () => {
  const claude = cabinet.agent("claude");
  await claude.reset(
    [
      claudeReply("I'll hand this to the editor.", {
        cabinet: {
          summary: "delegating",
          lines: ["LAUNCH_TASK: editor | Tidy the notes | Please tidy up notes/."],
        },
      }),
    ],
    // Invocation 2+ is the dispatched child. A fallback rather than a second step,
    // because the child's turn count is the runner's business, not this test's.
    claudeReply("Tidied.", { cabinet: { summary: "tidied" } })
  );

  const parent = await startConversation(cabinet, {
    agentSlug: "boss",
    userMessage: "get the notes tidied",
  });
  await waitForStatus(cabinet, parent.id, "completed");

  const meta = await getConversation(cabinet, parent.id);
  const [pending] = meta.pendingActions ?? [];
  expect(pending, "the agent should have proposed a LAUNCH_TASK").toBeTruthy();

  const result = await approveActions(cabinet, parent.id, [pending.id]);
  expect(result.dispatched).toHaveLength(1);

  // The human said yes, so now a genuinely new conversation exists, owned by the
  // delegate and marked as agent-triggered — the lineage that cycle- and
  // depth-detection later depend on.
  const agentTriggered = async () =>
    (await listConversations(cabinet)).filter((item) => item.trigger === "agent");

  await expect.poll(async () => (await agentTriggered()).length, { timeout: 30_000 }).toBe(1);

  const [child] = await agentTriggered();
  expect(child.agentSlug).toBe("editor");

  // And the child really ran the CLI — dispatch means execution, not a row in a
  // table.
  await claude.waitForInvocations(2);
});
