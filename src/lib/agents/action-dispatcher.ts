import type {
  AgentAction,
  DispatchedAction,
  LaunchTaskAction,
  ScheduleJobAction,
  ScheduleTaskAction,
} from "@/types/actions";
import type { ConversationMeta } from "@/types/conversations";
import type { JobConfig } from "@/types/jobs";
import { readPersona, type AgentPersona } from "./persona-manager";
import { startConversationRun } from "./conversation-runner";
import { saveAgentJob } from "@/lib/jobs/job-manager";
import { reloadDaemonSchedules } from "./daemon-client";
import { readConversationMeta, writeConversationMeta } from "./conversation-store";
import { normalizeRuntimeOverride } from "./runtime-overrides";
import { providerSupportsEffort } from "./provider-registry";

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Resolve the runtime a dispatched sub-task should run with.
 *
 * Precedence (highest → lowest):
 *   1. Action-authored override (agent set providerId/adapterType/model/effort
 *      on a LAUNCH_TASK — used when the user asked for this sub-task to run
 *      on a specific model).
 *   2. Parent conversation's runtime (providerId + adapterType + model +
 *      effort). Pushed down by default so "I picked Opus" propagates to all
 *      children instead of silently falling back to each teammate's persona
 *      default.
 *   3. Target persona defaults — used only when the parent has no runtime
 *      recorded.
 *
 * Model is inherited only when the resolved provider matches the parent's
 * (an Opus model id on Codex would 400). Effort is portable across providers
 * as long as the resolved provider advertises the level.
 */
export function resolveDispatchRuntime(
  parent: ConversationMeta,
  target: AgentPersona,
  action: {
    providerId?: string;
    adapterType?: string;
    model?: string;
    effort?: string;
  }
): {
  providerId: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
} {
  const parentConfig = (parent.adapterConfig ?? {}) as Record<string, unknown>;
  const parentProvider = pickString(parent.providerId);
  const parentAdapter = pickString(parent.adapterType);
  const parentModel = pickString(parentConfig.model);
  const parentEffort = pickString(parentConfig.effort);

  const actionProvider = pickString(action.providerId);
  const actionAdapter = pickString(action.adapterType);
  const actionModel = pickString(action.model);
  const actionEffort = pickString(action.effort);

  // Provider + adapter: action > parent > target persona.
  const resolvedProvider = actionProvider ?? parentProvider ?? target.provider;
  const resolvedAdapter =
    actionAdapter ?? (resolvedProvider === parentProvider ? parentAdapter : undefined);

  // Model: only inherit when the resolved provider matches the source's
  // provider. A Claude model id would 400 against Codex and vice-versa.
  let inheritedModel: string | undefined;
  if (actionModel) {
    inheritedModel = actionModel;
  } else if (!actionProvider && resolvedProvider === parentProvider) {
    // Parent-inheritance path: same provider means the model string is valid.
    inheritedModel = parentModel;
  }

  // Effort: portable if the resolved provider declares the level. Falls back
  // to target persona default when neither action nor parent supplied one.
  let inheritedEffort: string | undefined;
  if (actionEffort) {
    inheritedEffort = actionEffort;
  } else if (parentEffort && providerSupportsEffort(resolvedProvider, parentEffort)) {
    inheritedEffort = parentEffort;
  }

  // Target-persona adapterConfig is the fallback only when nothing else
  // resolved (same provider-switch rule as normalizeRuntimeOverride). Feed
  // the shared normalizer with the already-resolved provider/adapter so it
  // applies the same cross-provider rules the POST-create path uses.
  const normalized = normalizeRuntimeOverride(
    {
      providerId: resolvedProvider,
      adapterType: resolvedAdapter,
      model: inheritedModel,
      effort: inheritedEffort,
    },
    {
      providerId:
        resolvedProvider === target.provider ? target.provider : undefined,
      adapterType:
        resolvedProvider === target.provider ? target.adapterType : undefined,
      adapterConfig:
        resolvedProvider === target.provider ? target.adapterConfig : undefined,
    }
  );

  return {
    providerId: normalized.providerId ?? resolvedProvider,
    adapterType: normalized.adapterType,
    adapterConfig: normalized.adapterConfig,
  };
}

async function tagLineage(spawnedId: string, parent: ConversationMeta): Promise<void> {
  try {
    const fresh = await readConversationMeta(spawnedId, parent.cabinetPath);
    if (!fresh) return;
    fresh.parentTaskId = parent.id;
    fresh.triggeringAgent = parent.agentSlug;
    fresh.spawnDepth = (parent.spawnDepth ?? 0) + 1;
    await writeConversationMeta(fresh);
  } catch {
    // lineage is best-effort; never fail a dispatch over metadata.
  }
}

export interface DispatchInput {
  id: string;
  action: AgentAction;
  warningsOverride?: boolean; // allow dispatch even with soft warnings (default true)
}

function makeDispatched(
  base: Omit<DispatchedAction, "dispatchedAt">
): DispatchedAction {
  return { ...base, dispatchedAt: new Date().toISOString() };
}

export async function dispatchApprovedActions(
  meta: ConversationMeta,
  items: DispatchInput[]
): Promise<DispatchedAction[]> {
  const results: DispatchedAction[] = [];
  let scheduledAny = false;

  for (const item of items) {
    try {
      if (item.action.type === "LAUNCH_TASK") {
        results.push(await dispatchLaunchTask(meta, item));
      } else if (item.action.type === "SCHEDULE_JOB") {
        const out = await dispatchScheduleJob(meta, item);
        results.push(out);
        if (out.status === "dispatched") scheduledAny = true;
      } else if (item.action.type === "SCHEDULE_TASK") {
        const out = await dispatchScheduleTask(meta, item);
        results.push(out);
        if (out.status === "dispatched" && out.jobId) scheduledAny = true;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "dispatch failed";
      results.push(
        makeDispatched({
          id: item.id,
          action: item.action,
          status: "rejected",
          reason,
        })
      );
    }
  }

  if (scheduledAny) {
    await reloadDaemonSchedules().catch(() => {});
  }

  return results;
}

async function dispatchLaunchTask(
  meta: ConversationMeta,
  item: DispatchInput
): Promise<DispatchedAction> {
  const action = item.action as LaunchTaskAction;
  const target = await readPersona(action.agent, meta.cabinetPath);
  if (!target) {
    return makeDispatched({
      id: item.id,
      action,
      status: "rejected",
      reason: "unknown_agent",
    });
  }

  const runtime = resolveDispatchRuntime(meta, target, action);
  const spawned = await startConversationRun({
    agentSlug: target.slug,
    title: action.title.slice(0, 120),
    trigger: "agent",
    prompt: action.prompt,
    providerId: runtime.providerId,
    adapterType: runtime.adapterType,
    adapterConfig: runtime.adapterConfig,
    cabinetPath: target.cabinetPath,
  });

  await tagLineage(spawned.id, meta);

  return makeDispatched({
    id: item.id,
    action,
    status: "dispatched",
    conversationId: spawned.id,
  });
}

async function dispatchScheduleJob(
  meta: ConversationMeta,
  item: DispatchInput
): Promise<DispatchedAction> {
  const action = item.action as ScheduleJobAction;
  const target = await readPersona(action.agent, meta.cabinetPath);
  if (!target) {
    return makeDispatched({
      id: item.id,
      action,
      status: "rejected",
      reason: "unknown_agent",
    });
  }

  const runtime = resolveDispatchRuntime(meta, target, action);
  const job: JobConfig = {
    id: "",
    name: action.name,
    enabled: true,
    schedule: action.schedule,
    provider: runtime.providerId,
    adapterType: runtime.adapterType,
    adapterConfig: runtime.adapterConfig,
    ownerAgent: target.slug,
    agentSlug: target.slug,
    prompt: action.prompt,
    cabinetPath: target.cabinetPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerTaskId: meta.id,
  };

  const saved = await saveAgentJob(target.slug, job, target.cabinetPath);
  return makeDispatched({
    id: item.id,
    action,
    status: "dispatched",
    jobId: saved.id,
  });
}

async function dispatchScheduleTask(
  meta: ConversationMeta,
  item: DispatchInput
): Promise<DispatchedAction> {
  const action = item.action as ScheduleTaskAction;
  const target = await readPersona(action.agent, meta.cabinetPath);
  if (!target) {
    return makeDispatched({
      id: item.id,
      action,
      status: "rejected",
      reason: "unknown_agent",
    });
  }

  const when = new Date(action.when);
  if (Number.isNaN(when.getTime())) {
    return makeDispatched({
      id: item.id,
      action,
      status: "rejected",
      reason: "invalid_when",
    });
  }

  const msFromNow = when.getTime() - Date.now();

  const runtime = resolveDispatchRuntime(meta, target, action);

  // Fire immediately when the scheduled time is past or within 60 s — no point
  // routing through cron for that.
  if (msFromNow <= 60_000) {
    const spawned = await startConversationRun({
      agentSlug: target.slug,
      title: action.title.slice(0, 120),
      trigger: "agent",
      prompt: action.prompt,
      providerId: runtime.providerId,
      adapterType: runtime.adapterType,
      adapterConfig: runtime.adapterConfig,
      cabinetPath: target.cabinetPath,
    });
    await tagLineage(spawned.id, meta);
    return makeDispatched({
      id: item.id,
      action,
      status: "dispatched",
      conversationId: spawned.id,
    });
  }

  const schedule = isoToCronExpression(when);
  const jobName = action.title.slice(0, 80);
  const job: JobConfig = {
    id: "",
    name: jobName,
    enabled: true,
    schedule,
    provider: runtime.providerId,
    adapterType: runtime.adapterType,
    adapterConfig: runtime.adapterConfig,
    ownerAgent: target.slug,
    agentSlug: target.slug,
    prompt: action.prompt,
    cabinetPath: target.cabinetPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    oneShot: true,
    runAfter: when.toISOString(),
    ownerTaskId: meta.id,
  };

  const saved = await saveAgentJob(target.slug, job, target.cabinetPath);
  return makeDispatched({
    id: item.id,
    action,
    status: "dispatched",
    jobId: saved.id,
  });
}

/**
 * Convert a specific point in time into a single-fire cron expression.
 * Format: "minute hour dayOfMonth month *". The daemon's one-shot wrapper
 * disables the job after its first run so year rollover doesn't refire it.
 */
function isoToCronExpression(when: Date): string {
  const minute = when.getMinutes();
  const hour = when.getHours();
  const dom = when.getDate();
  const month = when.getMonth() + 1;
  return `${minute} ${hour} ${dom} ${month} *`;
}
