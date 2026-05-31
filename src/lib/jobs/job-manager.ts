import path from "path";
import yaml from "js-yaml";
import type { JobConfig, JobRun } from "@/types/jobs";
import { discoverCabinetPaths } from "@/lib/cabinets/discovery";
import { normalizeCabinetPath } from "@/lib/cabinets/paths";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import {
  readFileContent,
  writeFileContent,
  fileExists,
  ensureDirectory,
  listDirectory,
} from "@/lib/storage/fs-operations";
import { startJobConversation } from "@/lib/agents/conversation-runner";
import { reloadDaemonSchedules } from "@/lib/agents/daemon-client";
import {
  jobIdMatches,
  normalizeJobConfig,
  normalizeJobId,
} from "@/lib/jobs/job-normalization";
import { resolveEnabledProviderId } from "@/lib/agents/provider-settings";

const runHistory = new Map<string, JobRun>();

function resolveJobsDir(cabinetPath?: string): string {
  return path.join(resolveCabinetDir(cabinetPath), ".jobs");
}

function jobOwner(job: Partial<JobConfig>): string | undefined {
  if (typeof job.ownerAgent === "string" && job.ownerAgent.trim()) {
    return job.ownerAgent.trim();
  }
  if (typeof job.agentSlug === "string" && job.agentSlug.trim()) {
    return job.agentSlug.trim();
  }
  return undefined;
}

async function loadNormalizedJobFile(
  filePath: string,
  ownerAgent?: string,
  cabinetPath?: string
): Promise<JobConfig | null> {
  const raw = await readFileContent(filePath);
  const parsed = yaml.load(raw) as Partial<JobConfig> | null;
  if (!parsed) return null;

  const normalized = normalizeJobConfig(
    {
      ...parsed,
      provider: resolveEnabledProviderId(parsed.provider),
      cabinetPath: normalizeCabinetPath(cabinetPath, true),
    },
    ownerAgent || jobOwner(parsed),
    normalizeJobId(path.basename(filePath, path.extname(filePath)), parsed.name)
  );
  const nextRaw = yaml.dump(normalized, { lineWidth: -1, noRefs: true });
  const nextPath = path.join(path.dirname(filePath), `${normalized.id}.yaml`);

  if (nextPath !== filePath || nextRaw !== raw) {
    await writeFileContent(nextPath, nextRaw);
    if (nextPath !== filePath) {
      const fs = await import("fs/promises");
      await fs.rm(filePath, { force: true });
    }
  }

  return normalized;
}

async function loadJobsForCabinet(cabinetPath?: string): Promise<JobConfig[]> {
  const normalizedCabinetPath = normalizeCabinetPath(cabinetPath, true);
  const jobsDir = resolveJobsDir(normalizedCabinetPath);
  if (!(await fileExists(jobsDir))) return [];

  const entries = await listDirectory(jobsDir);
  const jobs: JobConfig[] = [];

  for (const entry of entries) {
    if (entry.isDirectory || !entry.name.endsWith(".yaml")) continue;
    try {
      const job = await loadNormalizedJobFile(
        path.join(jobsDir, entry.name),
        undefined,
        normalizedCabinetPath
      );
      if (job?.id) jobs.push(job);
    } catch {
      // skip malformed jobs
    }
  }

  return jobs.sort((left, right) => left.name.localeCompare(right.name));
}

export async function loadAllJobs(): Promise<JobConfig[]> {
  const cabinetPaths = await discoverCabinetPaths();
  const allGroups = await Promise.all(
    cabinetPaths.map((cabinetPath) => loadJobsForCabinet(cabinetPath))
  );
  return allGroups.flat();
}

export async function loadAgentJobsBySlug(
  agentSlug: string,
  cabinetPath?: string
): Promise<JobConfig[]> {
  const jobs = await loadJobsForCabinet(cabinetPath);
  return jobs.filter((job) => jobOwner(job) === agentSlug);
}

export async function saveAgentJob(
  agentSlug: string,
  job: JobConfig,
  cabinetPath?: string
): Promise<JobConfig> {
  const normalizedCabinetPath = normalizeCabinetPath(
    cabinetPath || job.cabinetPath,
    true
  );
  const jobsDir = resolveJobsDir(normalizedCabinetPath);
  await ensureDirectory(jobsDir);

  const normalized = normalizeJobConfig(
    {
      ...job,
      ownerAgent: agentSlug,
      agentSlug,
      cabinetPath: normalizedCabinetPath,
      provider: resolveEnabledProviderId(job.provider),
    },
    agentSlug,
    normalizeJobId(job.id, job.name)
  );

  const filePath = path.join(jobsDir, `${normalized.id}.yaml`);
  const raw = yaml.dump(normalized, { lineWidth: -1, noRefs: true });
  await writeFileContent(filePath, raw);

  if (typeof job.id === "string" && job.id !== normalized.id) {
    const fs = await import("fs/promises");
    await fs.rm(path.join(jobsDir, `${job.id}.yaml`), { force: true });
  }

  return normalized;
}

export async function deleteAgentJob(
  agentSlug: string,
  jobId: string,
  cabinetPath?: string
): Promise<void> {
  const jobsDir = resolveJobsDir(cabinetPath);
  if (!(await fileExists(jobsDir))) return;

  const normalizedJobId = normalizeJobId(jobId);
  const entries = await listDirectory(jobsDir);
  const fs = await import("fs/promises");

  await Promise.all(
    entries
      .filter((entry) => entry.name.endsWith(".yaml") && !entry.isDirectory)
      .filter((entry) =>
        jobIdMatches(path.basename(entry.name, ".yaml"), normalizedJobId)
      )
      .map(async (entry) => {
        const fullPath = path.join(jobsDir, entry.name);
        const job = await loadNormalizedJobFile(fullPath, undefined, cabinetPath);
        if (jobOwner(job || {}) !== agentSlug) return;
        await fs.rm(fullPath, { force: true });
      })
  );
}

export async function getJob(
  id: string,
  cabinetPath?: string
): Promise<JobConfig | null> {
  const jobsDir = resolveJobsDir(cabinetPath);
  const normalizedId = normalizeJobId(id);
  const filePath = path.join(jobsDir, `${normalizedId}.yaml`);
  if (await fileExists(filePath)) {
    return loadNormalizedJobFile(filePath, undefined, cabinetPath);
  }

  const entries = await listDirectory(jobsDir).catch(() => []);
  for (const entry of entries) {
    if (!entry.name.endsWith(".yaml") || entry.isDirectory) continue;
    if (!jobIdMatches(path.basename(entry.name, ".yaml"), normalizedId)) continue;
    return loadNormalizedJobFile(path.join(jobsDir, entry.name), undefined, cabinetPath);
  }

  return null;
}

export async function toggleJob(
  id: string,
  cabinetPath?: string
): Promise<JobConfig | null> {
  const job = await getJob(id, cabinetPath);
  if (!job) return null;
  job.enabled = !job.enabled;
  job.updatedAt = new Date().toISOString();
  await saveAgentJob(jobOwner(job) || job.agentSlug || "agent", job, cabinetPath);
  await reloadDaemonSchedules().catch(() => {});
  return job;
}

export function scheduleJob(job: JobConfig): void {
  void job;
  void reloadDaemonSchedules().catch(() => {});
}

export async function executeJob(
  job: JobConfig,
  options: { scheduledAt?: string } = {}
): Promise<JobRun> {
  const run = await startJobConversation(job, options);
  runHistory.set(run.id, run);
  return run;
}

export function getRunHistory(): JobRun[] {
  return Array.from(runHistory.values())
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )
    .slice(0, 50)
    .map((run) => ({ ...run, output: "" }));
}

export async function initScheduler(): Promise<void> {
  await reloadDaemonSchedules().catch(() => {});
}
