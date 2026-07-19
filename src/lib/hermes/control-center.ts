import { HERMES_CAPABILITY_REGISTRY } from "./capability-registry";
import type {
  HermesCapabilityDefinition,
  HermesCapabilityEvidence,
  HermesCapabilityProjection,
  HermesCapabilityStatus,
  HermesControlCenterSnapshot,
  HermesOperationalHealth,
  HermesParityMetrics,
  HermesParityState,
} from "./control-center-types";
import { detectHermesInstallation } from "./installation-detection";
import { HermesManagementClient } from "./management-client";
import { readHermesServerConfig } from "./server-config";

const GOVERNED_MANAGEMENT_IDS = new Set(["approvals", "notifications"]);
const HISTORICALLY_PROVEN_IDS = new Set([
  "approvals", "agents-subagents", "messaging", "artifacts", "notifications", "voice",
  "archived-chats", "session-pinning", "memory-context", "starmap", "providers",
  "provider-accounts", "models", "model-settings", "gateway", "browser-opencli",
]);

const LIVE_SOURCE_BY_ID: Record<string, { source: string; diagnosticArea?: string; empty?: (snapshot: Awaited<ReturnType<HermesManagementClient["snapshot"]>>) => boolean }> = {
  "command-center": { source: "Hermes detailed health", diagnosticArea: "management" },
  profiles: { source: "Hermes /api/profiles", diagnosticArea: "profiles", empty: (value) => value.profiles.length === 0 },
  skills: { source: "Hermes /api/skills", diagnosticArea: "skills", empty: (value) => value.skills.length === 0 },
  cron: { source: "Hermes /api/cron/jobs", diagnosticArea: "cron", empty: (value) => value.jobs.length === 0 },
  "agents-subagents": { source: "Hermes active worker and board APIs", diagnosticArea: "active agents", empty: (value) => value.operator.agents.active.length + value.operator.agents.recent.length === 0 },
  messaging: { source: "Hermes /api/messaging/platforms", diagnosticArea: "messaging", empty: (value) => value.operator.messaging.length === 0 },
  artifacts: { source: "Hermes /api/files", diagnosticArea: "artifacts", empty: (value) => value.operator.artifacts.length === 0 },
  "archived-chats": { source: "Hermes /api/sessions", diagnosticArea: "sessions", empty: (value) => value.operator.sessions.length === 0 },
  "session-pinning": { source: "Hermes /api/sessions", diagnosticArea: "sessions", empty: (value) => value.operator.sessions.length === 0 },
  "memory-context": { source: "Hermes /api/memory", diagnosticArea: "memory" },
  starmap: { source: "Hermes /api/learning/graph", diagnosticArea: "memory graph", empty: (value) => value.operator.memoryGraph.stats.nodes === 0 },
  providers: { source: "Hermes /api/model/options", diagnosticArea: "model options", empty: (value) => value.operator.providers.length === 0 },
  "provider-accounts": { source: "Hermes /api/model/options", diagnosticArea: "model options", empty: (value) => value.operator.providers.length === 0 },
  models: { source: "Hermes /api/model/info", diagnosticArea: "current model" },
  "model-settings": { source: "Hermes /api/model/info", diagnosticArea: "current model" },
  gateway: { source: "Hermes gateway observations" },
  mcp: { source: "Hermes /api/mcp/servers", diagnosticArea: "mcp", empty: (value) => value.mcpServers.length === 0 },
  plugins: { source: "Hermes /api/dashboard/plugins", diagnosticArea: "plugins", empty: (value) => value.plugins.length === 0 },
  "browser-opencli": { source: "OpenCLI doctor" },
  executor: { source: "Hermes /api/tools/toolsets", diagnosticArea: "toolsets", empty: (value) => value.toolsets.length === 0 },
  voice: { source: "Installed Hermes audio interfaces" },
  notifications: { source: "Cabinet-local preferences mapped to Hermes events" },
  "about-updates": { source: "Installed version detection" },
};

export function effectiveParityState(
  definition: HermesCapabilityDefinition,
  credit: HermesCapabilityProjection["credit"]
): HermesParityState {
  if (definition.parityState === "unsupported") return "unsupported";
  if (definition.parityState === "diagnostic_only") return "diagnostic_only";
  if (definition.parityState === "mapped") return "mapped";
  if (definition.parityState === "first_class") {
    return credit.governedManagement && credit.liveProven ? "first_class" : "missing";
  }
  if (credit.liveVisibility) return "visible_read_only";
  return "missing";
}

function metrics(capabilities: HermesCapabilityProjection[]): HermesParityMetrics {
  const dimension = (key: keyof HermesCapabilityProjection["credit"]) => {
    const covered = capabilities.filter((item) => item.credit[key]).length;
    return {
      covered,
      total: capabilities.length,
      percentage: capabilities.length ? Math.round((covered / capabilities.length) * 100) : 0,
    };
  };
  return {
    discoverability: dimension("discoverability"),
    liveVisibility: dimension("liveVisibility"),
    governedManagement: dimension("governedManagement"),
    liveProven: dimension("liveProven"),
  };
}

function statusFor(
  definition: HermesCapabilityDefinition,
  input: {
    online: boolean;
    gateway: string;
    profiles: number;
    skills: number;
    jobs: number;
    memoryHealthy: boolean;
    openCliConnected: boolean;
    mcpServers: number;
    plugins: number;
  }
): { status: HermesCapabilityStatus; statusDetail: string } {
  if (definition.parityState === "unsupported") {
    return { status: "unsupported", statusDetail: definition.installedVersionSupport };
  }
  if (definition.parityState === "missing") {
    return { status: "needs_setup", statusDetail: "Hermes supports this, but Cabinet has no discoverable surface yet." };
  }
  if (!input.online && !["appearance", "files", "terminal", "command-palette", "keyboard-shortcuts", "layout-controls"].includes(definition.id)) {
    return { status: "degraded", statusDetail: "The live Hermes management surface is unavailable." };
  }
  if (definition.id === "gateway") {
    return input.gateway === "running"
      ? { status: "connected", statusDetail: "Local Hermes gateway is running." }
      : { status: "degraded", statusDetail: `Gateway reports ${input.gateway || "unknown"}.` };
  }
  if (definition.id === "profiles") return { status: input.profiles ? "connected" : "needs_setup", statusDetail: `${input.profiles} profiles reported by Hermes.` };
  if (definition.id === "skills") return { status: "available", statusDetail: `${input.skills} profile-scoped skills reported.` };
  if (definition.id === "cron") return { status: "available", statusDetail: input.jobs ? `${input.jobs} canonical Hermes jobs.` : "Connected. No canonical Hermes jobs are configured." };
  if (definition.id === "memory-context" || definition.id === "starmap") return { status: input.memoryHealthy ? "connected" : "degraded", statusDetail: input.memoryHealthy ? "Memory provider and recall are healthy." : "Memory is available but recall health is degraded." };
  if (definition.id === "browser-opencli") return { status: input.openCliConnected ? "connected" : "needs_setup", statusDetail: input.openCliConnected ? "OpenCLI daemon, extension, and browser profile are connected." : "OpenCLI browser bridge needs repair or setup." };
  if (definition.id === "mcp") return { status: "available", statusDetail: input.mcpServers ? `${input.mcpServers} MCP servers reported.` : "Connected. No MCP servers are configured." };
  if (definition.id === "plugins") return { status: "available", statusDetail: input.plugins ? `${input.plugins} dashboard plugins reported.` : "Connected. No dashboard plugins are enabled." };
  if (definition.parityState === "diagnostic_only") return { status: "disabled", statusDetail: "Visible through an explicit diagnostic path; full Cabinet control is not available." };
  return { status: definition.parityState === "first_class" ? "connected" : "available", statusDetail: definition.missingWork };
}

function legacyStatus(health: HermesOperationalHealth, parity: HermesParityState): HermesCapabilityStatus {
  if (parity === "unsupported") return "unsupported";
  if (parity === "diagnostic_only") return "available";
  if (health === "healthy") return "connected";
  if (health === "not_configured") return "needs_setup";
  if (health === "degraded" || health === "conflicting_evidence" || health === "unavailable") return "degraded";
  return "available";
}

function normalizeGatewayState(state: string | null): "running" | "stopped" | "unknown" {
  const normalized = state?.toLowerCase() ?? "unknown";
  if (["running", "online", "connected", "ready"].includes(normalized)) return "running";
  if (["stopped", "offline", "disconnected", "not_running"].includes(normalized)) return "stopped";
  return "unknown";
}

export function gatewayEvidenceState(input: { primary: string | null; management: string | null; managementRunning: boolean }): {
  primary: "running" | "stopped" | "unknown";
  management: "running" | "stopped";
  conflict: boolean;
} {
  const primary = normalizeGatewayState(input.primary);
  const management = input.managementRunning || normalizeGatewayState(input.management) === "running" ? "running" : "stopped";
  return { primary, management, conflict: primary !== "unknown" && primary !== management };
}

export function messagingHealth(platforms: Array<{ configured: boolean; lastError: string | null }>): HermesOperationalHealth {
  if (platforms.some((platform) => platform.configured && Boolean(platform.lastError))) return "degraded";
  if (!platforms.some((platform) => platform.configured)) return "not_configured";
  return "healthy";
}

export function evidenceCredit(evidence: HermesCapabilityEvidence[]) {
  return {
    liveVisibility: evidence.some((item) => item.proofKind === "live" && !item.stale && (item.outcome === "success" || item.outcome === "empty")),
    liveProven: evidence.some((item) => item.outcome === "success" || item.outcome === "empty"),
  };
}

export function operationalHealthForOutcome(id: string, outcome: HermesCapabilityEvidence["outcome"]): HermesOperationalHealth {
  if (outcome === "failure") return "degraded";
  if (outcome === "conflict") return "conflicting_evidence";
  if (outcome === "unavailable") return "unavailable";
  if (outcome === "empty" && ["profiles", "messaging"].includes(id)) return "not_configured";
  return "healthy";
}

export async function getHermesControlCenterSnapshot(): Promise<HermesControlCenterSnapshot> {
  const config = readHermesServerConfig();
  const client = new HermesManagementClient(config);
  const health = await client.health();
  const management = await client.snapshot(health);
  const checkedAt = new Date().toISOString();
  const installation = detectHermesInstallation(health.version);
  const statusInput = {
    online: health.status === "online",
    gateway: health.gatewayState ?? "unknown",
    profiles: management.profiles.length,
    skills: management.skills.length,
    jobs: management.jobs.length,
    memoryHealthy: management.memory.recallHealth === "healthy",
    openCliConnected: management.openCli.available && management.openCli.daemon === "running" && management.openCli.extension === "connected" && management.openCli.profiles.some((profile) => profile.status === "connected"),
    mcpServers: management.mcpServers.length,
    plugins: management.plugins.length,
  };
  const failedAreas = new Set(management.diagnostics.filter((item) => item.status === "degraded").map((item) => item.area));
  const gatewayEvidence = gatewayEvidenceState({ primary: health.gatewayState, management: management.operator.runtime.gatewayState, managementRunning: management.operator.runtime.gatewayRunning });
  const primaryGateway = gatewayEvidence.primary;
  const managementGateway = gatewayEvidence.management;
  const gatewayConflict = gatewayEvidence.conflict;
  const messagingFailures = management.operator.messaging.filter((platform) => platform.configured && Boolean(platform.lastError));

  const capabilities: HermesCapabilityProjection[] = HERMES_CAPABILITY_REGISTRY.map((definition) => {
    const source = LIVE_SOURCE_BY_ID[definition.id];
    const endpointFailed = Boolean(source?.diagnosticArea && failedAreas.has(source.diagnosticArea));
    const outcome: HermesCapabilityEvidence["outcome"] = definition.id === "gateway" && gatewayConflict
      ? "conflict"
      : definition.id === "messaging" && messagingFailures.length
        ? "failure"
        : endpointFailed || health.status !== "online"
          ? "unavailable"
          : source?.empty?.(management)
            ? "empty"
            : "success";
    const liveEvidence: HermesCapabilityEvidence[] = source ? [{
      source: source.source,
      observedAt: definition.id === "gateway" ? health.checkedAt : management.checkedAt,
      stale: false,
      proofKind: "live",
      outcome,
      summary: definition.id === "gateway"
        ? gatewayConflict
          ? `Health bridge observed ${primaryGateway} at ${health.checkedAt}; management status observed ${managementGateway} at ${management.operator.runtime.observedAt}.`
          : `Health bridge and management status agree: ${primaryGateway}.`
        : definition.id === "messaging" && messagingFailures.length
          ? messagingFailures.map((item) => `${item.name}: ${item.lastError}`).join(" · ")
          : outcome === "empty" ? "Fresh projection succeeded and returned no records." : endpointFailed ? "The live projection failed." : "Fresh projection succeeded.",
      installedBackendVersion: installation.backendVersion,
      installedBackendCommit: installation.backendCommit,
    }] : [];
    if (HISTORICALLY_PROVEN_IDS.has(definition.id)) liveEvidence.push({
      source: definition.testEvidence,
      observedAt: installation.upstreamAudit.auditedAt,
      stale: installation.upstreamAudit.stale,
      proofKind: "historical_audit",
      outcome: "success",
      summary: "Historical proof only; it does not assert current runtime health.",
      installedBackendVersion: installation.upstreamAudit.installedBackendVersion,
      installedBackendCommit: null,
    });
    const observedCredit = evidenceCredit(liveEvidence);
    const credit = {
      discoverability: true,
      liveVisibility: observedCredit.liveVisibility,
      governedManagement: GOVERNED_MANAGEMENT_IDS.has(definition.id),
      liveProven: observedCredit.liveProven,
    };
    const projected = { ...definition, parityState: effectiveParityState(definition, credit) };
    let operationalHealth: HermesOperationalHealth = source
      ? operationalHealthForOutcome(definition.id, outcome)
      : definition.installedSupported ? "unknown" : "unavailable";
    if (definition.id === "messaging" && !endpointFailed && health.status === "online") operationalHealth = messagingHealth(management.operator.messaging);
    const fallback = statusFor(projected, statusInput);
    const operationalDetail = liveEvidence[0]?.summary ?? fallback.statusDetail;
    return {
      ...projected,
      installedSupport: { supported: definition.installedSupported, detail: definition.installedVersionSupport },
      surfaceState: projected.parityState,
      operationalHealth,
      operationalDetail,
      evidence: liveEvidence,
      status: legacyStatus(operationalHealth, projected.parityState),
      statusDetail: projected.parityState === "diagnostic_only" ? "Diagnostic only. Full Cabinet management is intentionally unavailable." : operationalDetail,
      credit,
    };
  });
  const summary = capabilities.reduce<Record<HermesCapabilityStatus, number>>(
    (result, item) => {
      result[item.status] += 1;
      return result;
    },
    { available: 0, connected: 0, degraded: 0, disabled: 0, unsupported: 0, needs_setup: 0 }
  );

  const audienceMetrics = (audience: HermesCapabilityDefinition["audience"]) =>
    metrics(capabilities.filter((item) => item.audience === audience));

  return {
    checkedAt,
    installed: {
      desktopVersion: installation.desktopVersion,
      desktopCommit: installation.desktopCommit,
      backendVersion: installation.backendVersion,
      backendCommit: installation.backendCommit,
      cabinetCommit: installation.cabinetCommit,
      adapter: management.compatibility.adapter,
      upstreamAudit: {
        auditedAt: installation.upstreamAudit.auditedAt,
        auditedCommit: installation.upstreamAudit.auditedCommit.slice(0, 12),
        installedBackendVersion: installation.upstreamAudit.installedBackendVersion,
        commitsBehind: installation.upstreamAudit.commitsBehind,
        stale: installation.upstreamAudit.stale,
      },
    },
    health: {
      runtime: health.status,
      gateway: gatewayConflict ? "conflicting evidence" : health.gatewayState ?? "unknown",
      profile: config.profile,
      openCli: statusInput.openCliConnected ? "connected" : management.openCli.available ? "degraded" : "unavailable",
    },
    exceptions: capabilities.flatMap((capability) =>
      capability.surfaceState !== "unsupported" && ["degraded", "conflicting_evidence", "unavailable"].includes(capability.operationalHealth)
        ? [{
            capabilityId: capability.id,
            title: capability.name,
            health: capability.operationalHealth as "degraded" | "conflicting_evidence" | "unavailable",
            summary: capability.operationalDetail,
          }]
        : []
    ),
    summary,
    parity: {
      ...metrics(capabilities),
      byAudience: {
        operator: audienceMetrics("operator"),
        management: audienceMetrics("management"),
        developer: audienceMetrics("developer"),
      },
    },
    capabilities,
    live: {
      profiles: management.profiles.length,
      skills: management.skills.length,
      jobs: management.jobs.length,
      mcpServers: management.mcpServers.length,
      plugins: management.plugins.length,
      openCliProfiles: management.openCli.profiles.filter((profile) => profile.status === "connected").length,
      openCliVersion: management.openCli.version,
      openCliBinaryLocation: management.openCli.binaryLocation,
      openCliCapabilities: management.openCli.capabilities,
      memoryProvider: management.memory.activeProvider,
      memoryNamespace: management.memory.namespace,
      diagnostics: management.diagnostics,
      operator: management.operator,
    },
  };
}
