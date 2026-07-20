import { HERMES_CAPABILITY_EVIDENCE_CATALOG } from "./capability-evidence-catalog";
import { HERMES_CAPABILITY_REGISTRY } from "./capability-registry";
import { buildHermesControlCenterProjection } from "./control-center-projection";
import type {
  HermesCapabilityObservation,
  HermesControlCenterSnapshot,
  HermesEvidenceOutcome,
  HermesInstalledRuntime,
  HermesOperationalHealth,
} from "./control-center-types";
import { detectHermesInstallation } from "./installation-detection";
import { HermesManagementClient } from "./management-client";
import { readHermesServerConfig } from "./server-config";
import type { HermesHealthSnapshot, HermesManagementSnapshot } from "./types";

function gatewayState(value: string | null, explicitRunning: boolean | null = null): "running" | "stopped" | "unknown" {
  if (explicitRunning === true) return "running";
  if (explicitRunning === false) return "stopped";
  const normalized = value?.trim().toLowerCase() ?? "unknown";
  if (["running", "online", "connected", "ready"].includes(normalized)) return "running";
  if (["stopped", "offline", "disconnected", "not_running"].includes(normalized)) return "stopped";
  return "unknown";
}

export function gatewayEvidenceState(input: { primary: string | null; management: string | null; managementRunning: boolean | null }): {
  primary: "running" | "stopped" | "unknown";
  management: "running" | "stopped" | "unknown";
  conflict: boolean;
} {
  const primary = gatewayState(input.primary);
  const management = gatewayState(input.management, input.managementRunning);
  return { primary, management, conflict: primary !== "unknown" && management !== "unknown" && primary !== management };
}

export function messagingHealth(platforms: Array<{ configured: boolean; lastError: string | null }>): HermesOperationalHealth {
  if (platforms.some((platform) => platform.configured && Boolean(platform.lastError))) return "degraded";
  if (!platforms.some((platform) => platform.configured)) return "not_configured";
  return "healthy";
}

function collectHermesObservations(
  health: HermesHealthSnapshot,
  management: HermesManagementSnapshot,
  installed: ReturnType<typeof detectHermesInstallation>
): HermesCapabilityObservation[] {
  const observedAt = management.checkedAt;
  const failed = new Map(management.diagnostics.filter((item) => item.status === "degraded").map((item) => [item.area, item.message]));
  const observations: HermesCapabilityObservation[] = [];
  const add = (
    capabilityId: string,
    source: string,
    interfaceIdentity: string,
    outcome: HermesEvidenceOutcome,
    summary: string,
    options: Partial<Pick<HermesCapabilityObservation, "observedAt" | "assertedFreshness" | "facts">> = {}
  ) => observations.push({
    capabilityId,
    source,
    interface: interfaceIdentity,
    observedAt: options.observedAt ?? observedAt,
    assertedFreshness: options.assertedFreshness ?? "fresh",
    proofKind: "live",
    proofScope: "live_runtime_operation",
    outcome,
    summary,
    installedBackendVersion: installed.backendVersion,
    installedBackendCommit: installed.backendCommit,
    facts: options.facts,
  });
  const endpoint = (input: {
    ids: string[];
    area: string;
    source: string;
    interface: string;
    count?: number;
    emptyOutcome?: Extract<HermesEvidenceOutcome, "connected_empty" | "not_configured">;
    successSummary?: string;
  }) => {
    const failure = failed.get(input.area);
    const outcome: HermesEvidenceOutcome = failure
      ? "failure"
      : input.count === 0
        ? input.emptyOutcome ?? "connected_empty"
        : "success";
    const summary = failure
      ? `${input.source} failed: ${failure}`
      : input.count === 0
        ? `${input.source} responded successfully with no records.`
        : input.successSummary ?? `${input.source} responded successfully${typeof input.count === "number" ? ` with ${input.count} records` : ""}.`;
    for (const id of input.ids) add(id, input.source, input.interface, outcome, summary, { facts: typeof input.count === "number" ? { count: input.count } : undefined });
  };
  const developerOutcome = (state: typeof management.developerRepository.project.state): HermesEvidenceOutcome => state;

  add(
    "command-center",
    "Hermes detailed health bridge",
    "/health/detailed",
    health.status === "online" ? "success" : "unavailable",
    health.status === "online" ? "Hermes detailed health responded." : health.message,
    { observedAt: health.checkedAt, facts: { connectionState: health.status } }
  );
  endpoint({ ids: ["profiles"], area: "profiles", source: "Hermes profiles", interface: "/api/profiles", count: management.profiles.length, emptyOutcome: "not_configured" });
  endpoint({ ids: ["skills"], area: "skills", source: "Hermes skills", interface: "/api/skills", count: management.skills.length });
  endpoint({ ids: ["cron"], area: "cron", source: "Hermes cron jobs", interface: "/api/cron/jobs", count: management.jobs.length });
  endpoint({ ids: ["agents-subagents"], area: "active agents", source: "Hermes active agents", interface: "/api/plugins/kanban/workers/active", count: management.operator.agents.active.length + management.operator.agents.recent.length });
  endpoint({ ids: ["artifacts", "files"], area: "artifacts", source: "Hermes files", interface: "/api/files", count: management.operator.artifacts.length });
  endpoint({ ids: ["chat", "archived-chats", "session-pinning"], area: "sessions", source: "Hermes sessions", interface: "/api/sessions", count: management.operator.sessions.length });
  endpoint({ ids: ["memory-context"], area: "memory", source: "Hermes memory", interface: "/api/memory", count: management.memory.providers.length, successSummary: `Hermes memory reported provider ${management.memory.activeProvider}.` });
  endpoint({ ids: ["starmap"], area: "memory graph", source: "Hermes memory graph", interface: "/api/learning/graph", count: management.operator.memoryGraph.stats.nodes });
  endpoint({ ids: ["providers", "provider-accounts"], area: "model options", source: "Hermes model options", interface: "/api/model/options", count: management.operator.providers.length, emptyOutcome: "not_configured" });
  endpoint({ ids: ["models", "model-settings"], area: "current model", source: "Hermes current model", interface: "/api/model/info", count: management.operator.model.model ? 1 : 0, emptyOutcome: "not_configured" });
  endpoint({ ids: ["mcp"], area: "mcp", source: "Hermes MCP servers", interface: "/api/mcp/servers", count: management.mcpServers.length });
  endpoint({ ids: ["plugins"], area: "plugins", source: "Hermes dashboard plugins", interface: "/api/dashboard/plugins", count: management.plugins.length });
  endpoint({ ids: ["executor", "api-keys-tools"], area: "toolsets", source: "Hermes toolsets", interface: "/api/tools/toolsets", count: management.toolsets.length });

  const project = management.developerRepository.project;
  add("projects", "Hermes session project association", "/api/sessions?limit=100", developerOutcome(project.state), project.summary, {
    observedAt: project.observedAt,
    facts: {
      project: project.project,
      profile: project.profile,
      sessionAssociation: project.sessionAssociation,
      workingDirectoryReported: project.workingDirectoryReported,
      repositoryAssociated: project.repositoryAssociated,
      repository: project.repository,
    },
  });
  const worktrees = management.developerRepository.worktrees;
  add("worktrees", "Hermes Git worktrees", "/api/git/worktrees", developerOutcome(worktrees.state), worktrees.summary, {
    observedAt: worktrees.observedAt,
    facts: { total: worktrees.total, current: worktrees.current, ambiguousCurrent: worktrees.ambiguousCurrent, items: worktrees.items },
  });
  const review = management.developerRepository.review;
  add("source-review", "Hermes Git status and review", "/api/git/status + /api/git/review/list", developerOutcome(review.state), review.summary, {
    observedAt: review.observedAt,
    facts: {
      repository: review.repository,
      branch: review.branch,
      detached: review.detached,
      clean: review.clean,
      staged: review.staged,
      unstaged: review.unstaged,
      untracked: review.untracked,
      conflicts: review.conflicts,
      ahead: review.ahead,
      behind: review.behind,
      reviewAvailable: review.reviewAvailable,
      reviewCount: review.reviewCount,
    },
  });

  const messagingFailure = failed.get("messaging");
  const configuredPlatforms = management.operator.messaging.filter((item) => item.configured);
  const platformFailures = configuredPlatforms.filter((item) => Boolean(item.lastError));
  add(
    "messaging",
    "Hermes messaging platforms",
    "/api/messaging/platforms",
    messagingFailure || platformFailures.length ? "failure" : configuredPlatforms.length ? "success" : "not_configured",
    messagingFailure
      ? `Hermes messaging platforms failed: ${messagingFailure}`
      : platformFailures.length
        ? platformFailures.map((item) => `${item.name}: ${item.lastError}`).join(" ")
        : configuredPlatforms.length
          ? `${configuredPlatforms.length} configured messaging platform${configuredPlatforms.length === 1 ? "" : "s"} reported no failure.`
          : "Hermes messaging responded, but no platform is configured.",
    { facts: { configuredPlatforms: configuredPlatforms.length, failedPlatforms: platformFailures.length } }
  );

  const primaryState = gatewayState(health.gatewayState);
  add(
    "gateway",
    "Hermes health bridge",
    "/health/detailed gateway_state",
    primaryState === "unknown" ? "unknown" : "success",
    `Health bridge gateway state is ${primaryState}.`,
    { observedAt: health.checkedAt, facts: { state: primaryState } }
  );
  const managementFailure = failed.get("runtime status");
  const managementState = gatewayState(management.operator.runtime.gatewayState, management.operator.runtime.gatewayRunning);
  add(
    "gateway",
    "Hermes management status",
    "/api/status gateway state",
    managementFailure ? "unavailable" : managementState === "unknown" ? "unknown" : "success",
    managementFailure ? `Management gateway observation failed: ${managementFailure}` : `Management gateway state is ${managementState}.`,
    { observedAt: management.operator.runtime.observedAt, facts: { state: managementFailure ? "unavailable" : managementState } }
  );

  const openCli = management.openCli;
  const openCliConnected = openCli.available && openCli.daemon === "running" && openCli.extension === "connected" && openCli.profiles.some((profile) => profile.status === "connected");
  add(
    "browser-opencli",
    "OpenCLI doctor",
    "opencli doctor",
    openCliConnected ? "success" : openCli.available ? "failure" : "unavailable",
    openCli.message,
    { facts: { daemon: openCli.daemon, extension: openCli.extension, connectedProfiles: openCli.profiles.filter((profile) => profile.status === "connected").length } }
  );

  add(
    "voice",
    "Hermes audio interface detection",
    "/api/audio/transcribe and /api/audio/speak",
    "unknown",
    "Hermes audio interfaces were not probed. Browser microphone permission was not requested.",
    { facts: { serverInterface: "unprobed", browserPermission: "not_requested" } }
  );
  const versionKnown = Boolean(installed.desktopVersion || installed.backendVersion || installed.backendCommit);
  add(
    "about-updates",
    "Installed Hermes metadata",
    "application metadata and source audit",
    versionKnown ? "success" : "unknown",
    versionKnown ? "Installed Hermes metadata was detected independently of runtime health." : "Installed Hermes version metadata is unknown.",
    { observedAt: health.checkedAt, facts: { updateAuditStale: installed.upstreamAudit.stale } }
  );
  return observations;
}

export async function getHermesControlCenterSnapshot(): Promise<HermesControlCenterSnapshot> {
  const config = readHermesServerConfig();
  const client = new HermesManagementClient(config);
  const health = await client.health();
  const management = await client.snapshot(health);
  const now = new Date().toISOString();
  const installation = detectHermesInstallation(health.version, Date.parse(now));
  const installedRuntime: HermesInstalledRuntime = {
    installation,
    profile: config.profile,
    adapter: management.compatibility.adapter,
    provenance: { kind: "live_runtime", label: "Live runtime projection", capturedAt: now, fixtureId: null },
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
  return buildHermesControlCenterProjection({
    registry: HERMES_CAPABILITY_REGISTRY,
    installedRuntime,
    observations: collectHermesObservations(health, management, installation),
    evidenceCatalog: HERMES_CAPABILITY_EVIDENCE_CATALOG,
    evidenceProvenance: {
      implementationRevision: null,
      fixtureId: null,
      fixtureCapturedAt: null,
      artifactGeneratedAt: null,
    },
    now,
  });
}
