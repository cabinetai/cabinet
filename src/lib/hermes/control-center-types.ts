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
};

export type HermesControlCenterSnapshot = {
  checkedAt: string;
  installed: {
    desktopVersion: string;
    desktopCommit: string;
    backendVersion: string | null;
    upstreamCommit: string;
    upstreamAheadBy: number;
    cabinetCommit: string;
    adapter: string;
    updateAvailable: boolean;
  };
  health: {
    runtime: string;
    gateway: string;
    profile: string;
    openCli: string;
  };
  summary: Record<HermesCapabilityStatus, number>;
  parity: Record<HermesCapabilityAudience, number>;
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
  };
};
