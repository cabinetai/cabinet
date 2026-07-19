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

export const HERMES_OPERATIONAL_HEALTH_STATES = [
  "healthy",
  "degraded",
  "conflicting_evidence",
  "not_configured",
  "unavailable",
  "unknown",
] as const;

export type HermesOperationalHealth = (typeof HERMES_OPERATIONAL_HEALTH_STATES)[number];
export type HermesProofKind = "live" | "exact_fixture" | "historical_audit";
export type HermesEvidenceOutcome = "success" | "empty" | "unavailable" | "conflict" | "failure";

export type HermesCapabilityEvidence = {
  source: string;
  observedAt: string | null;
  stale: boolean;
  proofKind: HermesProofKind;
  outcome: HermesEvidenceOutcome;
  summary: string;
  installedBackendVersion: string | null;
  installedBackendCommit: string | null;
};

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
  installedSupport: { supported: boolean; detail: string };
  surfaceState: HermesParityState;
  operationalHealth: HermesOperationalHealth;
  operationalDetail: string;
  evidence: HermesCapabilityEvidence[];
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
  exceptions: Array<{
    capabilityId: string;
    title: string;
    health: Extract<HermesOperationalHealth, "degraded" | "conflicting_evidence" | "unavailable">;
    summary: string;
  }>;
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
