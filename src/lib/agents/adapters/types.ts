export interface AdapterUsageSummary {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export type AdapterBillingType =
  | "api"
  | "subscription"
  | "metered_api"
  | "credits"
  | "unknown";

export interface AdapterInvocationMeta {
  adapterType: string;
  command: string;
  cwd?: string;
  commandArgs?: string[];
  commandNotes?: string[];
  env?: Record<string, string>;
  prompt?: string;
}

export interface AdapterExecutionContext {
  runId: string;
  adapterType: string;
  config: Record<string, unknown>;
  prompt: string;
  cwd: string;
  timeoutMs?: number;
  sessionId?: string | null;
  sessionParams?: Record<string, unknown> | null;
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  onMeta?: (meta: AdapterInvocationMeta) => Promise<void>;
  onSpawn?: (meta: {
    pid: number;
    processGroupId: number | null;
    startedAt: string;
  }) => Promise<void>;
}

export interface AdapterExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage?: string | null;
  errorCode?: string | null;
  usage?: AdapterUsageSummary;
  sessionId?: string | null;
  sessionParams?: Record<string, unknown> | null;
  sessionDisplayId?: string | null;
  provider?: string | null;
  model?: string | null;
  billingType?: AdapterBillingType | null;
  summary?: string | null;
  output?: string | null;
  clearSession?: boolean;
}

export type AdapterEnvironmentCheckLevel = "info" | "warn" | "error";
export type AdapterEnvironmentStatus = "pass" | "warn" | "fail";

export interface AdapterEnvironmentCheck {
  code: string;
  level: AdapterEnvironmentCheckLevel;
  message: string;
  detail?: string | null;
  hint?: string | null;
}

export interface AdapterEnvironmentTestContext {
  adapterType: string;
  adapterConfig?: Record<string, unknown>;
  cwd?: string;
  env?: Record<string, string>;
}

export interface AdapterEnvironmentTestResult {
  adapterType: string;
  status: AdapterEnvironmentStatus;
  checks: AdapterEnvironmentCheck[];
  testedAt: string;
}

export interface AgentAdapterModel {
  id: string;
  name: string;
  description?: string;
}

export interface AgentAdapterEffortLevel {
  id: string;
  name: string;
  description?: string;
}

export type AgentAdapterExecutionEngine =
  | "legacy_pty_cli"
  | "structured_cli"
  | "api"
  | "http"
  | "process";

export interface AdapterSessionCodec {
  deserialize(raw: unknown): Record<string, unknown> | null;
  serialize(params: Record<string, unknown>): Record<string, unknown> | null;
  getDisplayId?(params: Record<string, unknown>): string | null;
}

export interface AdapterSkillEntry {
  key: string;
  runtimeName: string;
  source: string;
}

export interface AdapterSkillSnapshot {
  entries: AdapterSkillEntry[];
  skillsHome?: string;
}

export interface AgentExecutionAdapter {
  type: string;
  name: string;
  description?: string;
  providerId?: string;
  executionEngine: AgentAdapterExecutionEngine;
  experimental?: boolean;
  supportsSessionResume?: boolean;
  supportsDetachedRuns?: boolean;
  models?: AgentAdapterModel[];
  effortLevels?: AgentAdapterEffortLevel[];
  sessionCodec?: AdapterSessionCodec;
  listModels?(): Promise<AgentAdapterModel[]>;
  listSkills?(ctx: { cwd?: string }): Promise<AdapterSkillSnapshot>;
  syncSkills?(
    ctx: { cwd?: string },
    desiredSkills: string[]
  ): Promise<AdapterSkillSnapshot>;
  testEnvironment(
    ctx?: AdapterEnvironmentTestContext
  ): Promise<AdapterEnvironmentTestResult>;
  execute?(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
  /**
   * Map a failed run's stderr + exit code into the canonical
   * `ConversationErrorKind` taxonomy so the UI can offer targeted remediation
   * (install / re-auth / retry / compact) without branching on providerId.
   * Called by the runner on any failed `execute` result.
   */
  classifyError?(
    stderr: string,
    exitCode: number | null
  ): import("../../../types/conversations").ConversationErrorClassification;
}
