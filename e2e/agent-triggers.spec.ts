import { expect, test } from "@playwright/test";

import {
  listConversations,
  runJob,
  startConversation,
  waitForStatus,
} from "../test/support/cabinet-api";
import { claudeReply } from "../test/support/fake-agent-cli";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

/**
 * The two things that make an agent run *unattended* rather than on demand:
 * a schedule, and the skills it carries into the run.
 *
 * Both are configuration that only takes effect at spawn time, and neither shows
 * up in the DOM — a scheduled job that quietly stopped passing its skills would
 * look completely healthy on the task board while producing worse work. The
 * recorded invocation is the only place that regression is visible.
 */

// The daemon's cron tick doesn't execute agents; it loopback-HTTP-calls the same
// `PUT /jobs/{id}` route this test calls, with `source: "scheduler"`. So driving
// the route directly exercises the real scheduled path without waiting on a cron
// minute boundary — a test that slept for a real tick would be slow AND flaky.
//
// Jobs are YAML at `<cabinet>/.jobs/<id>.yaml`, and are owned by `ownerAgent`
// (that is the key `loadAgentJobsBySlug` filters on).
const JOB = `id: nightly
name: Nightly digest
enabled: true
schedule: "0 3 * * *"
provider: claude-code
ownerAgent: editor
agentSlug: editor
prompt: Summarise what changed today.
createdAt: "2026-01-01T00:00:00.000Z"
updatedAt: "2026-01-01T00:00:00.000Z"
`;

const SKILL = `---
name: note-taker
description: A fixture skill used by the e2e suite.
---

When asked to take notes, write them under notes/.
`;

const SKILLED_PERSONA = `---
name: Scribe
slug: scribe
emoji: "\u{1F58A}"
type: specialist
department: engineering
role: Note taking
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
skills:
  - note-taker
---

You are Scribe, a fixture agent with a skill attached.
`;

test.describe.configure({ mode: "serial" });

let cabinet: CabinetInstance;

test.beforeAll(async () => {
  cabinet = await bootCabinet({
    fakeAgents: [{ name: "claude" }],
    files: {
      ".jobs/nightly.yaml": JOB,
      ".agents/skills/note-taker/SKILL.md": SKILL,
      ".agents/scribe/persona.md": SKILLED_PERSONA,
    },
  });
});

test.afterAll(async () => {
  await cabinet?.close();
});

test("a scheduled job runs the agent and files the result as a job-triggered task", async () => {
  await cabinet
    .agent("claude")
    .reset([claudeReply("Nothing changed today.", { cabinet: { summary: "digest done" } })]);

  const response = await runJob(cabinet, "editor", "nightly");
  expect(response.status, await response.text()).toBeLessThan(300);

  // The job's run becomes an ordinary conversation — that's what makes scheduled
  // work reviewable in the same task board as everything else.
  await expect
    .poll(
      async () =>
        (await listConversations(cabinet)).filter((item) => item.trigger === "job").length,
      { timeout: 30_000 }
    )
    .toBe(1);

  const [conversation] = (await listConversations(cabinet)).filter(
    (item) => item.trigger === "job"
  );
  const meta = await waitForStatus(cabinet, conversation.id, "completed");

  expect(meta.agentSlug).toBe("editor");
  expect(meta.jobId).toBe("nightly");
  expect(meta.summary).toBe("digest done");

  // The job's own prompt reached the CLI — not the persona's, and not an empty
  // string. A job that fires on schedule and prompts with nothing is the kind of
  // bug that burns tokens nightly and is noticed a month later.
  const [invocation] = await cabinet.agent("claude").waitForInvocations(1);
  expect(invocation.stdin).toContain("Summarise what changed today.");
});

test("an agent's skills are mounted into the run", async () => {
  await cabinet.agent("claude").reset([claudeReply("Noted.")]);

  // `cabinetPath` is not decoration. A cabinet-scoped skill lives at
  // <cabinet>/.agents/skills, and that origin is only scanned when the run
  // carries a cabinetPath — omit it and the skill is silently not mounted, even
  // though the finished conversation still shows `cabinetPath: "."` in its meta.
  // Every production caller (manual route, job, heartbeat) passes it, so this is
  // the realistic path.
  const conversation = await startConversation(cabinet, {
    agentSlug: "scribe",
    userMessage: "take a note",
    cabinetPath: ".",
  });
  await waitForStatus(cabinet, conversation.id, "completed");

  const [invocation] = await cabinet.agent("claude").waitForInvocations(1);

  // Claude receives skills as a directory, passed twice: --plugin-dir registers
  // the plugin, --add-dir makes its files readable. Both, or the skill is inert.
  const pluginDir = invocation.flag("--plugin-dir");
  expect(pluginDir, "persona skills should be mounted as a plugin dir").toBeTruthy();
  expect(invocation.flag("--add-dir")).toBe(pluginDir);

  // And the mount is real. This is the file listing the fake captured at spawn
  // time — the exact tree a real `claude` would have loaded. Asserting only on the
  // flag would pass for an empty directory, which is the failure mode worth
  // catching: a skill-less agent still answers, just worse.
  //
  // (It must be read from the snapshot, not from disk. The mount is a per-session
  // tmpdir that Cabinet removes when the run ends, so by the time this assertion
  // runs the directory is already gone.)
  expect(invocation.filesIn("--plugin-dir")).toContain("skills/note-taker/SKILL.md");

  // The plugin manifest is what makes Claude treat the dir as a plugin at all.
  expect(invocation.filesIn("--plugin-dir")).toContain(".claude-plugin/plugin.json");
});

test("an agent with no skills gets no skills mount", async () => {
  await cabinet.agent("claude").reset([claudeReply("Fine.")]);

  const conversation = await startConversation(cabinet, {
    userMessage: "hello",
    cabinetPath: ".",
  });
  await waitForStatus(cabinet, conversation.id, "completed");

  const [invocation] = await cabinet.agent("claude").waitForInvocations(1);

  // The negative case earns its keep: a bug that mounted the whole catalog for
  // every agent would pass the test above while silently widening what each agent
  // can do. The seed `editor` persona declares no skills, so it must get no flag.
  expect(invocation.has("--plugin-dir")).toBe(false);
});
