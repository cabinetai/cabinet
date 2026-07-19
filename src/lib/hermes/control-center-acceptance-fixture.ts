import { HERMES_CAPABILITY_EVIDENCE_CATALOG } from "./capability-evidence-catalog";
import { HERMES_CAPABILITY_REGISTRY } from "./capability-registry";
import { buildHermesControlCenterProjection } from "./control-center-projection";
import type { HermesCapabilityObservation, HermesControlCenterProjectionInput, HermesInstalledRuntime } from "./control-center-types";

export const HERMES_ACCEPTANCE_FIXTURE_ID = "hermes-phase-2a1-integrity-v1";
export const HERMES_ACCEPTANCE_FIXTURE_CAPTURED_AT = "2026-07-19T22:15:00.000Z";

const unknownObservation = (capabilityId: string): HermesCapabilityObservation => ({
  capabilityId,
  source: "Phase 2A.1 acceptance observation",
  interface: "capability-specific source not exercised by this fixture",
  observedAt: HERMES_ACCEPTANCE_FIXTURE_CAPTURED_AT,
  freshness: "fresh",
  proofKind: "exact_fixture",
  outcome: "unknown",
  summary: "The acceptance fixture does not assert current operational health for this source.",
  installedBackendVersion: "0.18.2",
  installedBackendCommit: "594308d4bbe9",
});

const override = (
  capabilityId: string,
  source: string,
  interfaceIdentity: string,
  outcome: HermesCapabilityObservation["outcome"],
  summary: string,
  facts?: HermesCapabilityObservation["facts"]
): HermesCapabilityObservation => ({
  capabilityId,
  source,
  interface: interfaceIdentity,
  observedAt: HERMES_ACCEPTANCE_FIXTURE_CAPTURED_AT,
  freshness: "fresh",
  proofKind: "exact_fixture",
  outcome,
  summary,
  installedBackendVersion: "0.18.2",
  installedBackendCommit: "594308d4bbe9",
  facts,
});

const overrides = new Map<string, HermesCapabilityObservation[]>([
  ["command-center", [override("command-center", "Hermes detailed health bridge", "/health/detailed", "success", "The exact fixture health bridge responded.", { connectionState: "online" })]],
  ["profiles", [override("profiles", "Hermes profiles", "/api/profiles", "success", "One profile was projected.", { count: 1 })]],
  ["skills", [override("skills", "Hermes skills", "/api/skills", "success", "Twelve profile-scoped skills were projected.", { count: 12 })]],
  ["cron", [override("cron", "Hermes cron jobs", "/api/cron/jobs", "connected_empty", "The cron endpoint responded successfully with no canonical jobs.", { count: 0 })]],
  ["agents-subagents", [override("agents-subagents", "Hermes active agents", "/api/plugins/kanban/workers/active", "success", "One active Hermes worker was projected.", { count: 1 })]],
  ["messaging", [override("messaging", "Hermes messaging platforms", "/api/messaging/platforms", "failure", "Telegram: Fatal polling conflict. Another poller is active.", { configuredPlatforms: 1, failedPlatforms: 1 })]],
  ["artifacts", [override("artifacts", "Hermes files", "/api/files", "success", "One safe artifact record was projected.", { count: 1 })]],
  ["archived-chats", [override("archived-chats", "Hermes sessions", "/api/sessions", "success", "One session was projected.", { count: 1 })]],
  ["session-pinning", [override("session-pinning", "Hermes sessions", "/api/sessions", "success", "Session pin state was projected as unknown.", { count: 1 })]],
  ["memory-context", [override("memory-context", "Hermes memory", "/api/memory", "success", "Supermemory is active for profile operator-os.", { provider: "supermemory", profile: "operator-os" })]],
  ["starmap", [override("starmap", "Hermes memory graph", "/api/learning/graph", "connected_empty", "The operator-os graph endpoint responded with no nodes.", { nodes: 0, edges: 0, profile: "operator-os" })]],
  ["providers", [override("providers", "Hermes model options", "/api/model/options", "success", "One authenticated provider summary was projected.", { count: 1 })]],
  ["provider-accounts", [override("provider-accounts", "Hermes model options", "/api/model/options", "success", "One redacted provider account summary was projected.", { count: 1 })]],
  ["models", [override("models", "Hermes current model", "/api/model/info", "success", "The inherited current model was projected.", { count: 1 })]],
  ["model-settings", [
    override("model-settings", "Hermes current model", "/api/model/info", "success", "The current model endpoint responded.", { count: 1 }),
    override("model-settings", "Hermes config schema", "/api/config/schema", "unavailable", "The model configuration schema was unavailable in this fixture.")
  ]],
  ["gateway", [
    override("gateway", "Hermes health bridge", "/health/detailed gateway_state", "success", "Health bridge gateway state is running.", { state: "running" }),
    override("gateway", "Hermes management status", "/api/status gateway state", "success", "Management gateway state is stopped.", { state: "stopped" }),
  ]],
  ["mcp", [override("mcp", "Hermes MCP servers", "/api/mcp/servers", "connected_empty", "The MCP endpoint responded successfully with no configured servers.", { count: 0 })]],
  ["plugins", [override("plugins", "Hermes dashboard plugins", "/api/dashboard/plugins", "success", "One enabled plugin was projected.", { count: 1 })]],
  ["executor", [override("executor", "Hermes toolsets", "/api/tools/toolsets", "success", "The executor toolset is configured.", { count: 1 })]],
  ["browser-opencli", [override("browser-opencli", "OpenCLI doctor", "opencli doctor", "success", "OpenCLI daemon, extension, and one browser profile are connected.", { daemon: "running", extension: "connected", connectedProfiles: 1 })]],
  ["voice", [override("voice", "Hermes audio interface detection", "/api/audio/transcribe and /api/audio/speak", "unknown", "Audio interfaces were not probed. Browser microphone permission was not requested.", { serverInterface: "unprobed", browserPermission: "not_requested" })]],
  ["notifications", [override("notifications", "Cabinet-local Hermes event preferences", "Cabinet preference store", "success", "Cabinet-local notification preferences are mapped to Hermes events.", { scope: "cabinet_local" })]],
  ["about-updates", [override("about-updates", "Installed Hermes metadata", "application metadata and source audit", "success", "Installed metadata was detected independently of runtime health.")]],
  ["computer-use", [override("computer-use", "Hermes computer-use status", "/api/tools/computer-use/status", "unavailable", "Computer Use status is unavailable in this fixture.")]],
  ["raw-logs", [override("raw-logs", "Hermes log diagnostic", "/api/logs", "unknown", "Raw logs remain available only through the diagnostic escape path.")]],
]);

export const HERMES_ACCEPTANCE_FIXTURE_OBSERVATIONS: readonly HermesCapabilityObservation[] = HERMES_CAPABILITY_REGISTRY.flatMap((capability) =>
  overrides.get(capability.id) ?? [unknownObservation(capability.id)]
);

const installedRuntime: HermesInstalledRuntime = {
  installation: {
    desktopVersion: "0.17.0",
    desktopCommit: null,
    backendVersion: "0.18.2",
    backendCommit: "594308d4bbe9",
    cabinetCommit: "278ddb899b71",
    upstreamAudit: {
      auditedAt: "2026-07-19T21:06:53Z",
      auditedCommit: "0d2ad3993eb91c486854bc71e2721b747ab1d0f4",
      installedBackendVersion: "0.18.2",
      installedBackendCommit: "594308d4bbe95548c9fe418bb10c449099426f93",
      commitsBehind: 328,
      stale: true,
    },
  },
  profile: "operator-os",
  adapter: "desktop-0.18",
  provenance: {
    kind: "acceptance_fixture",
    label: "Acceptance fixture — not live runtime",
    capturedAt: HERMES_ACCEPTANCE_FIXTURE_CAPTURED_AT,
    fixtureId: HERMES_ACCEPTANCE_FIXTURE_ID,
  },
  live: {
    profiles: 1,
    skills: 12,
    jobs: 0,
    mcpServers: 0,
    plugins: 1,
    openCliProfiles: 1,
    openCliVersion: "1.8.5",
    openCliBinaryLocation: "/opt/homebrew/bin/opencli",
    openCliCapabilities: { screenshot: true, domRead: true, formInteraction: true, download: true },
    memoryProvider: "supermemory",
    memoryNamespace: "operator-os:supermemory",
    diagnostics: [{ area: "fixture sanitization", status: "degraded", message: "Authorization: Bearer fixture-secret-diagnostic" }],
    operator: {
      runtime: { gatewayMode: "local", gatewayState: "stopped", gatewayRunning: false, gatewayBusy: false, lastConnection: HERMES_ACCEPTANCE_FIXTURE_CAPTURED_AT, observedAt: HERMES_ACCEPTANCE_FIXTURE_CAPTURED_AT, activeAgentCount: 1, activeSessionCount: 1 },
      agents: { available: true, active: [{ id: "worker-1", parentSessionId: "session-1", runId: "run-1", task: "Review projection integrity", profile: "operator-os", state: "running", currentAction: "Reading capability observations", startedAt: HERMES_ACCEPTANCE_FIXTURE_CAPTURED_AT, result: "session_token=fixture-secret-result", error: "api_key=fixture-secret-agent", canInterrupt: true }], recent: [] },
      messaging: [{ id: "telegram", name: "Telegram", configured: true, enabled: true, connectionState: "failed", accountOrChannel: "Operations", incomingTriggers: true, outboundDelivery: "permitted", lastSuccessfulEvent: null, lastError: "Fatal polling conflict. Another poller is active." }],
      sessions: [{ id: "session-1", title: "Projection integrity review", profile: "operator-os", source: "desktop", status: "active", createdAt: HERMES_ACCEPTANCE_FIXTURE_CAPTURED_AT, updatedAt: HERMES_ACCEPTANCE_FIXTURE_CAPTURED_AT, archived: false, pinned: null, model: "glm-5.2", preview: "Reviewing typed capability observations" }],
      artifacts: [{ id: "artifact-1", name: "fixture-projection.json", kind: "report", path: "/Users/owner/.config/credentials/fixture-secret-file", mimeType: "application/json", size: 2048, createdAt: HERMES_ACCEPTANCE_FIXTURE_CAPTURED_AT, sessionId: "session-1", runId: "run-1", capability: "artifacts", agent: "worker-1" }],
      memoryGraph: { nodes: [], edges: [], stats: { nodes: 0, edges: 0 } },
      providers: [{ id: "ollama-cloud", name: "Ollama Cloud", authenticated: true, current: true, models: ["glm-5.2"], totalModels: 1, warning: "client_secret=fixture-secret-provider" }],
      model: { provider: "ollama-cloud", model: "glm-5.2", contextLength: null, supportsTools: true, supportsVision: null, supportsReasoning: null },
      voice: { transcriptionAvailable: null, speechAvailable: null, transcriptionInterface: "/api/audio/transcribe", speechInterface: "/api/audio/speak" },
    },
  },
};

export function buildHermesAcceptanceFixtureProjection() {
  return buildHermesControlCenterProjection(buildHermesAcceptanceFixtureInput());
}

export function buildHermesAcceptanceFixtureInput(): HermesControlCenterProjectionInput {
  return {
    registry: HERMES_CAPABILITY_REGISTRY,
    installedRuntime,
    observations: HERMES_ACCEPTANCE_FIXTURE_OBSERVATIONS,
    evidenceCatalog: HERMES_CAPABILITY_EVIDENCE_CATALOG,
    now: HERMES_ACCEPTANCE_FIXTURE_CAPTURED_AT,
  };
}
