export type AgentActionType =
  | "LAUNCH_TASK"
  | "SCHEDULE_JOB"
  | "SCHEDULE_TASK";

export interface LaunchTaskAction {
  type: "LAUNCH_TASK";
  agent: string;
  title: string;
  prompt: string;
  providerId?: string;
  adapterType?: string;
  model?: string;
  effort?: string;
}

export interface ScheduleJobAction {
  type: "SCHEDULE_JOB";
  agent: string;
  name: string;
  schedule: string;
  prompt: string;
  providerId?: string;
  adapterType?: string;
  model?: string;
  effort?: string;
}

export interface ScheduleTaskAction {
  type: "SCHEDULE_TASK";
  agent: string;
  when: string;
  title: string;
  prompt: string;
  providerId?: string;
  adapterType?: string;
  model?: string;
  effort?: string;
}

export type AgentAction =
  | LaunchTaskAction
  | ScheduleJobAction
  | ScheduleTaskAction;

export type ActionWarningCode =
  | "unknown_agent"
  | "persona_cannot_dispatch"
  | "self_dispatch"
  | "cycle_risk"
  | "depth_warning"
  | "inactive_target"
  | "budget_low"
  | "invalid_schedule"
  | "invalid_when"
  | "provider_unavailable"
  | "cross_provider_push";

export interface ActionWarning {
  code: ActionWarningCode;
  severity: "hard" | "soft";
  message: string;
}

export interface PendingAction {
  id: string;
  action: AgentAction;
  warnings: ActionWarning[];
  createdAt: string;
}

export type DispatchedActionStatus = "dispatched" | "rejected" | "skipped";

export interface DispatchedAction {
  id: string;
  action: AgentAction;
  status: DispatchedActionStatus;
  conversationId?: string;
  jobId?: string;
  reason?: string;
  dispatchedAt: string;
}

export interface ActionDispatchResult {
  dispatched: DispatchedAction[];
  rejected: DispatchedAction[];
}

export const HARD_WARNINGS: ReadonlySet<ActionWarningCode> = new Set([
  "unknown_agent",
  "persona_cannot_dispatch",
  "invalid_schedule",
  "invalid_when",
  "provider_unavailable",
]);

export const MAX_ACTIONS_PER_TURN = 5000;
