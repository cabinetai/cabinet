export const HERMES_CONNECTION_STATES = [
  "online",
  "offline",
  "authentication_failure",
  "unavailable_profile",
  "misconfigured",
] as const;

export type HermesConnectionState =
  (typeof HERMES_CONNECTION_STATES)[number];

export type HermesHealthSnapshot = {
  enabled: boolean;
  status: HermesConnectionState;
  version: string | null;
  profile: string | null;
  gatewayState: string | null;
  checkedAt: string;
  message: string;
};

export type HermesApiHealth = {
  status?: unknown;
  version?: unknown;
  gateway_state?: unknown;
};

export type HermesManagementStatus = {
  profiles?: unknown;
};

export type HermesRunState =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "stopping"
  | "completed"
  | "cancelled"
  | "failed";

export type HermesRunStatus = {
  object: "hermes.run";
  runId: string;
  sessionId: string | null;
  status: HermesRunState;
  createdAt: number | null;
  updatedAt: number | null;
  lastEvent: string | null;
  output: string | null;
  error: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
  pendingDecision: HermesRunDecision | null;
};

export type HermesRunDecision = {
  requestId: string;
  command: string | null;
  description: string | null;
  choices: string[];
};

export type HermesRunEvent = {
  sequence: number;
  event: string;
  runId: string;
  timestamp: number | null;
  payload: Record<string, unknown>;
};

export type HermesRunProjection = {
  runId: string;
  context: string;
  capability: string | null;
  startedAt: string;
  updatedAt: string;
  status: HermesRunStatus["status"];
  pendingDecision: HermesRunDecision | null;
  events: HermesRunEvent[];
  result: string | null;
  error: string | null;
  usage: HermesRunStatus["usage"];
};

export type HermesRunFailureCode =
  | "authentication_failure"
  | "timeout"
  | "unavailable_profile"
  | "run_not_found"
  | "terminal"
  | "retryable"
  | "invalid_response";

export type HermesManagementSnapshot = {
  checkedAt: string;
  profile: string;
  compatibility: { version: string | null; adapter: "desktop-0.18" };
  profiles: Array<{
    name: string;
    isDefault: boolean;
    model: string | null;
    provider: string | null;
    skillCount: number;
    hasEnvironment: boolean;
  }>;
  agentManifest: { profile: string; exists: boolean; content: string };
  skills: Array<{
    name: string;
    description: string;
    category: string;
    enabled: boolean;
    provenance: string;
    usage: number | null;
  }>;
  jobs: Array<{
    id: string;
    name: string;
    enabled: boolean;
    schedule: string;
    nextRunAt: string | null;
    lastRunAt: string | null;
    lastError: string | null;
  }>;
  memory: {
    activeProvider: string;
    namespace: string;
    captureState: "active" | "built_in" | "unconfigured";
    recallHealth: "healthy" | "degraded" | "unconfigured";
    providers: Array<{ name: string; description: string; configured: boolean; available: boolean }>;
    builtInBytes: number;
  };
  mcpServers: Array<{
    name: string;
    transport: string;
    enabled: boolean;
    auth: string | null;
    configured: boolean;
  }>;
  toolsets: Array<{
    name: string;
    label: string;
    enabled: boolean;
    configured: boolean;
    toolCount: number;
  }>;
  plugins: Array<{
    name: string;
    label: string;
    version: string;
    source: string;
    enabled: boolean;
  }>;
  diagnostics: Array<{ area: string; status: "healthy" | "degraded"; message: string }>;
};

export type HermesGatewayEvent = {
  type: string;
  session_id?: string;
  payload?: Record<string, unknown>;
};

export type HermesConversationStatus =
  | "idle"
  | "streaming"
  | "completed"
  | "interrupted"
  | "failed";

/**
 * Cabinet's rebuildable pointer into Hermes-owned conversation state.
 * Hermes remains authoritative for transcript and execution history.
 */
export type HermesConversationReference = {
  profile: string;
  sessionId: string;
  parentSessionId?: string;
  liveSessionId?: string;
  runId?: string;
  parentRunId?: string;
  eventSequence: number;
  status: HermesConversationStatus;
  artifactPaths: string[];
  updatedAt: string;
};
