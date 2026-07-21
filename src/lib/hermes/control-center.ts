import { execFileSync } from "node:child_process";
import { HERMES_CAPABILITY_REGISTRY, parityPercentage } from "./capability-registry";
import type {
  HermesCapabilityDefinition,
  HermesCapabilityProjection,
  HermesCapabilityStatus,
  HermesControlCenterSnapshot,
} from "./control-center-types";
import { HermesManagementClient } from "./management-client";
import { readHermesServerConfig } from "./server-config";

const INSTALLED_DESKTOP_VERSION = "0.17.0";
const INSTALLED_DESKTOP_COMMIT = "311a5b0a552be78f5c58807e2be1db02e3badcb0";
const AUDITED_UPSTREAM_COMMIT = "e361c5e20402375c74a65ca52810c6a380461226";
const AUDITED_UPSTREAM_AHEAD = 325;

function cabinetCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 1_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
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
  const capabilities: HermesCapabilityProjection[] = HERMES_CAPABILITY_REGISTRY.map((definition) => ({
    ...definition,
    ...statusFor(definition, statusInput),
  }));
  const summary = capabilities.reduce<Record<HermesCapabilityStatus, number>>(
    (result, item) => {
      result[item.status] += 1;
      return result;
    },
    { available: 0, connected: 0, degraded: 0, disabled: 0, unsupported: 0, needs_setup: 0 }
  );

  return {
    checkedAt: new Date().toISOString(),
    installed: {
      desktopVersion: INSTALLED_DESKTOP_VERSION,
      desktopCommit: INSTALLED_DESKTOP_COMMIT.slice(0, 12),
      backendVersion: health.version,
      upstreamCommit: AUDITED_UPSTREAM_COMMIT.slice(0, 12),
      upstreamAheadBy: AUDITED_UPSTREAM_AHEAD,
      cabinetCommit: cabinetCommit(),
      adapter: management.compatibility.adapter,
      updateAvailable: AUDITED_UPSTREAM_AHEAD > 0,
    },
    health: {
      runtime: health.status,
      gateway: health.gatewayState ?? "unknown",
      profile: config.profile,
      openCli: statusInput.openCliConnected ? "connected" : management.openCli.available ? "degraded" : "unavailable",
    },
    summary,
    parity: {
      operator: parityPercentage("operator"),
      management: parityPercentage("management"),
      developer: parityPercentage("developer"),
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
    },
  };
}
