import type { HermesInstallationDetection } from "./installation-detection";
import type { HermesManagementSnapshot } from "./types";

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
export type HermesEvidenceOrigin = "raw_observation" | "approved_evidence_catalog" | "derived_reconciliation";
export const HERMES_PROOF_SCOPES = [
  "live_runtime_operation",
  "historical_live_acceptance",
  "source_audit",
  "exact_fixture_path",
  "cabinet_local_surface",
] as const;
export type HermesProofScope = (typeof HERMES_PROOF_SCOPES)[number];
export type HermesEvidenceOutcome =
  | "success"
  | "connected_empty"
  | "not_configured"
  | "unavailable"
  | "failure"
  | "conflict"
  | "unknown";
export type HermesObservationFreshness = "fresh" | "stale" | "unknown";
export type HermesObservationFact = string | number | boolean | null | HermesObservationFact[] | { [key: string]: HermesObservationFact };

export type HermesCapabilityObservation = {
  capabilityId: string;
  source: string;
  interface: string;
  observedAt: string | null;
  assertedFreshness?: HermesObservationFreshness;
  proofKind: HermesProofKind;
  proofScope: HermesProofScope;
  outcome: HermesEvidenceOutcome;
  summary: string;
  installedBackendVersion: string | null;
  installedBackendCommit: string | null;
  facts?: Record<string, HermesObservationFact>;
};

export type HermesCapabilityEvidence = Omit<HermesCapabilityObservation, "capabilityId" | "assertedFreshness"> & {
  origin: HermesEvidenceOrigin;
  stale: boolean;
  assertedFreshness: HermesObservationFreshness;
  effectiveFreshness: HermesObservationFreshness;
};

export type HermesGovernanceProof = {
  confirmationBoundary: string;
  stableRequestIdentity: string;
  idempotencyBehavior: string;
  visibleOutcomeEvidence: string;
  testedContract: string;
  proofTimestamp: string;
  proofSource: string;
};

export type HermesHistoricalProof = {
  capabilityId: string;
  proofKind: "historical_audit";
  proofScope: Extract<HermesProofScope, "historical_live_acceptance" | "source_audit">;
  source: string;
  interface: string;
  observedAt: string;
  outcome: HermesEvidenceOutcome;
  summary: string;
  installedBackendVersion: string | null;
  installedBackendCommit: string | null;
  evidenceReference: string;
};

export type HermesCapabilityEvidenceCatalogEntry = {
  governance?: HermesGovernanceProof[];
  historical?: HermesHistoricalProof[];
};

export type HermesCapabilityEvidenceCatalog = Record<string, HermesCapabilityEvidenceCatalogEntry | undefined>;

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
  pathProof: {
    proven: boolean;
    label: string | null;
  };
};

export type HermesParityMetric = { covered: number; total: number; percentage: number };
export type HermesParityMetrics = {
  discoverability: HermesParityMetric;
  liveVisibility: HermesParityMetric;
  governedManagement: HermesParityMetric;
  liveProven: HermesParityMetric;
};

export type HermesProjectionProvenance =
  | { kind: "live_runtime"; label: "Live runtime projection"; capturedAt: string; fixtureId: null }
  | { kind: "acceptance_fixture"; label: "Acceptance fixture — not live runtime"; capturedAt: string; fixtureId: string };

export type HermesInstalledRuntime = {
  installation: HermesInstallationDetection;
  profile: string;
  adapter: string;
  provenance: HermesProjectionProvenance;
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
    diagnostics: HermesManagementSnapshot["diagnostics"];
    operator: HermesManagementSnapshot["operator"];
  };
};

export type HermesControlCenterProjectionInput = {
  registry: readonly HermesCapabilityDefinition[];
  installedRuntime: HermesInstalledRuntime;
  observations: readonly HermesCapabilityObservation[];
  evidenceCatalog: HermesCapabilityEvidenceCatalog;
  evidenceProvenance: HermesEvidenceProvenance;
  now: string;
};

export type HermesEvidenceProvenance = {
  implementationRevision: string | null;
  fixtureId: string | null;
  fixtureCapturedAt: string | null;
  artifactGeneratedAt: string | null;
};

export const HERMES_RAW_PROJECTION_SCHEMA_VERSION = "hermes-control-center-projection-input.v1" as const;
export const HERMES_SNAPSHOT_SCHEMA_VERSION = "hermes-control-center-snapshot.v1" as const;
export const HERMES_EVIDENCE_CATALOG_ID = "cabinet-hermes-evidence-v1" as const;

export type HermesRawProjectionEnvelope = {
  schemaVersion: typeof HERMES_RAW_PROJECTION_SCHEMA_VERSION;
  capturedAt: string;
  now: string;
  provenance: HermesProjectionProvenance;
  installedRuntime: Omit<HermesInstalledRuntime, "provenance">;
  observations: readonly HermesCapabilityObservation[];
  evidenceCatalogId: typeof HERMES_EVIDENCE_CATALOG_ID;
  evidenceProvenance: HermesEvidenceProvenance;
};

export type HermesControlCenterSnapshot = {
  schemaVersion: typeof HERMES_SNAPSHOT_SCHEMA_VERSION;
  checkedAt: string;
  provenance: HermesProjectionProvenance;
  evidenceProvenance: HermesEvidenceProvenance;
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
  health: { runtime: string; gateway: string; profile: string; openCli: string };
  exceptions: Array<{
    capabilityId: string;
    title: string;
    health: Extract<HermesOperationalHealth, "degraded" | "conflicting_evidence" | "unavailable">;
    summary: string;
  }>;
  summary: Record<HermesCapabilityStatus, number>;
  parity: HermesParityMetrics & { byAudience: Record<HermesCapabilityAudience, HermesParityMetrics> };
  capabilities: HermesCapabilityProjection[];
  live: HermesInstalledRuntime["live"];
  developerRepository: {
    project: { label: string | null; profile: string | null; repositoryAssociated: boolean | null; repository: string | null; observedAt: string | null };
    worktree: { label: string | null; branch: string | null; detached: boolean | null; clean: boolean | null; ambiguousCurrent: boolean; observedAt: string | null };
  };
};
