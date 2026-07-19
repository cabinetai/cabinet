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
  openCli: {
    available: boolean;
    version: string | null;
    daemon: "running" | "stopped" | "unknown";
    extension: "connected" | "disconnected" | "unknown";
    profiles: Array<{ name: string; status: "connected" | "disconnected" | "unknown"; version: string | null }>;
    binaryLocation: string | null;
    capabilities: { screenshot: boolean; domRead: boolean; formInteraction: boolean; download: boolean };
    invocation: "terminal";
    message: string;
  };
  operator: {
    runtime: {
      gatewayMode: string;
      gatewayState: string;
      gatewayRunning: boolean;
      gatewayBusy: boolean;
      lastConnection: string | null;
      activeAgentCount: number;
      activeSessionCount: number;
    };
    agents: {
      available: boolean;
      active: Array<{
        id: string;
        parentSessionId: string | null;
        runId: string | null;
        task: string;
        profile: string | null;
        state: string;
        currentAction: string | null;
        startedAt: string | null;
        result: string | null;
        error: string | null;
        canInterrupt: boolean;
      }>;
      recent: Array<{
        id: string;
        parentSessionId: string | null;
        runId: string | null;
        task: string;
        profile: string | null;
        state: string;
        currentAction: string | null;
        startedAt: string | null;
        result: string | null;
        error: string | null;
        canInterrupt: boolean;
      }>;
    };
    messaging: Array<{
      id: string;
      name: string;
      configured: boolean;
      enabled: boolean;
      connectionState: string;
      accountOrChannel: string | null;
      incomingTriggers: boolean;
      outboundDelivery: "permitted" | "not_configured" | "unknown";
      lastSuccessfulEvent: string | null;
      lastError: string | null;
    }>;
    sessions: Array<{
      id: string;
      title: string;
      profile: string | null;
      source: string;
      status: string;
      createdAt: string | null;
      updatedAt: string | null;
      archived: boolean;
      pinned: boolean | null;
      model: string | null;
      preview: string | null;
    }>;
    artifacts: Array<{
      id: string;
      name: string;
      kind: "file" | "screenshot" | "diff" | "report" | "document" | "log";
      path: string;
      mimeType: string | null;
      size: number;
      createdAt: string | null;
      sessionId: string | null;
      runId: string | null;
      capability: string | null;
      agent: string | null;
    }>;
    memoryGraph: {
      nodes: Array<{ id: string; label: string; source: string | null; age: string | null; profile: string | null; category: string | null }>;
      edges: Array<{ source: string; target: string; relationship: string | null }>;
      stats: { nodes: number; edges: number };
    };
    providers: Array<{
      id: string;
      name: string;
      authenticated: boolean;
      current: boolean;
      models: string[];
      totalModels: number;
      warning: string | null;
    }>;
    model: {
      provider: string | null;
      model: string | null;
      contextLength: number | null;
      supportsTools: boolean | null;
      supportsVision: boolean | null;
      supportsReasoning: boolean | null;
    };
    voice: {
      transcriptionAvailable: boolean;
      speechAvailable: boolean;
      transcriptionInterface: string;
      speechInterface: string;
    };
  };
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
