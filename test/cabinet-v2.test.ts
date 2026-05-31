import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "../src/lib/storage/path-utils";
import { discoverCabinetPathsSync } from "../src/lib/cabinets/discovery";
import { buildCabinetScopedId } from "../src/lib/cabinets/paths";
import { resolveCabinetDir } from "../src/lib/cabinets/server-paths";
import { readCabinetOverview } from "../src/lib/cabinets/overview";
import { createTask, getTasksForAgent } from "../src/lib/agents/task-inbox";
import {
  deleteAgentJob,
  loadAgentJobsBySlug,
  saveAgentJob,
} from "../src/lib/jobs/job-manager";
import type { JobConfig } from "../src/types/jobs";

test("cabinet discovery includes the root cabinet and nested example cabinets", () => {
  const cabinetPaths = discoverCabinetPathsSync();

  assert.ok(cabinetPaths.includes("."), "expected the real root cabinet path '.'");
  assert.ok(
    cabinetPaths.includes("example-text-your-mom"),
    "expected the example company cabinet"
  );
  assert.ok(
    cabinetPaths.includes("example-text-your-mom/marketing/tiktok"),
    "expected the nested TikTok cabinet"
  );
  assert.ok(
    cabinetPaths.includes("example-text-your-mom/marketing/reddit"),
    "expected the nested Reddit cabinet"
  );
  assert.ok(
    cabinetPaths.includes("example-text-your-mom/app-development"),
    "expected the nested app development cabinet"
  );
});

test("cabinet overview keeps own scope separate from descendant scope", async () => {
  const ownOverview = await readCabinetOverview("example-text-your-mom", {
    visibilityMode: "own",
  });
  const expandedOverview = await readCabinetOverview("example-text-your-mom", {
    visibilityMode: "children-2",
  });

  assert.equal(ownOverview.parent?.path, ".");
  const ownChildPaths = ownOverview.children.map((child) => child.path).sort();
  for (const requiredChild of [
    "example-text-your-mom/app-development",
    "example-text-your-mom/marketing/reddit",
    "example-text-your-mom/marketing/tiktok",
  ]) {
    assert.ok(
      ownChildPaths.includes(requiredChild),
      `expected child cabinet ${requiredChild} to be present`
    );
  }

  const ownAgentSlugs = ownOverview.agents.map((agent) => agent.slug);
  assert.deepEqual(ownAgentSlugs.sort(), ["ceo", "cfo", "coo", "cto"].sort());
  assert.ok(
    !ownAgentSlugs.includes("trend-scout"),
    "own visibility should not include descendant cabinet agents"
  );

  const expandedScopedIds = expandedOverview.agents.map((agent) => agent.scopedId);
  assert.ok(
    expandedScopedIds.includes(
      buildCabinetScopedId("example-text-your-mom", "agent", "cto")
    ),
    "expected the root cabinet CTO scoped id"
  );
  assert.ok(
    expandedScopedIds.includes(
      buildCabinetScopedId(
        "example-text-your-mom/app-development",
        "agent",
        "cto"
      )
    ),
    "expected the child cabinet CTO scoped id"
  );
  assert.ok(
    expandedOverview.agents.some(
      (agent) =>
        agent.slug === "trend-scout" &&
        agent.cabinetPath === "example-text-your-mom/marketing/tiktok"
    ),
    "expected descendant cabinet agents to appear when visibility expands"
  );
  assert.ok(
    expandedOverview.jobs.some(
      (job) =>
        job.id === "daily-trend-scan" &&
        job.cabinetPath === "example-text-your-mom/marketing/tiktok"
    ),
    "expected descendant cabinet jobs to appear when visibility expands"
  );
});

test("job manager reads and writes only cabinet-level .jobs files", async () => {
  const cabinetPath = `__cabinet-v2-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cabinetDir = resolveCabinetDir(cabinetPath);
  const jobId = "daily-digest";
  const jobFile = path.join(cabinetDir, ".jobs", `${jobId}.yaml`);
  const legacyAgentJobsDir = path.join(cabinetDir, ".agents", "analyst", "jobs");

  try {
    await fs.mkdir(path.join(cabinetDir, ".agents", "analyst"), { recursive: true });
    await fs.writeFile(
      path.join(cabinetDir, ".cabinet"),
      [
        "schemaVersion: 1",
        "id: cabinet-v2-test",
        "name: Cabinet V2 Test",
        "kind: child",
        "entry: index.md",
        "",
      ].join("\n"),
      "utf8"
    );
    await fs.writeFile(
      path.join(cabinetDir, ".agents", "analyst", "persona.md"),
      [
        "---",
        "name: Analyst",
        "role: Keeps the test cabinet honest",
        "active: true",
        "heartbeat: 0 9 * * 1-5",
        "---",
        "",
        "You are the test analyst.",
        "",
      ].join("\n"),
      "utf8"
    );

    const now = new Date().toISOString();
    const savedJob = await saveAgentJob(
      "analyst",
      {
        id: jobId,
        name: "Daily Digest",
        enabled: true,
        schedule: "0 9 * * 1-5",
        provider: "claude-code",
        ownerAgent: "analyst",
        prompt: "Write the daily digest.",
        createdAt: now,
        updatedAt: now,
        cabinetPath,
      } satisfies JobConfig,
      cabinetPath
    );

    assert.equal(savedJob.id, jobId);
    await fs.access(jobFile);
    await assert.rejects(fs.access(legacyAgentJobsDir));

    const jobs = await loadAgentJobsBySlug("analyst", cabinetPath);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.ownerAgent, "analyst");
    assert.equal(jobs[0]?.cabinetPath, cabinetPath);

    await deleteAgentJob("analyst", jobId, cabinetPath);
    await assert.rejects(fs.access(jobFile));
  } finally {
    await fs.rm(path.join(DATA_DIR, cabinetPath), { recursive: true, force: true });
  }
});

test("task inbox stores handoffs inside the owning cabinet", async () => {
  const cabinetPath = `__cabinet-v2-task-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cabinetDir = resolveCabinetDir(cabinetPath);
  const taskDir = path.join(cabinetDir, ".agents", "analyst", "tasks");
  const rootTaskDir = path.join(DATA_DIR, ".agents", "analyst", "tasks");

  try {
    await fs.mkdir(path.join(cabinetDir, ".agents", "analyst"), { recursive: true });
    await fs.writeFile(
      path.join(cabinetDir, ".cabinet"),
      [
        "schemaVersion: 1",
        "id: cabinet-v2-task-test",
        "name: Cabinet V2 Task Test",
        "kind: child",
        "entry: index.md",
        "",
      ].join("\n"),
      "utf8"
    );

    const task = await createTask({
      fromAgent: "ceo",
      toAgent: "analyst",
      title: "Review launch copy",
      description: "Check the launch message for clarity.",
      kbRefs: [],
      priority: 2,
      cabinetPath,
    });

    assert.equal(task.cabinetPath, cabinetPath);
    await fs.access(path.join(taskDir, `${task.id}.json`));
    await assert.rejects(fs.access(path.join(rootTaskDir, `${task.id}.json`)));

    const tasks = await getTasksForAgent("analyst", "pending", cabinetPath);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.title, "Review launch copy");
    assert.equal(tasks[0]?.cabinetPath, cabinetPath);
  } finally {
    await fs.rm(path.join(DATA_DIR, cabinetPath), { recursive: true, force: true });
  }
});
