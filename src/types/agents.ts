// Types for the Cabinet Agents system

export interface GoalMetric {
  metric: string;       // e.g., "reddit_replies"
  target: number;       // e.g., 50
  current: number;      // e.g., 32
  unit: string;         // e.g., "replies/week"
  period?: string;      // "daily" | "weekly" | "monthly" — default "weekly"
  floor?: number;       // Minimum acceptable — below this triggers alert
  stretch?: number;     // Stretch goal
}


export interface SlackMessage {
  id: string;
  channel: string;
  agent: string;        // agent slug or "human"
  emoji?: string;       // agent emoji for display (e.g., "📝")
  displayName?: string; // agent display name (e.g., "Content Agent")
  type: "message" | "task" | "alert" | "report" | "question";
  content: string;
  mentions: string[];
  kbRefs: string[];     // KB paths referenced
  timestamp: string;
  thread?: string;      // parent message ID (for thread replies)
  replyCount?: number;  // number of thread replies (computed on read)
}

export interface AgentTask {
  id: string;
  fromAgent: string;
  fromEmoji?: string;
  fromName?: string;
  toAgent: string;
  channel?: string;
  title: string;
  description: string;
  kbRefs: string[];
  status: "pending" | "in_progress" | "completed" | "failed";
  priority: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: string;
  cabinetPath?: string;
  linkedConversationId?: string;
  linkedConversationCabinetPath?: string;
  startedAt?: string;
}

export interface HumanInboxDraft {
  id: string;
  title: string;
  description: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
  cabinetPath?: string;
  assignedAgentSlug?: string;
  assignedAgentCabinetPath?: string;
}

export type AgentType = "lead" | "specialist" | "support";

/** Lightweight agent summary used in list/card views */
export interface AgentListItem {
  scopedId?: string;
  name: string;
  slug: string;
  emoji: string;
  role: string;
  provider?: string;
  adapterType?: string;
  active: boolean;
  /** Optional — undefined falls back to true for legacy personas. */
  heartbeatEnabled?: boolean;
  type?: AgentType | string;
  department?: string;
  heartbeat?: string;
  workspace?: string;
  setupComplete?: boolean;
  body?: string;
  jobCount?: number;
  runningCount?: number;
  status?: "active" | "running" | "idle";
  cabinetPath?: string;
  cabinetName?: string;
  /**
   * "global" when the persona file lives in `data/.global-agents/<slug>/`
   * — i.e., one shared identity across all cabinets. Surfaces render a
   * "Global" badge so users know edits apply everywhere.
   */
  scope?: "global" | "cabinet";
  // Identity customization (optional; surfaces render from these when set)
  displayName?: string;
  iconKey?: string;
  color?: string;
  avatar?: string;
  avatarExt?: string;
}
export type ProviderModelRequires = "any" | "chatgpt_plan" | "api_key";

export interface ProviderModel {
  id: string;
  name: string;
  description?: string;
  effortLevels?: ProviderEffortLevel[];
  /**
   * Auth/plan gate advertised by the provider. UIs should badge models
   * that `requires === "api_key"` so users don't pick an unsupported
   * model on a ChatGPT-plan Codex account.
   */
  requires?: ProviderModelRequires;
}

export interface ProviderEffortLevel {
  id: string;
  name: string;
  description?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  type: "cli" | "api";
  icon?: string;
  iconAsset?: string;
  enabled?: boolean;
  available: boolean;
  authenticated?: boolean;
  version?: string;
  error?: string;
  installMessage?: string;
  installSteps?: Array<{
    title: string;
    detail: string;
    command?: string;
    link?: { label: string; url: string };
  }>;
  models?: ProviderModel[];
  effortLevels?: ProviderEffortLevel[];
  /**
   * True when the provider implements `listModels()` — its real model set is
   * discovered per-machine (e.g. `opencode models`, entitlement-gated) rather
   * than baked into static metadata. The `models` array on this object is then
   * only an offline fallback until the client hydrates it from
   * `GET /api/agents/providers/:id/models`. Drives the searchable combobox
   * (vs. the fixed matrix) in the runtime picker.
   */
  dynamicModels?: boolean;
  /**
   * Client-only. Set by the app-store once the real model list has been
   * fetched and merged into `models`. Until then an unknown saved model id
   * must be preserved (not snapped to `models[0]`) so async hydration never
   * clobbers a persisted selection. Never sent by the server.
   */
  modelsHydrated?: boolean;
  defaultAdapterType?: string;
  /**
   * True when the CLI supports resuming a prior terminal-mode session via
   * its own flag (Claude `--resume`, Cursor `--resume`, OpenCode `--session`).
   * UI surfaces use this to decide whether to show "New session — prior
   * context not preserved" on Continue for providers without resume.
   */
  supportsTerminalResume?: boolean;
  adapters?: Array<{
    type: string;
    name: string;
    description?: string;
    experimental?: boolean;
    executionEngine?: string;
    supportsDetachedRuns?: boolean;
    supportsSessionResume?: boolean;
  }>;
  usage?: {
    agentSlugs: string[];
    jobs: Array<{
      agentSlug: string;
      jobId: string;
      jobName: string;
    }>;
    agentCount: number;
    jobCount: number;
    totalCount: number;
  };
}

export type AgentRuntime = "heartbeat" | "on-demand";

export interface Department {
  name: string;
  lead?: string;        // slug of lead agent
  agents: string[];     // slugs of all agents in department
}
