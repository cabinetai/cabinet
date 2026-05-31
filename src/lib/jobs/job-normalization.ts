import type { JobConfig } from "@/types/jobs";
import { defaultAdapterTypeForProvider } from "@/lib/agents/adapters";

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeExistingJobId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeJobId(
  value: unknown,
  fallbackName?: unknown,
  fallbackId?: string
): string {
  const direct = normalizeExistingJobId(value);
  if (direct) return direct;

  const fromName = normalizeExistingJobId(fallbackName);
  if (fromName) return fromName;

  return fallbackId || `job-${Date.now()}`;
}

export function jobIdMatches(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeExistingJobId(left);
  const normalizedRight = normalizeExistingJobId(right);
  return !!normalizedLeft && normalizedLeft === normalizedRight;
}

export function normalizeJobConfig(
  input: Partial<JobConfig>,
  agentSlug?: string,
  fallbackId?: string
): JobConfig {
  const now = new Date().toISOString();
  const name =
    typeof input.name === "string" && input.name.trim()
      ? normalizeWhitespace(input.name)
      : "Untitled Job";

  return {
    id: normalizeJobId(input.id, name, fallbackId),
    name,
    enabled: input.enabled ?? true,
    schedule:
      typeof input.schedule === "string" && input.schedule.trim()
        ? input.schedule.trim()
        : "0 9 * * *",
    provider:
      typeof input.provider === "string" && input.provider.trim()
        ? input.provider.trim()
        : "claude-code",
    adapterType:
      typeof input.adapterType === "string" && input.adapterType.trim()
        ? input.adapterType.trim()
        : defaultAdapterTypeForProvider(
            typeof input.provider === "string" ? input.provider.trim() : "claude-code"
          ),
    adapterConfig:
      isRecord(input.adapterConfig) && Object.keys(input.adapterConfig).length > 0
        ? input.adapterConfig
        : undefined,
    ownerAgent:
      typeof agentSlug === "string" && agentSlug.trim()
        ? agentSlug.trim()
        : typeof input.ownerAgent === "string" && input.ownerAgent.trim()
          ? input.ownerAgent.trim()
          : typeof input.agentSlug === "string" && input.agentSlug.trim()
            ? input.agentSlug.trim()
            : undefined,
    agentSlug:
      typeof agentSlug === "string" && agentSlug.trim()
        ? agentSlug.trim()
        : typeof input.agentSlug === "string" && input.agentSlug.trim()
          ? input.agentSlug.trim()
          : undefined,
    workdir:
      typeof input.workdir === "string" && input.workdir.trim()
        ? input.workdir.trim()
        : undefined,
    timeout:
      typeof input.timeout === "number" &&
      Number.isFinite(input.timeout) &&
      input.timeout > 0
        ? Math.round(input.timeout)
        : 600,
    prompt:
      typeof input.prompt === "string"
        ? input.prompt.replace(/\r\n/g, "\n").trimEnd()
        : "",
    on_complete: Array.isArray(input.on_complete) ? input.on_complete : undefined,
    on_failure: Array.isArray(input.on_failure) ? input.on_failure : undefined,
    cabinetPath:
      typeof input.cabinetPath === "string" && input.cabinetPath.trim()
        ? input.cabinetPath.trim()
        : undefined,
    createdAt:
      typeof input.createdAt === "string" && input.createdAt.trim()
        ? input.createdAt
        : now,
    updatedAt:
      typeof input.updatedAt === "string" && input.updatedAt.trim()
        ? input.updatedAt
        : now,
    ...(input.oneShot === true ? { oneShot: true } : {}),
    ...(typeof input.runAfter === "string" && input.runAfter.trim()
      ? { runAfter: input.runAfter.trim() }
      : {}),
    ...(typeof input.ownerTaskId === "string" && input.ownerTaskId.trim()
      ? { ownerTaskId: input.ownerTaskId.trim() }
      : {}),
  };
}
