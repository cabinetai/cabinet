import type {
  HermesApiHealth,
  HermesHealthSnapshot,
  HermesManagementSnapshot,
  HermesManagementStatus,
} from "./types";
import type { HermesReadOnlyServerConfig, HermesServerConfig } from "./server-config";
import { readOpenCliDiagnostics } from "./opencli-diagnostics";
import {
  normalizeProjectObservation,
  normalizeReviewObservation,
  normalizeWorktreeObservation,
  unavailableDeveloperRepositorySnapshot,
  type HermesDeveloperRepositorySnapshot,
} from "./developer-repository";
import { normalizeRuntimeExecution } from "./runtime-execution";
import { collectAgentApiReadOnly } from "./agent-api-readonly";

type Fetch = typeof fetch;

type NormalizedClientConfig = {
  apiBaseUrl: string;
  apiKey: string;
  managementBaseUrl: string;
  managementToken: string | null;
  profile: string;
  profileConfigured: boolean;
  timeoutMs: number;
  sourceStates: Record<"agent_api" | "management" | "gateway", import("./live-readonly-readiness").HermesReadinessSourceState>;
};

export type HermesManagementStatusObservation = {
  state: "success" | "not_configured" | "authentication_failure" | "unavailable" | "endpoint_failure" | "unknown_profile";
  checkedAt: string;
  message: string;
  data: (HermesManagementStatus & {
    gateway_mode?: string;
    gateway_state?: string;
    gateway_running?: boolean;
    gateway_busy?: boolean;
    gateway_updated_at?: string;
    active_agents?: number;
    active_sessions?: number;
  }) | null;
};

export class HermesManagementRequestError extends Error {
  constructor(readonly status: number | null, message: string) {
    super(message);
    this.name = "HermesManagementRequestError";
  }
}

export type HermesKanbanRunState = {
  runId: string;
  taskId: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  outcome: string | null;
  claimIdentity: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Keep operational failures useful while preventing credential material from reaching the browser. */
export function boundedHermesFailureSummary(input: unknown, maxLength = 240): string | null {
  const raw = text(input);
  if (!raw) return null;
  const redacted = raw
    .replace(/https?:\/\/[^\s)\]}]+/gi, "[redacted URL]")
    .replace(/\b(?:authorization|x-hermes-session-token|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|bot[_ -]?token|token)\b\s*[:=]\s*[^\s,;]+/gi, "[redacted credential]")
    .replace(/\b(?:bearer|basic)\s+[a-z0-9._~+/=-]+/gi, "[redacted authorization]");
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 1).trimEnd()}…` : redacted;
}

function snapshot(
  config: NormalizedClientConfig,
  status: HermesHealthSnapshot["status"],
  message: string,
  values: Partial<Pick<HermesHealthSnapshot, "version" | "gatewayState" | "profile" | "profileSource" | "observationSource">> = {}
): HermesHealthSnapshot {
  return {
    enabled: true,
    status,
    version: values.version ?? null,
    profile: values.profile ?? null,
    profileSource: values.profileSource ?? null,
    gatewayState: values.gatewayState ?? null,
    checkedAt: new Date().toISOString(),
    observationSource: values.observationSource ?? "GET /health/detailed",
    message,
  };
}

export class HermesManagementClient {
  private readonly config: NormalizedClientConfig;

  constructor(
    config: HermesServerConfig | HermesReadOnlyServerConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.config = {
      apiBaseUrl: config.apiBaseUrl ?? "",
      apiKey: config.apiKey ?? "",
      managementBaseUrl: config.managementBaseUrl ?? "",
      managementToken: config.managementToken,
      profile: config.profile ?? "unknown",
      profileConfigured: Boolean(config.profile),
      timeoutMs: config.timeoutMs,
      sourceStates: "sourceStates" in config
        ? config.sourceStates
        : { agent_api: "ready_to_probe", management: "ready_to_probe", gateway: "ready_to_probe" },
    };
  }

  async health(): Promise<HermesHealthSnapshot> {
    if (!this.config.apiBaseUrl || !this.config.apiKey) {
      return snapshot(
        this.config,
        "misconfigured",
        "Hermes Agent API is not configured: CABINET_HERMES_API_URL and CABINET_HERMES_API_KEY are required.",
      );
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const healthResponse = await this.fetchImpl(
        `${this.config.apiBaseUrl}/health/detailed`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            Accept: "application/json",
          },
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        }
      );

      if (healthResponse.status === 401 || healthResponse.status === 403) {
        return snapshot(
          this.config,
          "authentication_failure",
          "Hermes rejected the configured server credential."
        );
      }
      if (!healthResponse.ok) {
        return snapshot(
          this.config,
          "probe_unavailable",
          `Hermes Agent health probe failed with HTTP ${healthResponse.status}.`
        );
      }

      const health = (await healthResponse.json()) as HermesApiHealth;
      const version = text(health.version);
      const gatewayState = text(health.gateway_state);
      const observedProfile = text(health.active_profile) ?? text(health.profile);
      const reportedState = text(health.status)?.toLowerCase();
      if (reportedState && ["offline", "stopped", "not_running"].includes(reportedState)) {
        return snapshot(this.config, "offline", "Hermes Agent explicitly reported that the runtime is stopped.", {
          version,
          gatewayState,
          profile: observedProfile,
          profileSource: observedProfile ? "GET /health/detailed" : null,
        });
      }
      return snapshot(this.config, "online", "Hermes Agent API is online.", {
        version,
        gatewayState,
        profile: observedProfile,
        profileSource: observedProfile ? "GET /health/detailed" : null,
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError");
      return snapshot(
        this.config,
        timedOut ? "probe_timeout" : "probe_unavailable",
        timedOut
          ? "Hermes Agent health probe timed out."
          : "Hermes Agent health probe is temporarily unreachable."
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async managementStatus(): Promise<HermesManagementStatusObservation> {
    const checkedAt = new Date().toISOString();
    if (this.config.sourceStates.management !== "ready_to_probe" || !this.config.managementBaseUrl || !this.config.managementToken || !this.config.profileConfigured) {
      return {
        state: "not_configured",
        checkedAt,
        message: "Hermes Management is not configured for this review.",
        data: null,
      };
    }
    try {
      const raw = record(await this.managementRequest("/api/status"));
      const profiles = Array.isArray(raw.profiles)
        ? raw.profiles.filter((profile): profile is string => typeof profile === "string")
        : null;
      const data: NonNullable<HermesManagementStatusObservation["data"]> = {
        profiles: profiles ?? [],
        ...(value(raw.gateway_mode) ? { gateway_mode: value(raw.gateway_mode)! } : {}),
        ...(value(raw.gateway_state) ? { gateway_state: value(raw.gateway_state)! } : {}),
        ...(typeof raw.gateway_running === "boolean" ? { gateway_running: raw.gateway_running } : {}),
        ...(typeof raw.gateway_busy === "boolean" ? { gateway_busy: raw.gateway_busy } : {}),
        ...(timestamp(raw.gateway_updated_at) ? { gateway_updated_at: timestamp(raw.gateway_updated_at)! } : {}),
        ...(typeof raw.active_agents === "number" && Number.isFinite(raw.active_agents) ? { active_agents: integer(raw.active_agents) } : {}),
        ...(typeof raw.active_sessions === "number" && Number.isFinite(raw.active_sessions) ? { active_sessions: integer(raw.active_sessions) } : {}),
      };
      if (!profiles || !profiles.includes(this.config.profile)) {
        return {
          state: "unknown_profile",
          checkedAt,
          message: "Hermes management did not confirm the selected profile.",
          data,
        };
      }
      return { state: "success", checkedAt, message: "Hermes management status responded.", data };
    } catch (error) {
      if (error instanceof HermesManagementRequestError) {
        if (error.status === 401 || error.status === 403) {
          return { state: "authentication_failure", checkedAt, message: "Hermes management rejected the configured server credential.", data: null };
        }
        if (error.status === 502 || error.status === 504 || error.status === null) {
          return { state: "unavailable", checkedAt, message: "Hermes management is unavailable.", data: null };
        }
        return { state: "endpoint_failure", checkedAt, message: `Hermes management status failed with HTTP ${error.status}.`, data: null };
      }
      return { state: "unavailable", checkedAt, message: "Hermes management is unavailable.", data: null };
    }
  }

  async snapshot(healthOverride?: HermesHealthSnapshot): Promise<HermesManagementSnapshot> {
    const diagnostics: HermesManagementSnapshot["diagnostics"] = [];
    const managementReady = this.config.sourceStates.management === "ready_to_probe" && Boolean(this.config.managementBaseUrl && this.config.managementToken && this.config.profileConfigured);
    const read = async (area: string, path: string, fallback: unknown) => {
      if (!managementReady) return fallback;
      try {
        return await this.managementRequest(path);
      } catch (error) {
        diagnostics.push({
          area,
          status: "degraded",
          message: error instanceof Error ? error.message : `${area} is unavailable.`,
        });
        return fallback;
      }
    };
    const statusPromise = this.managementStatus();
    const agentApiPromise = collectAgentApiReadOnly({
      apiBaseUrl: this.config.apiBaseUrl,
      apiKey: this.config.apiKey,
      managementBaseUrl: this.config.managementBaseUrl,
      managementToken: this.config.managementToken,
      gatewayBaseUrl: "",
      gatewayToken: null,
      profile: this.config.profileConfigured ? this.config.profile : null,
      timeoutMs: this.config.timeoutMs,
      sourceStates: this.config.sourceStates,
    }, this.fetchImpl);
    const [health, profilesRaw, manifestRaw, skillsRaw, jobsRaw, memoryRaw, mcpRaw, toolsetsRaw, pluginsRaw, openCli, runtimeStatus, workersRaw, boardRaw, messagingRaw, sessionsRaw, graphRaw, modelRaw, modelOptionsRaw, filesRaw, usageRaw] =
      await Promise.all([
        healthOverride ?? this.health(),
        read("profiles", "/api/profiles", { profiles: [] }),
        read("agent manifest", `/api/profiles/${encodeURIComponent(this.config.profile)}/soul`, { exists: false, content: "" }),
        read("skills", this.profilePath("/api/skills"), []),
        read("cron", `/api/cron/jobs?profile=${encodeURIComponent(this.config.profile)}`, []),
        read("memory", this.profilePath("/api/memory"), { active: "", providers: [], builtin_files: {} }),
        read("mcp", this.profilePath("/api/mcp/servers"), { servers: [] }),
        read("toolsets", this.profilePath("/api/tools/toolsets"), []),
        read("plugins", this.profilePath("/api/dashboard/plugins"), []),
        managementReady
          ? readOpenCliDiagnostics()
          : Promise.resolve({
              available: false,
              version: null,
              daemon: "unknown" as const,
              extension: "unknown" as const,
              profiles: [],
              binaryLocation: null,
              capabilities: { screenshot: false, domRead: false, formInteraction: false, download: false },
              invocation: "terminal" as const,
              message: "OpenCLI was not probed because its supporting Hermes management source is unavailable for this partial review.",
            }),
        statusPromise,
        read("active agents", "/api/plugins/kanban/workers/active", { workers: [], unavailable: true }),
        read("recent agents", "/api/plugins/kanban/board", { columns: [], unavailable: true }),
        read("messaging", "/api/messaging/platforms", { platforms: [] }),
        read("sessions", "/api/sessions?limit=100&order=recent", { sessions: [], unavailable: true }),
        read("memory graph", "/api/learning/graph", { nodes: [], edges: [], stats: {} }),
        read("current model", "/api/model/info", {}),
        read("model options", "/api/model/options", { providers: [] }),
        read("artifacts", "/api/files", { entries: [], unavailable: true }),
        read("usage analytics", `/api/analytics/usage?days=30&profile=${encodeURIComponent(this.config.profile)}`, { totals: {}, unavailable: true }),
      ]);
    const agentApi = await agentApiPromise;
    const runtimeRaw = runtimeStatus.data ?? {};
    if (!managementReady) {
      diagnostics.push({ area: "management source", status: "degraded", message: "Hermes Management is not configured for this review." });
    } else if (runtimeStatus.state !== "success") {
      diagnostics.push({ area: "runtime status", status: "degraded", message: runtimeStatus.message });
    }

    const developerRepository = managementReady
      ? await this.readDeveloperRepository(sessionsRaw, diagnostics)
      : unavailableDeveloperRepositorySnapshot(this.config.profile, new Date().toISOString(), "Hermes Management is not configured for this review.");
    const runtimeExecution = normalizeRuntimeExecution({
      sessions: sessionsRaw,
      workers: workersRaw,
      board: boardRaw,
      files: filesRaw,
      usage: usageRaw,
      knownRuns: { unavailable: true },
    }, new Date().toISOString());

    const profiles = array(record(profilesRaw).profiles).map((item) => {
      const source = record(item);
      return {
        name: value(source.name) ?? "unknown",
        isDefault: source.is_default === true,
        model: value(source.model),
        provider: value(source.provider),
        skillCount: integer(source.skill_count),
        hasEnvironment: source.has_env === true,
      };
    });
    const skills = array(skillsRaw).map((item) => {
      const source = record(item);
      return {
        name: value(source.name) ?? "unknown",
        description: value(source.description) ?? "",
        category: value(source.category) ?? "uncategorized",
        enabled: source.enabled !== false,
        provenance: value(source.provenance) ?? "unknown",
        usage: finite(source.usage),
      };
    });
    const jobs = array(jobsRaw).map((item) => {
      const source = record(item);
      const schedule = record(source.schedule);
      return {
        id: value(source.id) ?? "unknown",
        name: value(source.name) ?? value(source.id) ?? "Unnamed job",
        enabled: source.enabled !== false,
        schedule: value(source.schedule_display) ?? value(schedule.display) ?? value(schedule.expr) ?? "Not scheduled",
        nextRunAt: value(source.next_run_at),
        lastRunAt: value(source.last_run_at),
        lastError: value(source.last_error),
      };
    });
    const memorySource = record(memoryRaw);
    const providers = array(memorySource.providers).map((item) => {
      const source = record(item);
      return { name: value(source.name) ?? "unknown", description: value(source.description) ?? "", configured: source.configured === true, available: source.available === true };
    });
    const activeProvider = value(memorySource.active) ?? "";
    const active = providers.find((provider) => provider.name === activeProvider);
    const builtIn = record(memorySource.builtin_files);
    const builtInBytes = integer(builtIn.memory) + integer(builtIn.user);
    const mcpServers = array(record(mcpRaw).servers).map((item) => {
      const source = record(item);
      return {
        name: value(source.name) ?? "unknown",
        transport: value(source.transport) ?? "unknown",
        enabled: source.enabled !== false,
        auth: value(source.auth),
        configured: Boolean(value(source.command) || value(source.url)),
      };
    });
    const toolsets = array(toolsetsRaw).map((item) => {
      const source = record(item);
      return {
        name: value(source.name) ?? "unknown",
        label: value(source.label) ?? value(source.name) ?? "Unknown",
        enabled: source.enabled === true,
        configured: source.configured === true,
        toolCount: array(source.tools).length,
      };
    });
    const plugins = array(pluginsRaw).map((item) => {
      const source = record(item);
      return {
        name: value(source.name) ?? "unknown",
        label: value(source.label) ?? value(source.name) ?? "Unknown",
        version: value(source.version) ?? "unknown",
        source: value(source.source) ?? "unknown",
        enabled: true,
      };
    });
    const runtime = record(runtimeRaw);
    const agent = (item: unknown) => {
      const source = record(item);
      const id = value(source.id) ?? value(source.worker_id) ?? value(source.run_id) ?? "unknown";
      return {
        id,
        parentSessionId: value(source.parent_session_id) ?? value(source.session_id),
        runId: value(source.run_id),
        task: value(source.task) ?? value(source.task_title) ?? value(source.title) ?? "Untitled agent task",
        profile: value(source.profile) ?? value(source.profile_name),
        state: value(source.state) ?? value(source.status) ?? "unknown",
        currentAction: value(source.current_action) ?? value(source.current_tool) ?? value(source.tool),
        startedAt: timestamp(source.started_at),
        result: value(source.result) ?? value(source.latest_result),
        error: value(source.error) ?? value(source.last_error),
        canInterrupt: source.can_interrupt === true || Boolean(value(source.run_id)),
      };
    };
    const activeAgents = array(record(workersRaw).workers).map(agent);
    const recentAgents = array(record(boardRaw).columns)
      .flatMap((column) => array(record(column).tasks))
      .filter((item) => {
        const state = value(record(item).state) ?? value(record(item).status) ?? "";
        return ["done", "completed", "failed", "cancelled"].includes(state.toLowerCase());
      })
      .slice(0, 20)
      .map(agent);
    const messaging = array(record(messagingRaw).platforms).map((item) => {
      const source = record(item);
      const enabled = source.enabled === true;
      const configured = source.configured === true;
      const homeChannel = value(source.home_channel) ?? value(source.home_channel_name);
      const lastError = boundedHermesFailureSummary(source.error_message ?? source.error_code);
      return {
        id: value(source.id) ?? "unknown",
        name: value(source.name) ?? value(source.id) ?? "Unknown platform",
        configured,
        enabled,
        connectionState: value(source.state) ?? (enabled ? "unknown" : "disabled"),
        accountOrChannel: homeChannel,
        incomingTriggers: enabled && configured,
        outboundDelivery: homeChannel ? "permitted" as const : configured ? "unknown" as const : "not_configured" as const,
        lastSuccessfulEvent: lastError ? null : timestamp(source.updated_at),
        lastError,
      };
    });
    const managementSessions = array(record(sessionsRaw).sessions).map((item) => {
      const source = record(item);
      const archived = source.archived === true;
      return {
        id: value(source.id) ?? "unknown",
        title: value(source.title) ?? "Untitled session",
        profile: value(source.profile_name) ?? value(source.profile),
        source: value(source.source) ?? "unknown",
        status: source.is_active === true ? "active" : archived ? "archived" : value(source.end_reason) ?? "inactive",
        createdAt: timestamp(source.started_at) ?? timestamp(source.created_at),
        updatedAt: timestamp(source.last_active) ?? timestamp(source.updated_at) ?? timestamp(source.ended_at),
        archived,
        pinned: typeof source.pinned === "boolean" ? source.pinned : null,
        model: value(source.model),
        preview: value(source.preview),
      };
    });
    const sessions = managementReady ? managementSessions : agentApi.sessions.items.map((item) => ({
      id: item.displayId,
      title: item.displayId,
      profile: null,
      source: item.source,
      status: item.lifecycle,
      createdAt: item.startedAt,
      updatedAt: item.lastActiveAt ?? item.endedAt,
      archived: false,
      pinned: null,
      model: item.model,
      preview: null,
      parentDisplayId: item.parentDisplayId,
      parentRelationship: item.parentRelationship,
      observedChildCount: item.observedChildCount,
      lineageCoverage: item.lineageCoverage,
      duplicateObservationCount: item.duplicateObservationCount,
      identityAmbiguous: item.identityAmbiguous,
      messageCount: item.messageCount,
      toolCallCount: item.toolCallCount,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      estimatedCostUsd: item.estimatedCostUsd,
      actualCostUsd: item.actualCostUsd,
    }));
    const artifactKind = (name: string, mime: string | null): "file" | "screenshot" | "diff" | "report" | "document" | "log" => {
      const normalized = `${name} ${mime ?? ""}`.toLowerCase();
      if (/screenshot|image\/(png|jpeg|webp)/.test(normalized)) return "screenshot";
      if (/\.diff\b|\.patch\b/.test(normalized)) return "diff";
      if (/report/.test(normalized)) return "report";
      if (/\.log\b|text\/log/.test(normalized)) return "log";
      if (/\.pdf\b|\.docx?\b|\.xlsx?\b|\.pptx?\b|text\/markdown/.test(normalized)) return "document";
      return "file";
    };
    const artifacts = array(record(filesRaw).entries)
      .filter((item) => record(item).is_directory !== true)
      .slice(0, 200)
      .map((item) => {
        const source = record(item);
        const name = value(source.name) ?? "Untitled artifact";
        const mimeType = value(source.mime_type);
        return {
          id: value(source.path) ?? name,
          name,
          kind: artifactKind(name, mimeType),
          path: value(source.path) ?? name,
          mimeType,
          size: integer(source.size),
          createdAt: timestamp(source.mtime),
          sessionId: value(source.session_id),
          runId: value(source.run_id),
          capability: value(source.capability),
          agent: value(source.agent),
        };
      });
    const graph = record(graphRaw);
    const graphNodes = array(graph.nodes).map((item) => {
      const source = record(item);
      return {
        id: value(source.id) ?? value(source.node_id) ?? "unknown",
        label: value(source.label) ?? value(source.title) ?? value(source.name) ?? "Memory node",
        source: value(source.source),
        age: timestamp(source.updated_at) ?? timestamp(source.created_at),
        profile: value(source.profile) ?? value(source.profile_name),
        category: value(source.category) ?? value(source.type),
      };
    });
    const graphEdges = array(graph.edges).flatMap((item) => {
      const source = record(item);
      const from = value(source.source) ?? value(source.from) ?? value(source.source_id);
      const to = value(source.target) ?? value(source.to) ?? value(source.target_id);
      return from && to ? [{ source: from, target: to, relationship: value(source.relationship) ?? value(source.type) }] : [];
    });
    const currentModel = record(modelRaw);
    const capabilities = record(currentModel.capabilities);
    const modelProviders = array(record(modelOptionsRaw).providers).map((item) => {
      const source = record(item);
      return {
        id: value(source.slug) ?? value(source.id) ?? "unknown",
        name: value(source.name) ?? value(source.slug) ?? "Unknown provider",
        authenticated: source.authenticated === true,
        current: source.is_current === true,
        models: stringArray(source.models).slice(0, 100),
        totalModels: integer(source.total_models) || stringArray(source.models).length,
        warning: value(source.warning),
      };
    });
    if (!diagnostics.length) diagnostics.push({ area: "management", status: "healthy", message: "Hermes management surfaces responded." });
    return {
      checkedAt: new Date().toISOString(),
      profile: this.config.profile,
      agentApi,
      compatibility: {
        version: health.version,
        adapter: managementReady ? "installed-management-contract" : "source-specific",
      },
      developerRepository,
      runtimeExecution,
      profiles,
      agentManifest: {
        profile: this.config.profile,
        exists: record(manifestRaw).exists === true,
        content: value(record(manifestRaw).content) ?? "",
      },
      skills,
      jobs,
      memory: {
        activeProvider: activeProvider || "built-in",
        namespace: `${this.config.profile}:${activeProvider || "built-in"}`,
        captureState: activeProvider ? (active?.configured && active.available ? "active" : "unconfigured") : "built_in",
        recallHealth: activeProvider ? (active?.configured && active.available ? "healthy" : active?.configured ? "degraded" : "unconfigured") : (builtInBytes > 0 ? "healthy" : "degraded"),
        providers,
        builtInBytes,
      },
      mcpServers,
      toolsets,
      plugins,
      openCli,
      operator: {
        runtime: {
          gatewayMode: value(runtime.gateway_mode) ?? "unknown",
          gatewayState: value(runtime.gateway_state) ?? "unknown",
          gatewayRunning: booleanOrNull(runtime.gateway_running),
          gatewayBusy: runtime.gateway_busy === true,
          lastConnection: timestamp(runtime.gateway_updated_at),
          observedAt: new Date().toISOString(),
          activeAgentCount: integer(runtime.active_agents),
          activeSessionCount: integer(runtime.active_sessions),
        },
        agents: { available: record(workersRaw).unavailable !== true, active: activeAgents, recent: recentAgents },
        messaging,
        sessions,
        artifacts,
        memoryGraph: {
          nodes: graphNodes,
          edges: graphEdges,
          stats: { nodes: graphNodes.length, edges: graphEdges.length },
        },
        providers: modelProviders,
        model: {
          currentProvider: managementReady ? value(currentModel.provider) : null,
          currentModel: managementReady ? value(currentModel.model) : null,
          advertisedModels: agentApi.models.items,
          observedAt: managementReady ? new Date().toISOString() : agentApi.models.observedAt,
          source: managementReady ? "/api/model/info" : "/v1/models advertised catalog",
          contextLength: finite(currentModel.effective_context_length),
          supportsTools: booleanOrNull(capabilities.supports_tools),
          supportsVision: booleanOrNull(capabilities.supports_vision),
          supportsReasoning: booleanOrNull(capabilities.supports_reasoning),
        },
        voice: {
          transcriptionAvailable: null,
          speechAvailable: null,
          transcriptionInterface: "/api/audio/transcribe",
          speechInterface: "/api/audio/speak",
        },
      },
      diagnostics,
    };
  }

  async readKanbanRun(runId: string): Promise<HermesKanbanRunState> {
    if (!/^\d+$/.test(runId)) throw new HermesManagementRequestError(null, "A numeric Hermes run identity is required.");
    const raw = record(await this.managementRequest(`/api/plugins/kanban/runs/${encodeURIComponent(runId)}`));
    const run = record(raw.run);
    const returnedRunId = identifier(run.id ?? run.run_id);
    const taskId = identifier(run.task_id);
    const status = value(run.status);
    if (!returnedRunId || !taskId || !status || returnedRunId !== runId) {
      throw new HermesManagementRequestError(409, "Hermes returned a mismatched or incomplete run resource.");
    }
    return {
      runId: returnedRunId,
      taskId,
      status,
      startedAt: timestamp(run.started_at),
      endedAt: timestamp(run.ended_at),
      outcome: value(run.outcome),
      claimIdentity: value(run.claim_lock),
    };
  }

  async terminateKanbanRun(runId: string, reason: string): Promise<{ runId: string; taskId: string }> {
    if (!/^\d+$/.test(runId)) throw new HermesManagementRequestError(null, "A numeric Hermes run identity is required.");
    const raw = record(await this.managementRequest(`/api/plugins/kanban/runs/${encodeURIComponent(runId)}/terminate`, {
      method: "POST",
      body: { reason },
    }));
    const returnedRunId = identifier(raw.run_id);
    const taskId = identifier(raw.task_id);
    if (raw.ok !== true || returnedRunId !== runId || !taskId) {
      throw new HermesManagementRequestError(502, "Hermes returned an incomplete termination result.");
    }
    return { runId: returnedRunId, taskId };
  }

  private async readDeveloperRepository(
    sessionsRaw: unknown,
    diagnostics: HermesManagementSnapshot["diagnostics"]
  ): Promise<HermesDeveloperRepositorySnapshot> {
    const observedAt = new Date().toISOString();
    const project = normalizeProjectObservation(sessionsRaw, this.config.profile, observedAt);
    const sessions = array(record(sessionsRaw).sessions).map(record);
    const selected = sessions.find((item) => item.is_active === true) ?? sessions[0];
    const cwd = selected?.cwd;
    if (typeof cwd !== "string" || !cwd.trim()) {
      return {
        project,
        worktrees: { state: "unknown", observedAt, total: 0, current: null, ambiguousCurrent: false, items: [], summary: "Hermes did not report a session working directory, so worktrees were not queried." },
        review: { state: "unknown", observedAt, repository: null, branch: null, detached: null, clean: null, staged: null, unstaged: null, untracked: null, conflicts: null, ahead: null, behind: null, reviewAvailable: null, reviewCount: null, summary: "Hermes did not report a session working directory, so Git review was not queried." },
      };
    }
    const safeRead = async (area: string, path: string): Promise<{ ok: true; value: unknown } | { ok: false; summary: string }> => {
      try {
        return { ok: true, value: await this.managementRequest(path) };
      } catch (error) {
        const summary = boundedHermesFailureSummary(error instanceof Error ? error.message : error) ?? `${area} is unavailable.`;
        diagnostics.push({ area, status: "degraded", message: summary });
        return { ok: false, summary };
      }
    };
    const encodedPath = encodeURIComponent(cwd);
    const [worktreesRaw, statusRaw, reviewRaw] = await Promise.all([
      safeRead("developer worktrees", `/api/git/worktrees?path=${encodedPath}`),
      safeRead("developer git status", `/api/git/status?path=${encodedPath}`),
      safeRead("developer source review", `/api/git/review/list?scope=uncommitted&path=${encodedPath}`),
    ]);
    const unavailable = unavailableDeveloperRepositorySnapshot(this.config.profile, observedAt, "Hermes developer repository source is unavailable.");
    const worktrees = worktreesRaw.ok
      ? normalizeWorktreeObservation(worktreesRaw.value, cwd, observedAt)
      : { ...unavailable.worktrees, summary: worktreesRaw.summary };
    const review = statusRaw.ok
      ? normalizeReviewObservation(statusRaw.value, reviewRaw.ok ? reviewRaw.value : {}, cwd, observedAt)
      : { ...unavailable.review, summary: statusRaw.summary };
    if (statusRaw.ok && !reviewRaw.ok) {
      review.state = "failure";
      review.reviewAvailable = false;
      review.summary = `${review.summary} Review list failed: ${reviewRaw.summary}`;
    }
    return { project, worktrees, review };
  }

  async perform(action: string, payload: Record<string, unknown>): Promise<unknown> {
    const profile = this.config.profile;
    if (action === "skill.toggle") return this.managementRequest("/api/skills/toggle", { method: "PUT", body: { name: requiredValue(payload.name, "skill name"), enabled: payload.enabled === true, profile } });
    if (action === "skill.install") return this.managementRequest("/api/skills/hub/install", { method: "POST", body: { identifier: requiredValue(payload.identifier, "skill hub identifier"), profile } });
    if (action === "skill.create") return this.managementRequest("/api/skills", { method: "POST", body: { name: requiredValue(payload.name, "skill name"), content: requiredValue(payload.content, "skill content"), category: value(payload.category), profile } });
    if (action === "skill.update") return this.managementRequest("/api/skills/content", { method: "PUT", body: { name: requiredValue(payload.name, "skill name"), content: requiredValue(payload.content, "skill content"), profile } });
    if (action === "job.pause" || action === "job.resume" || action === "job.trigger") {
      const id = encodeURIComponent(requiredValue(payload.id, "job id"));
      return this.managementRequest(`/api/cron/jobs/${id}/${action.split(".")[1]}?profile=${encodeURIComponent(profile)}`, { method: "POST" });
    }
    if (action === "job.create") return this.managementRequest(`/api/cron/jobs?profile=${encodeURIComponent(profile)}`, { method: "POST", body: { name: value(payload.name), prompt: requiredValue(payload.prompt, "job prompt"), schedule: requiredValue(payload.schedule, "job schedule"), skills: stringArray(payload.skills), deliver: "local" } });
    if (action === "mcp.toggle") {
      const name = encodeURIComponent(requiredValue(payload.name, "MCP server name"));
      return this.managementRequest(`/api/mcp/servers/${name}/enabled`, { method: "PUT", body: { enabled: payload.enabled === true, profile } });
    }
    if (action === "toolset.toggle") {
      const name = encodeURIComponent(requiredValue(payload.name, "toolset name"));
      return this.managementRequest(`/api/tools/toolsets/${name}?profile=${encodeURIComponent(profile)}`, { method: "PUT", body: { enabled: payload.enabled === true } });
    }
    if (action === "profile.create") return this.managementRequest("/api/profiles", { method: "POST", body: { name: requiredValue(payload.name, "profile name"), description: requiredValue(payload.isolationReason, "isolation reason"), no_skills: false } });
    if (action === "profile.manifest") {
      const name = encodeURIComponent(requiredValue(payload.name, "profile name"));
      return this.managementRequest(`/api/profiles/${name}/soul`, { method: "PUT", body: { content: requiredValue(payload.content, "agent manifest") } });
    }
    throw new Error("Unsupported Hermes management action.");
  }

  private profilePath(path: string): string {
    return `${path}${path.includes("?") ? "&" : "?"}profile=${encodeURIComponent(this.config.profile)}`;
  }

  private async managementRequest(path: string, options: { method?: string; body?: unknown } = {}): Promise<unknown> {
    if (!this.config.managementBaseUrl || !this.config.managementToken || !this.config.profileConfigured) {
      throw new HermesManagementRequestError(null, "Hermes management authentication and profile configuration are incomplete.");
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.config.managementBaseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          "X-Hermes-Session-Token": this.config.managementToken,
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new HermesManagementRequestError(
          response.status,
          `Hermes management request failed with HTTP ${response.status}.`,
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new HermesManagementRequestError(504, "Hermes management request timed out.");
      if (error instanceof HermesManagementRequestError) throw error;
      throw new HermesManagementRequestError(502, "Hermes management is unreachable.");
    } finally { clearTimeout(timeoutId); }
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function value(input: unknown): string | null { return typeof input === "string" && input.trim() ? input.trim() : null; }
function identifier(input: unknown): string | null {
  if (typeof input === "number" && Number.isSafeInteger(input) && input >= 0) return String(input);
  return value(input);
}
function integer(input: unknown): number { return typeof input === "number" && Number.isFinite(input) ? Math.max(0, Math.round(input)) : 0; }
function finite(input: unknown): number | null { return typeof input === "number" && Number.isFinite(input) ? input : null; }
function booleanOrNull(input: unknown): boolean | null { return typeof input === "boolean" ? input : null; }
function timestamp(input: unknown): string | null {
  if (typeof input === "string" && input.trim()) return input.trim();
  if (typeof input === "number" && Number.isFinite(input)) {
    const milliseconds = input > 10_000_000_000 ? input : input * 1_000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}
function requiredValue(input: unknown, label: string): string { const result = value(input); if (!result) throw new Error(`Missing ${label}.`); return result; }
function stringArray(input: unknown): string[] { return array(input).filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()); }
