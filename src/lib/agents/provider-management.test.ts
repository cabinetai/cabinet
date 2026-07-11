import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import {
  ProviderSettingsConflictError,
  getProviderUsage,
  updateProviderSettingsWithMigrations,
} from "./provider-management";
import { writeProviderSettings } from "./provider-settings";
import { DATA_DIR } from "../storage/path-utils";

// Must be DATA_DIR — the same root the code under test reads from. This used to
// hardcode `process.cwd()/data`, which only worked because DATA_DIR happened to
// default to PROJECT_ROOT/data; under an isolated CABINET_DATA_DIR the test
// wrote personas to one directory while getProviderUsage() scanned another.
const AGENTS_DIR = path.join(DATA_DIR, ".agents");

async function writeRawPersona(slug: string, provider: string): Promise<string> {
  const agentDir = path.join(AGENTS_DIR, slug);
  await fs.mkdir(agentDir, { recursive: true });
  const personaPath = path.join(agentDir, "persona.md");
  const content = matter.stringify("Test persona body", {
    name: slug,
    role: "Test role",
    provider,
    heartbeat: "0 8 * * *",
    budget: 100,
    active: true,
    workdir: "/data",
    focus: [],
    tags: [],
    emoji: "🤖",
    department: "general",
    type: "specialist",
    workspace: "workspace",
  });
  await fs.writeFile(personaPath, content, "utf8");
  return agentDir;
}

async function writeRawJob(slug: string, jobId: string, provider: string): Promise<string> {
  const jobsDir = path.join(AGENTS_DIR, slug, "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  const jobPath = path.join(jobsDir, `${jobId}.yaml`);
  await fs.writeFile(jobPath, yaml.dump({
    id: jobId,
    name: "Test Job",
    enabled: true,
    schedule: "0 9 * * *",
    provider,
    agentSlug: slug,
    prompt: "Do the thing",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }), "utf8");
  return jobPath;
}

test("provider settings update reports conflicts for providers still assigned to agents and jobs", async (t) => {
  const slug = `provider-conflict-${Date.now()}`;
  const baselineUsage = await getProviderUsage();
  const baselineClaudeUsage = baselineUsage["claude-code"] || {
    agentSlugs: [],
    jobs: [],
    agentCount: 0,
    jobCount: 0,
    totalCount: 0,
  };
  const agentDir = await writeRawPersona(slug, "claude-code");
  await writeRawJob(slug, "job-conflict", "claude-code");
  const providersPath = path.join(process.cwd(), "data", ".agents", ".config", "providers.json");
  const originalSettings = await fs.readFile(providersPath, "utf8").catch(() => null);

  t.after(async () => {
    await fs.rm(agentDir, { recursive: true, force: true });
    if (originalSettings === null) {
      await fs.rm(providersPath, { force: true });
      return;
    }
    await fs.writeFile(providersPath, originalSettings, "utf8");
  });

  await writeProviderSettings({
    defaultProvider: "claude-code",
    disabledProviderIds: [],
  });

  await assert.rejects(
    updateProviderSettingsWithMigrations({
      defaultProvider: "codex-cli",
      disabledProviderIds: ["claude-code"],
      migrations: [],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderSettingsConflictError);
      assert.equal(error.conflicts.length, 1);
      assert.equal(error.conflicts[0]?.providerId, "claude-code");
      assert.ok(error.conflicts[0]?.agentSlugs.includes(slug));
      assert.equal(
        error.conflicts[0]?.agentSlugs.length,
        baselineClaudeUsage.agentSlugs.length + 1
      );
      assert.equal(
        error.conflicts[0]?.jobs.length,
        baselineClaudeUsage.jobs.length + 1
      );
      return true;
    }
  );
});

test("provider settings update migrates assigned personas and jobs before disabling a provider", async (t) => {
  const slug = `provider-migrate-${Date.now()}`;
  const baselineUsage = await getProviderUsage();
  const baselineCodexTotal = baselineUsage["codex-cli"]?.totalCount || 0;
  const baselineClaudeTotal = baselineUsage["claude-code"]?.totalCount || 0;
  const agentDir = await writeRawPersona(slug, "claude-code");
  const jobPath = await writeRawJob(slug, "job-migrate", "claude-code");
  const personaPath = path.join(agentDir, "persona.md");
  const providersPath = path.join(process.cwd(), "data", ".agents", ".config", "providers.json");
  const originalSettings = await fs.readFile(providersPath, "utf8").catch(() => null);

  t.after(async () => {
    await fs.rm(agentDir, { recursive: true, force: true });
    if (originalSettings === null) {
      await fs.rm(providersPath, { force: true });
      return;
    }
    await fs.writeFile(providersPath, originalSettings, "utf8");
  });

  await writeProviderSettings({
    defaultProvider: "claude-code",
    disabledProviderIds: [],
  });

  const result = await updateProviderSettingsWithMigrations({
    defaultProvider: "codex-cli",
    disabledProviderIds: ["claude-code"],
    migrations: [{ fromProviderId: "claude-code", toProviderId: "codex-cli" }],
  });

  assert.equal(result.settings.defaultProvider, "codex-cli");

  const personaRaw = await fs.readFile(personaPath, "utf8");
  const persona = matter(personaRaw);
  assert.equal(persona.data.provider, "codex-cli");

  const job = yaml.load(await fs.readFile(jobPath, "utf8")) as { provider: string };
  assert.equal(job.provider, "codex-cli");

  const usage = await getProviderUsage();
  assert.equal(usage["claude-code"]?.totalCount || 0, baselineClaudeTotal);
  assert.ok(!(usage["claude-code"]?.agentSlugs || []).includes(slug));
  assert.ok(!(usage["claude-code"]?.jobs || []).some((job) => job.jobId === "job-migrate"));
  assert.equal(usage["codex-cli"]?.totalCount || 0, baselineCodexTotal + 2);
});
