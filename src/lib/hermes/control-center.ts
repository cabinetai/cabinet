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
import { assessHermesLiveReadiness, type HermesLiveReadiness } from "./live-readonly-readiness";
import { HermesManagementClient } from "./management-client";
import { readHermesReadOnlyServerConfig } from "./server-config";
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
  installed: ReturnType<typeof detectHermesInstallation>,
  readiness?: HermesLiveReadiness,
): HermesCapabilityObservation[] {
  const observedAt = management.checkedAt;
  const managementReady = readiness?.sources.find((source) => source.id === "management")?.state === "ready_to_probe";
  const failed = new Map(management.diagnostics.filter((item) => item.status === "degraded").map((item) => [item.area, item.message]));
  const observations: HermesCapabilityObservation[] = [];
  const add = (
    capabilityId: string,
    source: string,
    interfaceIdentity: string,
    outcome: HermesEvidenceOutcome,
    summary: string,
    options: Partial<Pick<HermesCapabilityObservation, "observedAt" | "assertedFreshness" | "facts" | "installedBackendVersion" | "installedBackendCommit">> = {}
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
    installedBackendVersion: options.installedBackendVersion === undefined ? installed.backendVersion : options.installedBackendVersion,
    installedBackendCommit: options.installedBackendCommit === undefined ? installed.backendCommit : options.installedBackendCommit,
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
    if (!managementReady) {
      for (const id of input.ids) add(
        id,
        input.source,
        input.interface,
        "unavailable",
        "Hermes Management is not configured for this review.",
        {
          facts: { sourceGroup: "management" },
          installedBackendVersion: installed.upstreamAudit.installedBackendVersion,
          installedBackendCommit: null,
        },
      );
      return;
    }
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
    {
      observedAt: health.checkedAt,
      facts: { connectionState: health.status },
      installedBackendVersion: health.version,
      installedBackendCommit: null,
    }
  );
  endpoint({ ids: ["profiles"], area: "profiles", source: "Hermes profiles", interface: "/api/profiles", count: management.profiles.length, emptyOutcome: "not_configured" });
  endpoint({ ids: ["skills"], area: "skills", source: "Hermes skills", interface: "/api/skills", count: management.skills.length });
  endpoint({ ids: ["cron"], area: "cron", source: "Hermes cron jobs", interface: "/api/cron/jobs", count: management.jobs.length });
  endpoint({ ids: ["chat", "archived-chats", "session-pinning"], area: "sessions", source: "Hermes sessions", interface: "/api/sessions", count: management.operator.sessions.length });
  endpoint({ ids: ["memory-context"], area: "memory", source: "Hermes memory", interface: "/api/memory", count: management.memory.providers.length, successSummary: `Hermes memory reported provider ${management.memory.activeProvider}.` });
  endpoint({ ids: ["starmap"], area: "memory graph", source: "Hermes memory graph", interface: "/api/learning/graph", count: management.operator.memoryGraph.stats.nodes });
  endpoint({ ids: ["providers", "provider-accounts"], area: "model options", source: "Hermes model options", interface: "/api/model/options", count: management.operator.providers.length, emptyOutcome: "not_configured" });
  endpoint({ ids: ["models", "model-settings"], area: "current model", source: "Hermes current model", interface: "/api/model/info", count: management.operator.model.model ? 1 : 0, emptyOutcome: "not_configured" });
  endpoint({ ids: ["mcp"], area: "mcp", source: "Hermes MCP servers", interface: "/api/mcp/servers", count: management.mcpServers.length });
  endpoint({ ids: ["plugins"], area: "plugins", source: "Hermes dashboard plugins", interface: "/api/dashboard/plugins", count: management.plugins.length });
  endpoint({ ids: ["executor", "api-keys-tools"], area: "toolsets", source: "Hermes toolsets", interface: "/api/tools/toolsets", count: management.toolsets.length });

  const execution = management.runtimeExecution;
  const executionOutcome = (state: typeof execution.runSource.state): HermesEvidenceOutcome => state;
  add("command-center", "Hermes runtime execution", "/api/sessions + /v1/runs/{run_id}", managementReady ? executionOutcome(execution.runSource.state) : "unavailable", managementReady ? execution.runSource.summary : "Hermes Management is not configured for this review.", {
    observedAt: execution.observedAt,
    facts: { runtimeExecution: execution, sourceGroup: "management" },
    installedBackendVersion: managementReady ? installed.backendVersion : installed.upstreamAudit.installedBackendVersion,
    installedBackendCommit: managementReady ? installed.backendCommit : null,
  });
  add("agents-subagents", "Hermes active workers", "/api/plugins/kanban/workers/active", managementReady ? executionOutcome(execution.agents.state) : "unavailable", managementReady ? execution.agents.summary : "Hermes Management is not configured for this review.", {
    observedAt: execution.observedAt,
    facts: { count: execution.agents.count, sourceGroup: "management" },
    installedBackendVersion: managementReady ? installed.backendVersion : installed.upstreamAudit.installedBackendVersion,
    installedBackendCommit: managementReady ? installed.backendCommit : null,
  });
  add("cron", "Hermes Kanban queue", "/api/plugins/kanban/board", managementReady ? executionOutcome(execution.queue.state) : "unavailable", managementReady ? execution.queue.summary : "Hermes Management is not configured for this review.", {
    observedAt: execution.observedAt,
    facts: { total: execution.queue.total, counts: execution.queue.counts, sourceGroup: "management" },
    installedBackendVersion: managementReady ? installed.backendVersion : installed.upstreamAudit.installedBackendVersion,
    installedBackendCommit: managementReady ? installed.backendCommit : null,
  });
  add("approvals", "Hermes known-run pending input", "/v1/runs/{run_id} + /events", managementReady ? executionOutcome(execution.approvals.state) : "unavailable", managementReady ? execution.approvals.summary : "Hermes Management is not configured for this review.", {
    observedAt: execution.observedAt,
    facts: { count: execution.approvals.count, rule: "Hermes prepares; Jeremy commits.", sourceGroup: "management" },
    installedBackendVersion: managementReady ? installed.backendVersion : installed.upstreamAudit.installedBackendVersion,
    installedBackendCommit: managementReady ? installed.backendCommit : null,
  });
  for (const id of ["artifacts", "files"]) add(id, "Hermes artifact metadata", "/api/files", managementReady ? executionOutcome(execution.artifacts.state) : "unavailable", managementReady ? execution.artifacts.summary : "Hermes Management is not configured for this review.", {
    observedAt: execution.observedAt,
    facts: { total: execution.artifacts.total, items: execution.artifacts.items, sourceGroup: "management" },
    installedBackendVersion: managementReady ? installed.backendVersion : installed.upstreamAudit.installedBackendVersion,
    installedBackendCommit: managementReady ? installed.backendCommit : null,
  });
  add("usage-insights", "Hermes usage analytics", "/api/analytics/usage", managementReady ? executionOutcome(execution.usage.state) : "unavailable", managementReady ? execution.usage.summary : "Hermes Management is not configured for this review.", {
    observedAt: execution.observedAt,
    facts: { inputTokens: execution.usage.inputTokens, outputTokens: execution.usage.outputTokens, estimatedCostUsd: execution.usage.estimatedCostUsd, actualCostUsd: execution.usage.actualCostUsd, sessions: execution.usage.sessions, sourceGroup: "management" },
    installedBackendVersion: managementReady ? installed.backendVersion : installed.upstreamAudit.installedBackendVersion,
    installedBackendCommit: managementReady ? installed.backendCommit : null,
  });

  const project = management.developerRepository.project;
  add("projects", "Hermes session project association", "/api/sessions?limit=100", managementReady ? developerOutcome(project.state) : "unavailable", managementReady ? project.summary : "Hermes Management is not configured for this review.", {
    observedAt: project.observedAt,
    facts: {
      project: project.project,
      profile: project.profile,
      sessionAssociation: project.sessionAssociation,
      workingDirectoryReported: project.workingDirectoryReported,
      repositoryAssociated: project.repositoryAssociated,
      repository: project.repository,
      sourceGroup: "management",
    },
    installedBackendVersion: managementReady ? installed.backendVersion : installed.upstreamAudit.installedBackendVersion,
    installedBackendCommit: managementReady ? installed.backendCommit : null,
  });
  const worktrees = management.developerRepository.worktrees;
  add("worktrees", "Hermes Git worktrees", "/api/git/worktrees", managementReady ? developerOutcome(worktrees.state) : "unavailable", managementReady ? worktrees.summary : "Hermes Management is not configured for this review.", {
    observedAt: worktrees.observedAt,
    facts: { total: worktrees.total, current: worktrees.current, ambiguousCurrent: worktrees.ambiguousCurrent, items: worktrees.items, sourceGroup: "management" },
    installedBackendVersion: managementReady ? installed.backendVersion : installed.upstreamAudit.installedBackendVersion,
    installedBackendCommit: managementReady ? installed.backendCommit : null,
  });
  const review = management.developerRepository.review;
  add("source-review", "Hermes Git status and review", "/api/git/status + /api/git/review/list", managementReady ? developerOutcome(review.state) : "unavailable", managementReady ? review.summary : "Hermes Management is not configured for this review.", {
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
      sourceGroup: "management",
    },
    installedBackendVersion: managementReady ? installed.backendVersion : installed.upstreamAudit.installedBackendVersion,
    installedBackendCommit: managementReady ? installed.backendCommit : null,
  });

  const messagingFailure = failed.get("messaging");
  const configuredPlatforms = management.operator.messaging.filter((item) => item.configured);
  const platformFailures = configuredPlatforms.filter((item) => Boolean(item.lastError));
  add(
    "messaging",
    "Hermes messaging platforms",
    "/api/messaging/platforms",
    !managementReady ? "unavailable" : messagingFailure || platformFailures.length ? "failure" : configuredPlatforms.length ? "success" : "not_configured",
    !managementReady
      ? "Hermes Management is not configured for this review."
      : messagingFailure
      ? `Hermes messaging platforms failed: ${messagingFailure}`
      : platformFailures.length
        ? platformFailures.map((item) => `${item.name}: ${item.lastError}`).join(" ")
        : configuredPlatforms.length
          ? `${configuredPlatforms.length} configured messaging platform${configuredPlatforms.length === 1 ? "" : "s"} reported no failure.`
          : "Hermes messaging responded, but no platform is configured.",
    {
      facts: { configuredPlatforms: configuredPlatforms.length, failedPlatforms: platformFailures.length, sourceGroup: "management" },
      installedBackendVersion: managementReady ? installed.backendVersion : installed.upstreamAudit.installedBackendVersion,
      installedBackendCommit: managementReady ? installed.backendCommit : null,
    }
  );

  const primaryState = gatewayState(health.gatewayState);
  add(
    "gateway",
    "Hermes health bridge",
    "/health/detailed gateway_state",
    "unknown",
    primaryState === "unknown"
      ? "Agent health did not report a Gateway state."
      : `Agent health bridge reported Gateway ${primaryState}; this does not prove the direct Gateway source is available.`,
    { observedAt: health.checkedAt, facts: { state: primaryState }, installedBackendVersion: health.version, installedBackendCommit: null }
  );
  const managementFailure = failed.get("runtime status");
  const managementState = gatewayState(management.operator.runtime.gatewayState, management.operator.runtime.gatewayRunning);
  add(
    "gateway",
    "Hermes management status",
    "/api/status gateway state",
    !managementReady || managementFailure ? "unavailable" : managementState === "unknown" ? "unknown" : "success",
    !managementReady
      ? "Hermes Management is not configured for this review."
      : managementFailure
        ? `Management gateway observation failed: ${managementFailure}`
        : `Management gateway state is ${managementState}.`,
    {
      observedAt: management.operator.runtime.observedAt,
      facts: { state: !managementReady || managementFailure ? "unavailable" : managementState, sourceGroup: "management" },
      installedBackendVersion: managementReady ? installed.backendVersion : installed.upstreamAudit.installedBackendVersion,
      installedBackendCommit: managementReady ? installed.backendCommit : null,
    }
  );
  const gatewayReadiness = readiness?.sources.find((source) => source.id === "gateway");
  if (gatewayReadiness && gatewayReadiness.state !== "ready_to_probe") {
    add(
      "gateway",
      "Cabinet Hermes Gateway configuration",
      "server-only Gateway configuration",
      gatewayReadiness.state === "invalid" ? "failure" : "unavailable",
      gatewayReadiness.state === "invalid"
        ? "Hermes Gateway server configuration is invalid."
        : "Hermes Gateway is not configured for this review.",
      { observedAt: health.checkedAt, facts: { sourceState: gatewayReadiness.state, sourceGroup: "gateway" }, installedBackendCommit: null },
    );
  }

  const openCli = management.openCli;
  const openCliConnected = openCli.available && openCli.daemon === "running" && openCli.extension === "connected" && openCli.profiles.some((profile) => profile.status === "connected");
  add(
    "browser-opencli",
    "OpenCLI doctor",
    "opencli doctor",
    managementReady ? (openCliConnected ? "success" : openCli.available ? "failure" : "unavailable") : "unavailable",
    openCli.message,
    {
      facts: { daemon: openCli.daemon, extension: openCli.extension, connectedProfiles: openCli.profiles.filter((profile) => profile.status === "connected").length, sourceGroup: "management" },
      installedBackendVersion: managementReady ? installed.backendVersion : installed.upstreamAudit.installedBackendVersion,
      installedBackendCommit: managementReady ? installed.backendCommit : null,
    }
  );

  add(
    "voice",
    "Hermes audio interface detection",
    "/api/audio/transcribe and /api/audio/speak",
    "unknown",
    "Hermes audio interfaces were not probed. Browser microphone permission was not requested.",
    { facts: { serverInterface: "unprobed", browserPermission: "not_requested" } }
  );
  const agentIdentityConfirmed = health.status === "online" && Boolean(health.version);
  add(
    "about-updates",
    "Hermes Agent detailed health identity",
    "/health/detailed",
    agentIdentityConfirmed ? "success" : "unknown",
    agentIdentityConfirmed
      ? "Hermes Agent detailed health confirmed the running version identity only. Update checking was not performed."
      : "The running Hermes Agent identity was not confirmed.",
    {
      observedAt: health.checkedAt,
      facts: {
        reportedVersion: health.version,
        versionSource: "GET /health/detailed",
        reportedRunningCommit: null,
        detectedAgentCheckoutCommit: installed.backendCommit,
        detectedCommitSource: "local installation metadata",
        updateCheckPerformed: false,
        applicationUpdateAvailability: "unknown",
        partialClaim: true,
        updateAuditStale: installed.upstreamAudit.stale,
      },
      installedBackendVersion: health.version,
      installedBackendCommit: null,
    }
  );
  return observations;
}

export async function getHermesControlCenterSnapshot(): Promise<HermesControlCenterSnapshot> {
  const readiness = assessHermesLiveReadiness();
  const config = readHermesReadOnlyServerConfig();
  const client = new HermesManagementClient(config);
  const health = await client.health();
  const management = await client.snapshot(health);
  const now = new Date().toISOString();
  const installation = detectHermesInstallation(health.version, Date.parse(now));
  const installedRuntime: HermesInstalledRuntime = {
    installation,
    profile: config.profile ?? "unknown",
    configuredProfile: config.profile ?? "unknown",
    observedActiveProfile: health.profile,
    observedProfileSource: health.profileSource,
    adapter: "source-specific",
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
    observations: collectHermesObservations(health, management, installation, readiness),
    evidenceCatalog: HERMES_CAPABILITY_EVIDENCE_CATALOG,
    evidenceProvenance: {
      implementationRevision: installation.cabinetCommit,
      fixtureId: null,
      fixtureCapturedAt: null,
      artifactGeneratedAt: null,
    },
    now,
  });
}
