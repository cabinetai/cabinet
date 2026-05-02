import {
  buildManualConversationPrompt,
  startConversationRun,
} from "@/lib/agents/conversation-runner";
import {
  appendEventLog,
  finalizeConversation,
  listConversationMetas,
  readConversationMeta,
  writeConversationMeta,
} from "@/lib/agents/conversation-store";
import { publishConversationEvent } from "@/lib/agents/conversation-events";
import { stopDaemonSession } from "@/lib/agents/daemon-client";
import { dispatchApprovedActions } from "@/lib/agents/action-dispatcher";
import { hasHardWarnings } from "@/lib/agents/action-validator";
import {
  normalizeAgentSlug,
  invalidatePersonasCache,
  readMemory,
  readPersona,
  writeMemory,
  writePersona,
} from "@/lib/agents/persona-manager";
import { createTask, getAllTasks, updateTask, type AgentTask } from "@/lib/agents/task-inbox";
import { normalizeRuntimeOverride } from "@/lib/agents/runtime-overrides";
import { reloadDaemonSchedules } from "@/lib/agents/daemon-client";
import {
  invalidateCabinetOverviewCache,
  readCabinetOverview,
} from "@/lib/cabinets/overview";
import { normalizeCabinetPath } from "@/lib/cabinets/paths";
import { getJob, executeJob, toggleJob } from "@/lib/jobs/job-manager";
import { readOptaleMcpAuditSummary } from "@/lib/optale/mcp-audit-log";
import {
  listSanitizedOptaleMcpClients,
  type SanitizedOptaleMcpClient,
} from "@/lib/optale/mcp-client-registry";
import { readOptaleMcpPolicy } from "@/lib/optale/mcp-policy";
import type { AgentAction, DispatchedAction, PendingAction } from "@/types/actions";
import type { CabinetVisibilityMode } from "@/types/cabinets";
import type { ConversationMeta, ConversationStatus } from "@/types/conversations";

export type OptaleCommandCenterAction =
  | "launch_conversation"
  | "create_task"
  | "update_task"
  | "set_agent_active"
  | "run_job"
  | "toggle_job"
  | "stop_conversation"
  | "review_actions";

export class OptaleCommandCenterError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "OptaleCommandCenterError";
    this.status = status;
  }
}

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function numberOrFallback(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function taskStatus(value: unknown): AgentTask["status"] {
  if (
    value === "pending" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value;
  }
  throw new OptaleCommandCenterError("status must be pending, in_progress, completed, or failed");
}

function countBy<T extends string>(
  items: Array<Record<string, unknown>>,
  key: string,
  values: T[]
): Record<T, number> {
  const counts = Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
  for (const item of items) {
    const value = item[key];
    if (typeof value === "string" && value in counts) {
      counts[value as T] += 1;
    }
  }
  return counts;
}

function sortTasks(tasks: AgentTask[]): AgentTask[] {
  return [...tasks].sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function sortConversations(conversations: ConversationMeta[]): ConversationMeta[] {
  return [...conversations].sort(
    (left, right) =>
      new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()
  );
}

function mcpClientCounts(clients: SanitizedOptaleMcpClient[]) {
  return {
    clients: clients.length,
    enabledClients: clients.filter((client) => client.enabled).length,
    disabledClients: clients.filter((client) => !client.enabled).length,
    registryClients: clients.filter((client) => client.source === "registry").length,
    legacyEnvClients: clients.filter((client) => client.source === "legacy-env").length,
    clientsWithBudgets: clients.filter((client) => client.budget?.dailyToolCalls).length,
    auditEnabledClients: clients.filter((client) => client.auditEnabled).length,
    remoteActionClients: clients.filter((client) => client.remoteActionsEnabled).length,
  };
}

export async function readOptaleCommandCenterSnapshot(input: {
  cabinetPath?: string;
  visibilityMode?: CabinetVisibilityMode;
  limit?: number;
} = {}) {
  const cabinetPath = normalizeCabinetPath(input.cabinetPath, true) || ".";
  const visibilityMode = input.visibilityMode || "own";
  const limit = Math.max(1, Math.min(input.limit || 100, 500));
  const overview = await readCabinetOverview(cabinetPath, { visibilityMode });
  const visiblePaths = overview.visibleCabinets.map((cabinet) => cabinet.path);

  const [conversationGroups, taskGroups, mcpPolicy, mcpClients, mcpAudit] = await Promise.all([
    Promise.all(
      visiblePaths.map((path) =>
        listConversationMetas({ cabinetPath: path, limit: Math.max(limit, 200) })
      )
    ),
    Promise.all(visiblePaths.map((path) => getAllTasks(undefined, path))),
    readOptaleMcpPolicy(cabinetPath),
    listSanitizedOptaleMcpClients(),
    readOptaleMcpAuditSummary({ limit: 25 }),
  ]);

  const conversations = sortConversations(conversationGroups.flat()).slice(0, limit);
  const tasks = sortTasks(taskGroups.flat()).slice(0, limit);
  const mcpCounts = mcpClientCounts(mcpClients);
  const pendingActions = conversations.reduce(
    (total, conversation) => total + (conversation.pendingActions?.length || 0),
    0
  );

  return {
    cabinet: overview.cabinet,
    parent: overview.parent,
    children: overview.children,
    visibleCabinets: overview.visibleCabinets,
    visibilityMode,
    mcpPolicy,
    mcp: {
      clients: mcpClients,
      audit: mcpAudit,
      counts: mcpCounts,
    },
    controls: [
      "launch_conversation",
      "create_task",
      "update_task",
      "set_agent_active",
      "run_job",
      "toggle_job",
      "stop_conversation",
      "review_actions",
    ] satisfies OptaleCommandCenterAction[],
    counts: {
      cabinets: visiblePaths.length,
      agents: overview.agents.length,
      activeAgents: overview.agents.filter((agent) => agent.active).length,
      jobs: overview.jobs.length,
      enabledJobs: overview.jobs.filter((job) => job.enabled).length,
      mcpClients: mcpCounts.clients,
      activeMcpClients: mcpCounts.enabledClients,
      mcpToolCallsToday: mcpAudit.toolCalls,
      mcpAuditEventsToday: mcpAudit.totalEvents,
      tasks: taskGroups.flat().length,
      taskStatus: countBy(
        taskGroups.flat() as unknown as Array<Record<string, unknown>>,
        "status",
        ["pending", "in_progress", "completed", "failed"]
      ),
      conversations: conversationGroups.flat().length,
      conversationStatus: countBy(
        conversationGroups.flat() as unknown as Array<Record<string, unknown>>,
        "status",
        ["idle", "running", "completed", "failed", "cancelled"] satisfies ConversationStatus[]
      ),
      pendingActions,
    },
    agents: overview.agents,
    jobs: overview.jobs,
    tasks,
    conversations,
  };
}

async function launchConversation(body: Record<string, unknown>) {
  const agentSlug = normalizeAgentSlug(trimString(body.agentSlug));
  const userMessage = trimString(body.userMessage);
  const cabinetPath = normalizeCabinetPath(trimString(body.cabinetPath), false);
  if (!userMessage) {
    throw new OptaleCommandCenterError("userMessage is required");
  }

  const conversationInput = await buildManualConversationPrompt({
    agentSlug,
    userMessage,
    mentionedPaths: stringArray(body.mentionedPaths),
    mentionedSkills: stringArray(body.mentionedSkills),
    cabinetPath,
  });
  const runtime = normalizeRuntimeOverride(
    {
      providerId: trimString(body.providerId),
      adapterType: trimString(body.adapterType),
      model: trimString(body.model),
      effort: trimString(body.effort),
      runtimeMode:
        body.runtimeMode === "terminal"
          ? "terminal"
          : body.runtimeMode === "native"
            ? "native"
            : undefined,
    },
    {
      providerId: conversationInput.providerId,
      adapterType: conversationInput.adapterType,
      adapterConfig: conversationInput.adapterConfig,
    }
  );
  const conversationCabinetPath = conversationInput.cabinetPath ?? cabinetPath;
  const conversation = await startConversationRun({
    agentSlug,
    title: conversationInput.title,
    trigger: "manual",
    prompt: conversationInput.prompt,
    providerId: runtime.providerId,
    adapterType: runtime.adapterType,
    adapterConfig: runtime.adapterConfig,
    mentionedPaths: stringArray(body.mentionedPaths),
    mentionedSkills: stringArray(body.mentionedSkills),
    cwd: conversationInput.cwd,
    cabinetPath: conversationCabinetPath,
    onComplete: async (completion) => {
      if (!completion.meta.contextSummary) return;
      const existingContext = await readMemory(
        agentSlug,
        "context.md",
        completion.meta.cabinetPath || conversationCabinetPath
      );
      await writeMemory(
        agentSlug,
        "context.md",
        `${existingContext}\n\n## ${new Date().toISOString()}\n${completion.meta.contextSummary}`,
        completion.meta.cabinetPath || conversationCabinetPath
      );
    },
  });

  return { conversation };
}

async function createCommandCenterTask(body: Record<string, unknown>) {
  const toAgent = trimString(body.toAgent);
  const title = trimString(body.title);
  if (!toAgent || !title) {
    throw new OptaleCommandCenterError("toAgent and title are required");
  }

  const task = await createTask({
    fromAgent: trimString(body.fromAgent) || "command-center",
    fromName: trimString(body.fromName) || "Command Center",
    fromEmoji: trimString(body.fromEmoji) || "CC",
    toAgent,
    channel: trimString(body.channel) || "command-center",
    title,
    description: trimString(body.description) || "",
    kbRefs: stringArray(body.kbRefs),
    priority: numberOrFallback(body.priority, 3),
    cabinetPath: normalizeCabinetPath(trimString(body.cabinetPath), true),
  });

  return { task };
}

async function updateCommandCenterTask(body: Record<string, unknown>) {
  const agent = trimString(body.agent) || trimString(body.toAgent);
  const taskId = trimString(body.taskId);
  if (!agent || !taskId) {
    throw new OptaleCommandCenterError("agent and taskId are required");
  }

  const task = await updateTask(
    agent,
    taskId,
    {
      status: taskStatus(body.status),
      result: trimString(body.result),
      linkedConversationId: trimString(body.linkedConversationId),
      linkedConversationCabinetPath: trimString(body.linkedConversationCabinetPath),
      startedAt: trimString(body.startedAt),
    },
    normalizeCabinetPath(trimString(body.cabinetPath), true)
  );
  if (!task) throw new OptaleCommandCenterError("Task not found", 404);
  return { task };
}

async function setAgentActive(body: Record<string, unknown>) {
  const slug = trimString(body.agentSlug) || trimString(body.slug);
  if (!slug || typeof body.active !== "boolean") {
    throw new OptaleCommandCenterError("agentSlug and active are required");
  }
  const cabinetPath = normalizeCabinetPath(trimString(body.cabinetPath), false);
  const persona = await readPersona(slug, cabinetPath);
  if (!persona) throw new OptaleCommandCenterError("Agent not found", 404);

  await writePersona(persona.slug, { active: body.active }, persona.cabinetPath);
  invalidatePersonasCache();
  invalidateCabinetOverviewCache(persona.cabinetPath || ".");
  await reloadDaemonSchedules().catch(() => {});
  const updated = await readPersona(persona.slug, persona.cabinetPath);
  return { agent: updated };
}

async function runJob(body: Record<string, unknown>) {
  const jobId = trimString(body.jobId);
  if (!jobId) throw new OptaleCommandCenterError("jobId is required");
  const cabinetPath = normalizeCabinetPath(trimString(body.cabinetPath), false);
  const job = await getJob(jobId, cabinetPath);
  if (!job) throw new OptaleCommandCenterError("Job not found", 404);
  const run = await executeJob(job, { scheduledAt: new Date().toISOString() });
  return { run };
}

async function toggleCommandCenterJob(body: Record<string, unknown>) {
  const jobId = trimString(body.jobId);
  if (!jobId) throw new OptaleCommandCenterError("jobId is required");
  const cabinetPath = normalizeCabinetPath(trimString(body.cabinetPath), false);
  const job = await toggleJob(jobId, cabinetPath);
  if (!job) throw new OptaleCommandCenterError("Job not found", 404);
  invalidateCabinetOverviewCache(cabinetPath || ".");
  return { job };
}

async function stopConversation(body: Record<string, unknown>) {
  const conversationId = trimString(body.conversationId);
  if (!conversationId) throw new OptaleCommandCenterError("conversationId is required");
  const cabinetPath = normalizeCabinetPath(trimString(body.cabinetPath), false);
  const meta = await readConversationMeta(conversationId, cabinetPath);
  if (!meta) throw new OptaleCommandCenterError("Conversation not found", 404);

  await stopDaemonSession(conversationId);
  await finalizeConversation(conversationId, { status: "failed", exitCode: 1 }, cabinetPath);
  publishConversationEvent({
    type: "task.updated",
    taskId: conversationId,
    cabinetPath: meta.cabinetPath || cabinetPath,
    payload: { action: "stop", source: "command-center" },
  });

  return { conversationId, stopped: true };
}

function mergeActionEdit(item: PendingAction, edit: Partial<AgentAction> | undefined): PendingAction {
  return edit ? { ...item, action: { ...item.action, ...edit } as AgentAction } : item;
}

async function reviewActions(body: Record<string, unknown>) {
  const conversationId = trimString(body.conversationId);
  if (!conversationId) throw new OptaleCommandCenterError("conversationId is required");
  const cabinetPath = normalizeCabinetPath(trimString(body.cabinetPath), false);
  const meta = await readConversationMeta(conversationId, cabinetPath);
  if (!meta) throw new OptaleCommandCenterError("Conversation not found", 404);

  const pending: PendingAction[] = meta.pendingActions || [];
  const approveSet = new Set(stringArray(body.approve));
  const rejectSet = new Set(stringArray(body.reject));
  const edits =
    body.edits && typeof body.edits === "object" && !Array.isArray(body.edits)
      ? (body.edits as Record<string, Partial<AgentAction>>)
      : {};
  const toDispatch: PendingAction[] = [];
  const rejected: DispatchedAction[] = [];
  const remaining: PendingAction[] = [];

  for (const item of pending) {
    if (rejectSet.has(item.id)) {
      rejected.push({
        id: item.id,
        action: item.action,
        status: "rejected",
        dispatchedAt: new Date().toISOString(),
      });
      continue;
    }
    if (approveSet.has(item.id)) {
      if (hasHardWarnings(item.warnings)) {
        rejected.push({
          id: item.id,
          action: item.action,
          status: "rejected",
          reason: item.warnings.find((warning) => warning.severity === "hard")?.code,
          dispatchedAt: new Date().toISOString(),
        });
        continue;
      }
      toDispatch.push(mergeActionEdit(item, edits[item.id]));
      continue;
    }
    remaining.push(item);
  }

  const results = await dispatchApprovedActions(
    meta,
    toDispatch.map((item) => ({ id: item.id, action: item.action }))
  );
  const allDispatched = [...(meta.dispatchedActions || []), ...rejected, ...results];
  await writeConversationMeta({
    ...meta,
    pendingActions: remaining,
    dispatchedActions: allDispatched,
  });

  const seq = await appendEventLog(
    conversationId,
    {
      type: "task.updated",
      pendingActions: remaining.length,
      dispatchedActions: allDispatched.length,
    },
    meta.cabinetPath
  );
  publishConversationEvent({
    type: "task.updated",
    taskId: conversationId,
    cabinetPath: meta.cabinetPath,
    seq: seq ?? undefined,
    payload: {
      pendingActions: remaining.length,
      dispatchedActions: allDispatched.length,
      source: "command-center",
    },
  });

  return { dispatched: results, rejected, pending: remaining };
}

export async function executeOptaleCommandCenterAction(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new OptaleCommandCenterError("JSON body is required");
  }
  const record = body as Record<string, unknown>;
  const action = trimString(record.action) as OptaleCommandCenterAction | undefined;
  if (!action) throw new OptaleCommandCenterError("action is required");

  let result: Record<string, unknown>;
  switch (action) {
    case "launch_conversation":
      result = await launchConversation(record);
      break;
    case "create_task":
      result = await createCommandCenterTask(record);
      break;
    case "update_task":
      result = await updateCommandCenterTask(record);
      break;
    case "set_agent_active":
      result = await setAgentActive(record);
      break;
    case "run_job":
      result = await runJob(record);
      break;
    case "toggle_job":
      result = await toggleCommandCenterJob(record);
      break;
    case "stop_conversation":
      result = await stopConversation(record);
      break;
    case "review_actions":
      result = await reviewActions(record);
      break;
    default:
      throw new OptaleCommandCenterError(`Unknown action: ${action}`);
  }

  return {
    ok: true,
    action,
    ...result,
  };
}

export type OptaleCommandCenterSnapshot = Awaited<
  ReturnType<typeof readOptaleCommandCenterSnapshot>
>;
export type OptaleCommandCenterActionResult = Awaited<
  ReturnType<typeof executeOptaleCommandCenterAction>
>;
