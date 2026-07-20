import type {
  HermesApiHealth,
  HermesHealthSnapshot,
  HermesManagementSnapshot,
  HermesManagementStatus,
} from "./types";
import type { HermesServerConfig } from "./server-config";
import { readOpenCliDiagnostics } from "./opencli-diagnostics";
import {
  normalizeProjectObservation,
  normalizeReviewObservation,
  normalizeWorktreeObservation,
  unavailableDeveloperRepositorySnapshot,
  type HermesDeveloperRepositorySnapshot,
} from "./developer-repository";

type Fetch = typeof fetch;

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
  config: HermesServerConfig,
  status: HermesHealthSnapshot["status"],
  message: string,
  values: Partial<Pick<HermesHealthSnapshot, "version" | "gatewayState">> = {}
): HermesHealthSnapshot {
  return {
    enabled: true,
    status,
    version: values.version ?? null,
    profile: config.profile,
    gatewayState: values.gatewayState ?? null,
    checkedAt: new Date().toISOString(),
    message,
  };
}

export class HermesManagementClient {
  constructor(
    private readonly config: HermesServerConfig,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async health(): Promise<HermesHealthSnapshot> {
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
          "offline",
          `Hermes health request failed with HTTP ${healthResponse.status}.`
        );
      }

      const health = (await healthResponse.json()) as HermesApiHealth;
      const version = text(health.version);
      const gatewayState = text(health.gateway_state);

      const profileResponse = await this.fetchImpl(
        `${this.config.managementBaseUrl}/api/status`,
        {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        }
      );
      if (!profileResponse.ok) {
        return snapshot(
          this.config,
          "offline",
          `Hermes profile discovery failed with HTTP ${profileResponse.status}.`,
          { version, gatewayState }
        );
      }

      const management = (await profileResponse.json()) as HermesManagementStatus;
      const profiles = Array.isArray(management.profiles)
        ? management.profiles.filter((profile): profile is string =>
            typeof profile === "string"
          )
        : [];
      if (!profiles.includes(this.config.profile)) {
        return snapshot(
          this.config,
          "unavailable_profile",
          `Configured Hermes profile ${JSON.stringify(this.config.profile)} is unavailable.`,
          { version, gatewayState }
        );
      }

      return snapshot(this.config, "online", "Hermes is online.", {
        version,
        gatewayState,
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError");
      return snapshot(
        this.config,
        "offline",
        timedOut
          ? "Hermes health request timed out."
          : "Hermes is unreachable."
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async snapshot(healthOverride?: HermesHealthSnapshot): Promise<HermesManagementSnapshot> {
    const diagnostics: HermesManagementSnapshot["diagnostics"] = [];
    const read = async (area: string, path: string, fallback: unknown) => {
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
    const [health, profilesRaw, manifestRaw, skillsRaw, jobsRaw, memoryRaw, mcpRaw, toolsetsRaw, pluginsRaw, openCli, runtimeRaw, workersRaw, boardRaw, messagingRaw, sessionsRaw, graphRaw, modelRaw, modelOptionsRaw, filesRaw] =
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
        readOpenCliDiagnostics(),
        read("runtime status", "/api/status", {}),
        read("active agents", "/api/plugins/kanban/workers/active", { workers: [], unavailable: true }),
        read("recent agents", "/api/plugins/kanban/board", { columns: [] }),
        read("messaging", "/api/messaging/platforms", { platforms: [] }),
        read("sessions", "/api/sessions?limit=100", { sessions: [] }),
        read("memory graph", "/api/learning/graph", { nodes: [], edges: [], stats: {} }),
        read("current model", "/api/model/info", {}),
        read("model options", "/api/model/options", { providers: [] }),
        read("artifacts", "/api/files", { entries: [] }),
      ]);

    const developerRepository = await this.readDeveloperRepository(sessionsRaw, diagnostics);

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
    const sessions = array(record(sessionsRaw).sessions).map((item) => {
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
      compatibility: { version: health.version, adapter: "desktop-0.18" },
      developerRepository,
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
          provider: value(currentModel.provider),
          model: value(currentModel.model),
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
    if (!this.config.managementToken) throw new Error("Missing server configuration: CABINET_HERMES_MANAGEMENT_TOKEN");
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
        signal: controller.signal,
      });
      if (!response.ok) {
        let detail = `Hermes management request failed with HTTP ${response.status}.`;
        try { detail = value(record(await response.json()).detail) ?? detail; } catch {}
        throw new Error(detail);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("Hermes management request timed out.");
      throw error;
    } finally { clearTimeout(timeoutId); }
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function value(input: unknown): string | null { return typeof input === "string" && input.trim() ? input.trim() : null; }
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
