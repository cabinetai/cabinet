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

function uniqueCabinetPath(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function writeCabinetManifest(cabinetPath: string, name: string) {
  const dir = resolveCabinetDir(cabinetPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, ".cabinet"),
    [
      "schemaVersion: 1",
      `id: ${cabinetPath.replace(/[^a-zA-Z0-9-]/g, "-")}`,
      `name: ${name}`,
      "kind: child",
      "entry: index.md",
      "",
    ].join("\n"),
    "utf8"
  );
}

async function writeAgentPersona(cabinetPath: string, slug: string, role: string) {
  const agentDir = path.join(resolveCabinetDir(cabinetPath), ".agents", slug);
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(
    path.join(agentDir, "persona.md"),
    [
      "---",
      `name: ${slug.toUpperCase()}`,
      `role: ${role}`,
      "active: true",
      "---",
      "",
      `You are ${slug}.`,
      "",
    ].join("\n"),
    "utf8"
  );
}

async function writeCabinetJob(
  cabinetPath: string,
  jobId: string,
  ownerAgent: string,
  prompt: string
) {
  const jobsDir = path.join(resolveCabinetDir(cabinetPath), ".jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.writeFile(
    path.join(jobsDir, `${jobId}.yaml`),
    [
      `id: ${jobId}`,
      `name: ${jobId}`,
      `ownerAgent: ${ownerAgent}`,
      "enabled: true",
      "schedule: '0 9 * * *'",
      `prompt: ${JSON.stringify(prompt)}`,
      "",
    ].join("\n"),
    "utf8"
  );
}

test("cabinet discovery includes the root cabinet and nested cabinets", async () => {
  const root = uniqueCabinetPath("__cabinet-v2-discovery");
  const tiktok = `${root}/marketing/tiktok`;
  const reddit = `${root}/marketing/reddit`;
  const appDev = `${root}/app-development`;

  try {
    await writeCabinetManifest(root, "Discovery Root");
    await writeCabinetManifest(tiktok, "TikTok");
    await writeCabinetManifest(reddit, "Reddit");
    await writeCabinetManifest(appDev, "App Development");

    const cabinetPaths = discoverCabinetPathsSync();

    assert.ok(cabinetPaths.includes("."), "expected the real root cabinet path '.'");
    assert.ok(cabinetPaths.includes(root), "expected the temporary root fixture cabinet");
    assert.ok(cabinetPaths.includes(tiktok), "expected the nested TikTok cabinet");
    assert.ok(cabinetPaths.includes(reddit), "expected the nested Reddit cabinet");
    assert.ok(cabinetPaths.includes(appDev), "expected the nested app development cabinet");
  } finally {
    await fs.rm(path.join(DATA_DIR, root), { recursive: true, force: true });
  }
});

test("cabinet overview keeps own scope separate from descendant scope", async () => {
  const root = uniqueCabinetPath("__cabinet-v2-overview");
  const tiktok = `${root}/marketing/tiktok`;
  const reddit = `${root}/marketing/reddit`;
  const appDev = `${root}/app-development`;

  try {
    await writeCabinetManifest(root, "Overview Root");
    await writeCabinetManifest(tiktok, "TikTok");
    await writeCabinetManifest(reddit, "Reddit");
    await writeCabinetManifest(appDev, "App Development");

    for (const slug of ["ceo", "cfo", "coo", "cto"]) {
      await writeAgentPersona(root, slug, `Root ${slug}`);
    }
    await writeAgentPersona(tiktok, "trend-scout", "Scans trends");
    await writeAgentPersona(appDev, "app-cto", "Owns app architecture");
    await writeCabinetJob(tiktok, "daily-trend-scan", "trend-scout", "Scan daily trends.");

    const ownOverview = await readCabinetOverview(root, {
      visibilityMode: "own",
    });
    const expandedOverview = await readCabinetOverview(root, {
      visibilityMode: "children-2",
    });

    const ownChildPaths = ownOverview.children.map((child) => child.path).sort();
    for (const requiredChild of [appDev, reddit, tiktok]) {
      assert.ok(
        ownChildPaths.includes(requiredChild),
        `expected child cabinet ${requiredChild} to be present`
      );
    }

    const ownAgentSlugs = ownOverview.agents.map((agent) => agent.slug);
    for (const requiredSlug of ["ceo", "cfo", "coo", "cto"]) {
      assert.ok(ownAgentSlugs.includes(requiredSlug), `expected own agent ${requiredSlug}`);
    }
    assert.ok(
      !ownAgentSlugs.includes("trend-scout"),
      "own visibility should not include descendant cabinet agents"
    );

    const expandedScopedIds = expandedOverview.agents.map((agent) => agent.scopedId);
    assert.ok(
      expandedScopedIds.includes(buildCabinetScopedId(root, "agent", "cto")),
      "expected the root cabinet CTO scoped id"
    );
    assert.ok(
      expandedScopedIds.includes(buildCabinetScopedId(appDev, "agent", "app-cto")),
      "expected the app-development scoped agent id"
    );
    assert.ok(
      expandedOverview.agents.some(
        (agent) =>
          agent.slug === "trend-scout" &&
          agent.cabinetPath === tiktok
      ),
      "expected descendant cabinet agents to appear when visibility expands"
    );
    assert.ok(
      expandedOverview.agents.some(
        (agent) =>
          agent.slug === "app-cto" &&
          agent.cabinetPath === appDev
      ),
      "expected app-development descendant agents to appear when visibility expands"
    );
    assert.ok(
      expandedOverview.jobs.some(
        (job) =>
          job.id === "daily-trend-scan" &&
          job.cabinetPath === tiktok
      ),
      "expected descendant cabinet jobs to appear when visibility expands"
    );
  } finally {
    await fs.rm(path.join(DATA_DIR, root), { recursive: true, force: true });
  }
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
