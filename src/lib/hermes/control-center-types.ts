export const HERMES_PARITY_STATES = [
  "first_class",
  "mapped",
  "visible_read_only",
  "diagnostic_only",
  "unsupported",
  "missing",
] as const;

export type HermesParityState = (typeof HERMES_PARITY_STATES)[number];
export type HermesCapabilityAudience = "operator" | "management" | "developer";
export type HermesCapabilityStatus =
  | "available"
  | "connected"
  | "degraded"
  | "disabled"
  | "unsupported"
  | "needs_setup";

export type HermesCapabilityDefinition = {
  id: string;
  name: string;
  group: string;
  audience: HermesCapabilityAudience;
  desktopSource: string;
  installedVersionSupport: string;
  installedSupported: boolean;
  interface: string;
  cabinetSurface: string;
  cabinetHref: string;
  parityState: HermesParityState;
  readWriteRisk: "read_only" | "low" | "consequential" | "secret";
  mode: "Operator" | "Developer";
  missingWork: string;
  testEvidence: string;
  keywords: string[];
};

export type HermesCapabilityProjection = HermesCapabilityDefinition & {
  status: HermesCapabilityStatus;
  statusDetail: string;
  credit: {
    discoverability: boolean;
    liveVisibility: boolean;
    governedManagement: boolean;
    liveProven: boolean;
  };
};

export type HermesParityMetric = {
  covered: number;
  total: number;
  percentage: number;
};

export type HermesParityMetrics = {
  discoverability: HermesParityMetric;
  liveVisibility: HermesParityMetric;
  governedManagement: HermesParityMetric;
  liveProven: HermesParityMetric;
};

export type HermesControlCenterSnapshot = {
  checkedAt: string;
  installed: {
    desktopVersion: string | null;
    desktopCommit: string | null;
    backendVersion: string | null;
    backendCommit: string | null;
    cabinetCommit: string | null;
    adapter: string;
    upstreamAudit: {
      auditedAt: string;
      auditedCommit: string;
      installedBackendVersion: string;
      commitsBehind: number;
      stale: boolean;
    };
  };
  health: {
    runtime: string;
    gateway: string;
    profile: string;
    openCli: string;
  };
  summary: Record<HermesCapabilityStatus, number>;
  parity: HermesParityMetrics & {
    byAudience: Record<HermesCapabilityAudience, HermesParityMetrics>;
  };
  capabilities: HermesCapabilityProjection[];
  live: {
    profiles: number;
    skills: number;
    jobs: number;
    mcpServers: number;
    plugins: number;
    openCliProfiles: number;
    openCliVersion: string | null;
    openCliBinaryLocation: string | null;
    openCliCapabilities: { screenshot: boolean; domRead: boolean; formInteraction: boolean; download: boolean };
    memoryProvider: string;
    memoryNamespace: string;
    diagnostics: Array<{ area: string; status: "healthy" | "degraded"; message: string }>;
    operator: import("./types").HermesManagementSnapshot["operator"];
  };
};
