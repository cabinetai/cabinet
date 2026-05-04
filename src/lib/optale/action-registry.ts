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
import {
  optaleOagActionContractForAction,
  type OptaleOagActionContract,
} from "@/lib/optale/oag-schema";
import { HARD_WARNINGS, type AgentActionType } from "@/types/actions";

export type OptaleActionKind = "command" | "agent_proposal";
export type OptaleActionCategory =
  | "execution"
  | "delegation"
  | "scheduling"
  | "governance"
  | "review";
export type OptaleActionRisk = "write" | "mutation" | "destructive";
export type OptaleActionStatus = "available" | "unavailable" | "enabled";
export type OptaleActionSource = "command-center" | "agent-harness";

export interface OptaleActionInput {
  name: string;
  required: boolean;
  description?: string;
}

export interface OptaleActionDefinition {
  id: string;
  kind: OptaleActionKind;
  action: OptaleCommandCenterAction | AgentActionType;
  label: string;
  description: string;
  category: OptaleActionCategory;
  risk: OptaleActionRisk;
  status: OptaleActionStatus;
  source: OptaleActionSource;
  executionPath: string;
  inputs: OptaleActionInput[];
  facts: Array<{ label: string; value: string | number | boolean }>;
  operationalSpine?: OptaleOperationalSpineBinding;
  oagContract?: OptaleOagActionContract;
}

export interface OptaleActionQueueRecord {
  id: string;
  conversationId: string;
  cabinetPath: string;
  label: string;
  agentSlug: string;
  status: string;
  pendingCount: number;
  hardBlockedCount: number;
  softWarningCount: number;
  updatedAt?: string;
  href: string;
  operationalSpine?: OptaleOperationalSpineBinding;
}

export interface OptaleActionRegistry {
  generatedAt: string;
  cabinetPath: string;
  visibilityMode: CabinetVisibilityMode;
  actions: OptaleActionDefinition[];
  queues: OptaleActionQueueRecord[];
  counts: {
    actions: number;
    commandActions: number;
    agentProposalTypes: number;
    pendingQueues: number;
    pendingActions: number;
    hardBlockedActions: number;
  };
  operationalSpine: OptaleOperationalSpineSummary;
}

type CommandCenterSnapshot = Awaited<
  ReturnType<typeof readOptaleCommandCenterSnapshot>
>;

const COMMAND_ACTION_ORDER: OptaleCommandCenterAction[] = [
  "launch_conversation",
  "create_task",
  "update_task",
  "set_agent_active",
  "run_job",
  "toggle_job",
  "stop_conversation",
  "review_actions",
];

const COMMAND_ACTION_DEFINITIONS: Record<
  OptaleCommandCenterAction,
  Omit<OptaleActionDefinition, "id" | "kind" | "action" | "status" | "facts">
> = {
  launch_conversation: {
    label: "Launch Conversation",
    description: "Start a governed agent run inside a space.",
    category: "execution",
    risk: "write",
    source: "command-center",
    executionPath: "POST /api/optale/command-center",
    inputs: [
      { name: "agentSlug", required: false },
      { name: "userMessage", required: true },
      { name: "cabinetPath", required: false },
    ],
  },
  create_task: {
    label: "Create Task",
    description: "Create an agent inbox task in a target space.",
    category: "delegation",
    risk: "write",
    source: "command-center",
    executionPath: "POST /api/optale/command-center",
    inputs: [
      { name: "toAgent", required: true },
      { name: "title", required: true },
      { name: "description", required: false },
      { name: "cabinetPath", required: false },
    ],
  },
  update_task: {
    label: "Update Task",
    description: "Move an agent task through status and result updates.",
    category: "delegation",
    risk: "mutation",
    source: "command-center",
    executionPath: "POST /api/optale/command-center",
    inputs: [
      { name: "agent", required: true },
      { name: "taskId", required: true },
      { name: "status", required: true },
      { name: "cabinetPath", required: false },
    ],
  },
  set_agent_active: {
    label: "Set Agent Active",
    description: "Enable or pause an agent persona.",
    category: "governance",
    risk: "mutation",
    source: "command-center",
    executionPath: "POST /api/optale/command-center",
    inputs: [
      { name: "agentSlug", required: true },
      { name: "active", required: true },
      { name: "cabinetPath", required: false },
    ],
  },
  run_job: {
    label: "Run Job",
    description: "Run a scheduled agent job immediately.",
    category: "scheduling",
    risk: "write",
    source: "command-center",
    executionPath: "POST /api/optale/command-center",
    inputs: [
      { name: "jobId", required: true },
      { name: "cabinetPath", required: false },
    ],
  },
  toggle_job: {
    label: "Toggle Job",
    description: "Enable or pause an agent job schedule.",
    category: "scheduling",
    risk: "mutation",
    source: "command-center",
    executionPath: "POST /api/optale/command-center",
    inputs: [
      { name: "jobId", required: true },
      { name: "cabinetPath", required: false },
    ],
  },
  stop_conversation: {
    label: "Stop Conversation",
    description: "Stop a running conversation and mark it failed.",
    category: "execution",
    risk: "destructive",
    source: "command-center",
    executionPath: "POST /api/optale/command-center",
    inputs: [
      { name: "conversationId", required: true },
      { name: "cabinetPath", required: false },
    ],
  },
  review_actions: {
    label: "Review Actions",
    description: "Approve or reject pending agent-proposed actions.",
    category: "review",
    risk: "mutation",
    source: "command-center",
    executionPath: "POST /api/optale/command-center",
    inputs: [
      { name: "conversationId", required: true },
      { name: "approve", required: false },
      { name: "reject", required: false },
      { name: "cabinetPath", required: false },
    ],
  },
};

const AGENT_PROPOSAL_DEFINITIONS: Array<
  Omit<OptaleActionDefinition, "id" | "kind" | "status" | "facts">
> = [
  {
    action: "LAUNCH_TASK",
    label: "Launch Task",
    description: "An agent proposes a child task for another agent to run.",
    category: "delegation",
    risk: "write",
    source: "agent-harness",
    executionPath: "cabinet-actions proposal -> human review",
    inputs: [
      { name: "agent", required: true },
      { name: "title", required: true },
      { name: "prompt", required: true },
    ],
  },
  {
    action: "SCHEDULE_JOB",
    label: "Schedule Job",
    description: "An agent proposes a recurring job for a target agent.",
    category: "scheduling",
    risk: "mutation",
    source: "agent-harness",
    executionPath: "cabinet-actions proposal -> human review",
    inputs: [
      { name: "agent", required: true },
      { name: "name", required: true },
      { name: "schedule", required: true },
      { name: "prompt", required: true },
    ],
  },
  {
    action: "SCHEDULE_TASK",
    label: "Schedule Task",
    description: "An agent proposes a one-shot task for a future time.",
    category: "scheduling",
    risk: "mutation",
    source: "agent-harness",
    executionPath: "cabinet-actions proposal -> human review",
    inputs: [
      { name: "agent", required: true },
      { name: "when", required: true },
      { name: "title", required: true },
      { name: "prompt", required: true },
    ],
  },
];

function taskHref(cabinetPath: string, conversationId: string): string {
  const encodedId = encodeURIComponent(conversationId);
  if (cabinetPath === ".") return `#/tasks/${encodedId}`;
  return `#/cabinet/${encodeURIComponent(cabinetPath)}/tasks/${encodedId}`;
}

function hardBlockedCount(
  pendingActions: NonNullable<
    CommandCenterSnapshot["conversations"][number]["pendingActions"]
  >,
): number {
  return pendingActions.filter((item) =>
    item.warnings.some(
      (warning) =>
        warning.severity === "hard" || HARD_WARNINGS.has(warning.code),
    ),
  ).length;
}

function softWarningCount(
  pendingActions: NonNullable<
    CommandCenterSnapshot["conversations"][number]["pendingActions"]
  >,
): number {
  return pendingActions.reduce(
    (total, item) =>
      total +
      item.warnings.filter((warning) => warning.severity === "soft").length,
    0,
  );
}

export function buildOptaleActionRegistry(input: {
  commandCenter: CommandCenterSnapshot;
}): OptaleActionRegistry {
  const { commandCenter } = input;
  const availableCommands = new Set(commandCenter.controls);
  const operatorOnlyCommands = new Set(commandCenter.operatorOnlyControls || []);
  const commandActions: OptaleActionDefinition[] = COMMAND_ACTION_ORDER.map(
    (action) => {
      const definition = COMMAND_ACTION_DEFINITIONS[action];
      const facts: OptaleActionDefinition["facts"] = [
        { label: "Action", value: action },
        { label: "Inputs", value: definition.inputs.length },
        {
          label: "Required",
          value: definition.inputs.filter((input) => input.required).length,
        },
      ];
      if (operatorOnlyCommands.has(action)) {
        facts.push({ label: "Availability", value: "operator-only" });
      }
      return {
        id: `command:${action}`,
        kind: "command",
        action,
        status: availableCommands.has(action) ? "available" : "unavailable",
        facts,
        oagContract: optaleOagActionContractForAction(action),
        ...definition,
      };
    },
  );

  const agentProposalActions: OptaleActionDefinition[] =
    AGENT_PROPOSAL_DEFINITIONS.map((definition) => ({
      id: `agent-proposal:${definition.action}`,
      kind: "agent_proposal",
      status: "enabled",
      facts: [
        { label: "Action", value: definition.action },
        { label: "Inputs", value: definition.inputs.length },
        { label: "Approval", value: "human review" },
      ],
      oagContract: optaleOagActionContractForAction(String(definition.action)),
      ...definition,
    }));

  const queues: OptaleActionQueueRecord[] = commandCenter.conversations
    .filter((conversation) => (conversation.pendingActions?.length || 0) > 0)
    .map((conversation) => {
      const pendingActions = conversation.pendingActions || [];
      const cabinetPath =
        conversation.cabinetPath || commandCenter.cabinet.path;
      return {
        id: `queue:${cabinetPath}:${conversation.id}`,
        conversationId: conversation.id,
        cabinetPath,
        label: conversation.title || conversation.id,
        agentSlug: conversation.agentSlug,
        status: conversation.status,
        pendingCount: pendingActions.length,
        hardBlockedCount: hardBlockedCount(pendingActions),
        softWarningCount: softWarningCount(pendingActions),
        updatedAt: conversation.completedAt || conversation.startedAt,
        href: taskHref(cabinetPath, conversation.id),
      };
    });

  const actions = [...commandActions, ...agentProposalActions].map(
    (action) => ({
      ...action,
      operationalSpine: buildOptaleOperationalSpineBinding({
        subjectType: "action_type",
        subjectId: action.id,
        cabinetPath: commandCenter.cabinet.path,
      }),
    }),
  );
  const queuesWithSpine = queues.map((queue) => ({
    ...queue,
    operationalSpine: buildOptaleOperationalSpineBinding({
      subjectType: "action_queue",
      subjectId: queue.id,
      cabinetPath: queue.cabinetPath,
    }),
  }));
  const pendingActions = queues.reduce(
    (total, queue) => total + queue.pendingCount,
    0,
  );
  const hardBlockedActions = queues.reduce(
    (total, queue) => total + queue.hardBlockedCount,
    0,
  );

  const generatedAt = new Date().toISOString();
  const spineBindings = [
    ...actions.map((action) => action.operationalSpine),
    ...queuesWithSpine.map((queue) => queue.operationalSpine),
  ];

  return {
    generatedAt,
    cabinetPath: commandCenter.cabinet.path,
    visibilityMode: commandCenter.visibilityMode,
    actions,
    queues: queuesWithSpine,
    counts: {
      actions: actions.length,
      commandActions: commandActions.length,
      agentProposalTypes: agentProposalActions.length,
      pendingQueues: queues.length,
      pendingActions,
      hardBlockedActions,
    },
    operationalSpine: buildOptaleOperationalSpineSummary({
      generatedAt,
      cabinetPath: commandCenter.cabinet.path,
      bindings: spineBindings,
    }),
  };
}

export async function readOptaleActionRegistry(
  input: {
    cabinetPath?: string;
    visibilityMode?: CabinetVisibilityMode;
    limit?: number;
  } = {},
): Promise<OptaleActionRegistry> {
  const commandCenter = await readOptaleCommandCenterSnapshot(input);
  return buildOptaleActionRegistry({ commandCenter });
}
