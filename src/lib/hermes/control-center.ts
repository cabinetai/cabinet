import { HERMES_CAPABILITY_REGISTRY } from "./capability-registry";
import type {
  HermesCapabilityDefinition,
  HermesCapabilityProjection,
  HermesCapabilityStatus,
  HermesControlCenterSnapshot,
  HermesParityMetrics,
  HermesParityState,
} from "./control-center-types";
import { detectHermesInstallation } from "./installation-detection";
import { HermesManagementClient } from "./management-client";
import { readHermesServerConfig } from "./server-config";

const LIVE_VISIBILITY_IDS = new Set([
  "command-center", "profiles", "skills", "cron", "agents-subagents", "messaging",
  "artifacts", "notifications", "voice", "archived-chats", "session-pinning",
  "memory-context", "starmap", "providers", "provider-accounts", "models",
  "model-settings", "gateway", "mcp", "plugins", "browser-opencli", "executor",
  "about-updates",
]);
const GOVERNED_MANAGEMENT_IDS = new Set(["approvals", "notifications"]);
const LIVE_PROVEN_IDS = new Set([
  "approvals", "agents-subagents", "messaging", "artifacts", "notifications", "voice",
  "archived-chats", "session-pinning", "memory-context", "starmap", "providers",
  "provider-accounts", "models", "model-settings", "gateway", "browser-opencli",
]);

export function effectiveParityState(
  definition: HermesCapabilityDefinition,
  credit: HermesCapabilityProjection["credit"]
): HermesParityState {
  if (definition.parityState === "unsupported") return "unsupported";
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

export async function getHermesControlCenterSnapshot(): Promise<HermesControlCenterSnapshot> {
  const config = readHermesServerConfig();
  const client = new HermesManagementClient(config);
  const health = await client.health();
  const management = await client.snapshot(health);
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
  const capabilities: HermesCapabilityProjection[] = HERMES_CAPABILITY_REGISTRY.map((definition) => {
    const credit = {
      discoverability: true,
      liveVisibility: LIVE_VISIBILITY_IDS.has(definition.id),
      governedManagement: GOVERNED_MANAGEMENT_IDS.has(definition.id),
      liveProven: LIVE_PROVEN_IDS.has(definition.id),
    };
    const projected = { ...definition, parityState: effectiveParityState(definition, credit) };
    return { ...projected, ...statusFor(projected, statusInput), credit };
  });
  const summary = capabilities.reduce<Record<HermesCapabilityStatus, number>>(
    (result, item) => {
      result[item.status] += 1;
      return result;
    },
    { available: 0, connected: 0, degraded: 0, disabled: 0, unsupported: 0, needs_setup: 0 }
  );

  const installation = detectHermesInstallation(health.version);
  const audienceMetrics = (audience: HermesCapabilityDefinition["audience"]) =>
    metrics(capabilities.filter((item) => item.audience === audience));

  return {
    checkedAt: new Date().toISOString(),
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
      gateway: health.gatewayState ?? "unknown",
      profile: config.profile,
      openCli: statusInput.openCliConnected ? "connected" : management.openCli.available ? "degraded" : "unavailable",
    },
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
