import type { CabinetVisibilityMode } from "@/types/cabinets";
import {
  readOptaleCommandCenterSnapshot,
  type OptaleCommandCenterAction,
} from "@/lib/optale/command-center-control";
import {
  buildOptaleOperationalSpineBinding,
  buildOptaleOperationalSpineSummary,
  type OptaleOperationalSpineBinding,
  type OptaleOperationalSpineSummary,
} from "@/lib/optale/operational-spine";
import { HARD_WARNINGS, type AgentActionType } from "@/types/actions";

export type OptaleActionRunKind = "command" | "agent_proposal";
export type OptaleActionRunStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "pending_review"
  | "blocked"
  | "dispatched"
  | "rejected"
  | "skipped";
export type OptaleActionRunSource =
  | "conversation"
  | "pending_action"
  | "dispatched_action";

export interface OptaleActionRunEvidence {
  label: string;
  value: string | number | boolean;
}

export interface OptaleActionRunRecord {
  id: string;
  kind: OptaleActionRunKind;
  action: OptaleCommandCenterAction | AgentActionType;
  actionId: string;
  label: string;
  status: OptaleActionRunStatus;
  source: OptaleActionRunSource;
  cabinetPath: string;
  conversationId?: string;
  agentSlug?: string;
  createdAt: string;
  updatedAt?: string;
  href?: string;
  warningCount: number;
  hardBlocked: boolean;
  evidence: OptaleActionRunEvidence[];
  operationalSpine: OptaleOperationalSpineBinding;
}

export interface OptaleActionRunLedger {
  generatedAt: string;
  cabinetPath: string;
  visibilityMode: CabinetVisibilityMode;
  runs: OptaleActionRunRecord[];
  counts: {
    runs: number;
    commandRuns: number;
    proposalRuns: number;
    pendingReview: number;
    blocked: number;
    dispatched: number;
    rejected: number;
    running: number;
    completed: number;
    failed: number;
  };
  operationalSpine: OptaleOperationalSpineSummary;
}

type CommandCenterSnapshot = Awaited<
  ReturnType<typeof readOptaleCommandCenterSnapshot>
>;

const ACTION_LABELS: Record<OptaleCommandCenterAction | AgentActionType, string> =
  {
    launch_conversation: "Launch Conversation",
    create_task: "Create Task",
    update_task: "Update Task",
    set_agent_active: "Set Agent Active",
    run_job: "Run Job",
    toggle_job: "Toggle Job",
    stop_conversation: "Stop Conversation",
    review_actions: "Review Actions",
    LAUNCH_TASK: "Launch Task",
    SCHEDULE_JOB: "Schedule Job",
    SCHEDULE_TASK: "Schedule Task",
  };

function compactEvidence(
  evidence: Array<OptaleActionRunEvidence | false | null | undefined>,
): OptaleActionRunEvidence[] {
  return evidence.filter((item): item is OptaleActionRunEvidence =>
    Boolean(item),
  );
}

function taskHref(cabinetPath: string, conversationId: string): string {
  const encodedId = encodeURIComponent(conversationId);
  if (cabinetPath === ".") return `#/tasks/${encodedId}`;
  return `#/cabinet/${encodeURIComponent(cabinetPath)}/tasks/${encodedId}`;
}

function conversationStatusToRunStatus(
  status: CommandCenterSnapshot["conversations"][number]["status"],
): OptaleActionRunStatus {
  if (status === "running") return "running";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  return "idle";
}

function actionRunSpine(input: {
  id: string;
  cabinetPath: string;
  policyDecisionStatus?: "reserved" | "active";
}): OptaleOperationalSpineBinding {
  return buildOptaleOperationalSpineBinding({
    subjectType: "action_run",
    subjectId: input.id,
    cabinetPath: input.cabinetPath,
    capabilityStatus: {
      audit_event: "active",
      lineage_edge: "active",
      policy_decision: input.policyDecisionStatus || "reserved",
    },
  });
}

function sortActionRuns(runs: OptaleActionRunRecord[]): OptaleActionRunRecord[] {
  return [...runs].sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt).getTime();
    return rightTime - leftTime;
  });
}

function runCounts(
  runs: OptaleActionRunRecord[],
): OptaleActionRunLedger["counts"] {
  return {
    runs: runs.length,
    commandRuns: runs.filter((run) => run.kind === "command").length,
    proposalRuns: runs.filter((run) => run.kind === "agent_proposal").length,
    pendingReview: runs.filter((run) => run.status === "pending_review")
      .length,
    blocked: runs.filter((run) => run.status === "blocked").length,
    dispatched: runs.filter((run) => run.status === "dispatched").length,
    rejected: runs.filter((run) => run.status === "rejected").length,
    running: runs.filter((run) => run.status === "running").length,
    completed: runs.filter((run) => run.status === "completed").length,
    failed: runs.filter((run) => run.status === "failed").length,
  };
}

export function buildOptaleActionRunLedger(input: {
  commandCenter: CommandCenterSnapshot;
  limit?: number;
}): OptaleActionRunLedger {
  const { commandCenter } = input;
  const runs: OptaleActionRunRecord[] = [];

  for (const conversation of commandCenter.conversations) {
    const cabinetPath = conversation.cabinetPath || commandCenter.cabinet.path;
    const conversationRunId = `command:${cabinetPath}:${conversation.id}:launch_conversation`;
    runs.push({
      id: conversationRunId,
      kind: "command",
      action: "launch_conversation",
      actionId: "command:launch_conversation",
      label: ACTION_LABELS.launch_conversation,
      status: conversationStatusToRunStatus(conversation.status),
      source: "conversation",
      cabinetPath,
      conversationId: conversation.id,
      agentSlug: conversation.agentSlug,
      createdAt: conversation.startedAt,
      updatedAt: conversation.completedAt || conversation.startedAt,
      href: taskHref(cabinetPath, conversation.id),
      warningCount: 0,
      hardBlocked: false,
      evidence: compactEvidence([
        { label: "Conversation", value: conversation.id },
        { label: "Agent", value: conversation.agentSlug },
        { label: "Trigger", value: conversation.trigger },
        conversation.providerId
          ? { label: "Provider", value: conversation.providerId }
          : null,
      ]),
      operationalSpine: actionRunSpine({
        id: conversationRunId,
        cabinetPath,
      }),
    });

    for (const item of conversation.pendingActions || []) {
      const hardBlocked = item.warnings.some(
        (warning) =>
          warning.severity === "hard" || HARD_WARNINGS.has(warning.code),
      );
      const runId = `pending:${cabinetPath}:${conversation.id}:${item.id}`;
      runs.push({
        id: runId,
        kind: "agent_proposal",
        action: item.action.type,
        actionId: `agent-proposal:${item.action.type}`,
        label: ACTION_LABELS[item.action.type],
        status: hardBlocked ? "blocked" : "pending_review",
        source: "pending_action",
        cabinetPath,
        conversationId: conversation.id,
        agentSlug: conversation.agentSlug,
        createdAt: item.createdAt,
        updatedAt: item.createdAt,
        href: taskHref(cabinetPath, conversation.id),
        warningCount: item.warnings.length,
        hardBlocked,
        evidence: compactEvidence([
          { label: "Conversation", value: conversation.id },
          { label: "Agent", value: conversation.agentSlug },
          { label: "Proposal", value: item.id },
          { label: "Warnings", value: item.warnings.length },
          hardBlocked ? { label: "Policy", value: "needs review" } : null,
        ]),
        operationalSpine: actionRunSpine({
          id: runId,
          cabinetPath,
          policyDecisionStatus: hardBlocked ? "active" : "reserved",
        }),
      });
    }

    for (const item of conversation.dispatchedActions || []) {
      const runId = `dispatched:${cabinetPath}:${conversation.id}:${item.id}`;
      runs.push({
        id: runId,
        kind: "agent_proposal",
        action: item.action.type,
        actionId: `agent-proposal:${item.action.type}`,
        label: ACTION_LABELS[item.action.type],
        status: item.status,
        source: "dispatched_action",
        cabinetPath,
        conversationId: conversation.id,
        agentSlug: conversation.agentSlug,
        createdAt: item.dispatchedAt,
        updatedAt: item.dispatchedAt,
        href: taskHref(cabinetPath, conversation.id),
        warningCount: 0,
        hardBlocked: item.status === "rejected",
        evidence: compactEvidence([
          { label: "Conversation", value: conversation.id },
          { label: "Agent", value: conversation.agentSlug },
          { label: "Result", value: item.status },
          item.reason ? { label: "Reason", value: item.reason } : null,
          item.conversationId
            ? { label: "Child Run", value: item.conversationId }
            : null,
          item.jobId ? { label: "Job", value: item.jobId } : null,
        ]),
        operationalSpine: actionRunSpine({
          id: runId,
          cabinetPath,
          policyDecisionStatus: item.status === "rejected" ? "active" : "reserved",
        }),
      });
    }
  }

  const sorted = sortActionRuns(runs);
  const limited = input.limit ? sorted.slice(0, input.limit) : sorted;
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    cabinetPath: commandCenter.cabinet.path,
    visibilityMode: commandCenter.visibilityMode,
    runs: limited,
    counts: runCounts(limited),
    operationalSpine: buildOptaleOperationalSpineSummary({
      generatedAt,
      cabinetPath: commandCenter.cabinet.path,
      bindings: limited.map((run) => run.operationalSpine),
    }),
  };
}

export async function readOptaleActionRunLedger(
  input: {
    cabinetPath?: string;
    visibilityMode?: CabinetVisibilityMode;
    limit?: number;
  } = {},
): Promise<OptaleActionRunLedger> {
  const commandCenter = await readOptaleCommandCenterSnapshot({
    cabinetPath: input.cabinetPath,
    visibilityMode: input.visibilityMode,
    limit: Math.max(input.limit || 100, 100),
  });
  return buildOptaleActionRunLedger({
    commandCenter,
    limit: input.limit,
  });
}
