import type {
  HermesApiHealth,
  HermesHealthSnapshot,
  HermesManagementSnapshot,
  HermesManagementStatus,
} from "./types";
import type { HermesServerConfig } from "./server-config";
import { readOpenCliDiagnostics } from "./opencli-diagnostics";

type Fetch = typeof fetch;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    const [health, profilesRaw, manifestRaw, skillsRaw, jobsRaw, memoryRaw, mcpRaw, toolsetsRaw, pluginsRaw, openCli] =
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
      ]);

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
    if (!diagnostics.length) diagnostics.push({ area: "management", status: "healthy", message: "Hermes management surfaces responded." });
    return {
      checkedAt: new Date().toISOString(),
      profile: this.config.profile,
      compatibility: { version: health.version, adapter: "desktop-0.18" },
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
      diagnostics,
    };
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
function requiredValue(input: unknown, label: string): string { const result = value(input); if (!result) throw new Error(`Missing ${label}.`); return result; }
function stringArray(input: unknown): string[] { return array(input).filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()); }
