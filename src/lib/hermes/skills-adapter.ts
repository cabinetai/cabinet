import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import { sanitizeHermesText } from "./control-center-sanitizer";
import type { HermesReadOnlyServerConfig } from "./server-config";
import type {
  HermesManagedSkill,
  HermesSkillAction,
  HermesSkillOperation,
  HermesSkillsSnapshot,
  HermesSkillsSourceState,
} from "./skills-management-types";

type Fetch = typeof fetch;

type CliResult = { exitCode: number | null; timedOut: boolean; output: string };
export type HermesSkillsCli = {
  run(args: readonly string[], options?: { input?: string; timeoutMs?: number }): Promise<CliResult>;
};

export type HermesSkillsAdapter = {
  read(query?: string): Promise<HermesSkillsSnapshot>;
  checkUpdate(name: string): Promise<boolean | null>;
  execute(operation: HermesSkillOperation): Promise<{ responseReceived: boolean }>;
};

export class HermesSkillsAdapterError extends Error {
  constructor(
    readonly kind: "unavailable" | "authentication" | "timeout" | "invalid_response" | "dispatch_failed",
    message: string,
    readonly dispatched = false,
    readonly responseReceived = false,
  ) {
    super(message);
    this.name = "HermesSkillsAdapterError";
  }
}

const SAFE_NAME = /^[a-z][a-z0-9_-]{0,95}$/;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*){0,6}$/;
const MAX_OUTPUT_BYTES = 128 * 1024;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function safeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  return SAFE_NAME.test(candidate) ? candidate : null;
}

function safeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  return SAFE_IDENTIFIER.test(candidate) ? candidate : null;
}

function safeLabel(value: unknown, max = 64): string | null {
  if (typeof value !== "string") return null;
  const clean = sanitizeHermesText(value, max).replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || clean.includes("[redacted") || /(?:https?|file):\/\//i.test(clean) || /^(?:[a-z]:[\\/]|[/~\\])/i.test(clean)) return null;
  return clean;
}

function uniqueSkills(items: HermesManagedSkill[]): { items: HermesManagedSkill[]; duplicates: string[] } {
  const seen = new Map<string, HermesManagedSkill>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.identity)) duplicates.add(item.identity);
    else seen.set(item.identity, item);
  }
  return { items: [...seen.values()], duplicates: [...duplicates] };
}

function supportedActions(skill: Pick<HermesManagedSkill, "installed" | "enabled" | "provenance">): HermesSkillAction[] {
  if (!skill.installed) return ["install"];
  const actions: HermesSkillAction[] = skill.enabled === false ? ["enable"] : skill.enabled === true ? ["disable"] : [];
  if (skill.provenance === "hub") actions.push("update", "remove");
  return actions;
}

export class FixedHermesSkillsCli implements HermesSkillsCli {
  constructor(
    private readonly executable = process.env.CABINET_HERMES_CLI_PATH?.trim() || "hermes",
    private readonly defaultTimeoutMs = 30_000,
  ) {}

  run(args: readonly string[], options: { input?: string; timeoutMs?: number } = {}): Promise<CliResult> {
    return new Promise((resolve, reject) => {
      const spawnOptions: SpawnOptionsWithoutStdio = {
        shell: false,
        windowsHide: true,
        env: { ...process.env, HERMES_NONINTERACTIVE: "1", NO_COLOR: "1", TERM: "dumb" },
      };
      let child;
      try {
        child = spawn(this.executable, [...args], spawnOptions);
      } catch (error) {
        reject(new HermesSkillsAdapterError("dispatch_failed", error instanceof Error ? error.message : "Hermes CLI could not start."));
        return;
      }
      let output = "";
      const append = (chunk: Buffer | string) => {
        if (Buffer.byteLength(output) >= MAX_OUTPUT_BYTES) return;
        output += String(chunk).slice(0, MAX_OUTPUT_BYTES - Buffer.byteLength(output));
      };
      child.stdout?.on("data", append);
      child.stderr?.on("data", append);
      child.once("error", (error) => reject(new HermesSkillsAdapterError("dispatch_failed", error.message)));
      if (options.input) child.stdin?.end(options.input);
      else child.stdin?.end();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs ?? this.defaultTimeoutMs);
      child.once("close", (exitCode) => {
        clearTimeout(timer);
        resolve({ exitCode, timedOut, output });
      });
    });
  }
}

export class HermesSkillsAgentAdapter implements HermesSkillsAdapter {
  constructor(
    private readonly config: HermesReadOnlyServerConfig,
    private readonly fetchImpl: Fetch = fetch,
    private readonly cli: HermesSkillsCli = new FixedHermesSkillsCli(),
  ) {}

  private profile(): string {
    const profile = safeName(this.config.profile);
    if (!profile) throw new HermesSkillsAdapterError("unavailable", "A safe Hermes profile is not configured.");
    return profile;
  }

  private async api(path: string, init: RequestInit = {}): Promise<unknown> {
    if (!this.config.apiBaseUrl || !this.config.apiKey || this.config.sourceStates.agent_api !== "ready_to_probe") {
      throw new HermesSkillsAdapterError("unavailable", "Hermes Agent API management is not configured.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.config.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) throw new HermesSkillsAdapterError("authentication", "Hermes rejected the configured server credential.");
      if (!response.ok) throw new HermesSkillsAdapterError("invalid_response", `Hermes management returned HTTP ${response.status}.`, init.method !== undefined && init.method !== "GET", true);
      return await response.json();
    } catch (error) {
      if (error instanceof HermesSkillsAdapterError) throw error;
      const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
      throw new HermesSkillsAdapterError(timedOut ? "timeout" : "unavailable", timedOut ? "Hermes management timed out." : "Hermes management is unreachable.", init.method !== undefined && init.method !== "GET", false);
    } finally {
      clearTimeout(timer);
    }
  }

  async read(query = ""): Promise<HermesSkillsSnapshot> {
    const profile = this.profile();
    const observedAt = new Date().toISOString();
    const normalizedQuery = safeLabel(query, 80) ?? "";
    const profileParam = encodeURIComponent(profile);
    try {
      const [installedRaw, sourcesRaw, catalogRaw] = await Promise.all([
        this.api(`/api/skills?profile=${profileParam}`),
        this.api(`/api/skills/hub/sources?profile=${profileParam}`),
        normalizedQuery
          ? this.api(`/api/skills/hub/search?q=${encodeURIComponent(normalizedQuery)}&source=all&limit=50&profile=${profileParam}`)
          : Promise.resolve(null),
      ]);
      const sources = record(sourcesRaw);
      const installedByIdentifier = record(sources.installed);
      const identifierByName = new Map<string, string>();
      for (const [identifierValue, detailValue] of Object.entries(installedByIdentifier)) {
        const identifier = safeIdentifier(identifierValue);
        const name = safeName(record(detailValue).name);
        if (identifier && name && !identifierByName.has(name)) identifierByName.set(name, identifier);
      }
      const installed = array(installedRaw).flatMap((raw): HermesManagedSkill[] => {
        const item = record(raw);
        const name = safeName(item.name);
        if (!name) return [];
        const provenance = item.provenance === "hub" || item.provenance === "bundled" || item.provenance === "agent" ? item.provenance : null;
        const skill: HermesManagedSkill = {
          identity: `${profile}:${name}`,
          name,
          category: safeLabel(item.category),
          installed: true,
          enabled: typeof item.enabled === "boolean" ? item.enabled : null,
          version: safeLabel(item.version, 32),
          source: provenance === "hub" ? safeLabel(item.source) ?? "Hermes Skills Hub" : provenance,
          provenance,
          profile,
          updateAvailable: null,
          observedAt,
          supportedActions: [],
        };
        skill.supportedActions = supportedActions(skill);
        return [skill];
      });
      const rawAvailable = normalizedQuery ? array(record(catalogRaw).results) : array(sources.featured);
      const available = rawAvailable.flatMap((raw): HermesManagedSkill[] => {
        const item = record(raw);
        const name = safeName(item.name);
        const identifier = safeIdentifier(item.identifier);
        if (!name || !identifier || identifierByName.has(name)) return [];
        const skill: HermesManagedSkill = {
          identity: identifier,
          name,
          category: null,
          installed: false,
          enabled: null,
          version: null,
          source: safeLabel(item.source) ?? "Hermes Skills Hub",
          provenance: "hub",
          profile,
          updateAvailable: null,
          observedAt,
          supportedActions: ["install"],
        };
        return [skill];
      });
      const installedUnique = uniqueSkills(installed);
      const availableUnique = uniqueSkills(available);
      const total = installedUnique.items.length + availableUnique.items.length;
      return {
        fixture: false,
        fixtureLabel: null,
        profile,
        observedAt,
        sourceState: total ? "success" : "connected_empty",
        summary: total ? `Hermes reported ${installedUnique.items.length} installed skill(s) and ${availableUnique.items.length} catalog result(s).` : "Hermes responded with an empty skills catalog.",
        interface: "Hermes Agent 0.19.0 authenticated API",
        operations: {
          install: { supported: true, interface: "fixed Hermes CLI: skills install <identifier> --yes", note: "Installed through Hermes scan and quarantine logic." },
          enable: { supported: true, interface: "PUT /api/skills/toggle", note: "Profile-scoped Hermes activation state." },
          disable: { supported: true, interface: "PUT /api/skills/toggle", note: "Profile-scoped Hermes activation state." },
          update: { supported: true, interface: "fixed Hermes CLI: skills update <name>", note: "Only hub-installed skills can be updated." },
          remove: { supported: true, interface: "fixed Hermes CLI: skills uninstall <name>", note: "Only hub-installed skills can be removed." },
        },
        installed: installedUnique.items,
        available: availableUnique.items,
        duplicateIdentities: [...installedUnique.duplicates, ...availableUnique.duplicates],
      };
    } catch (error) {
      const kind = error instanceof HermesSkillsAdapterError ? error.kind : "unavailable";
      const state: HermesSkillsSourceState = kind === "authentication" ? "authentication_failure" : kind === "timeout" ? "timeout" : kind === "invalid_response" ? "failure" : "unavailable";
      return {
        fixture: false,
        fixtureLabel: null,
        profile,
        observedAt,
        sourceState: state,
        summary: error instanceof Error ? sanitizeHermesText(error.message, 160) : "Hermes skills management is unavailable.",
        interface: "Hermes Agent 0.19.0 authenticated API",
        operations: Object.fromEntries((["install", "enable", "disable", "update", "remove"] as HermesSkillAction[]).map((action) => [action, { supported: false, interface: "Unavailable", note: "The canonical Hermes source is unavailable." }])) as HermesSkillsSnapshot["operations"],
        installed: [],
        available: [],
        duplicateIdentities: [],
      };
    }
  }

  async checkUpdate(name: string): Promise<boolean | null> {
    const safe = safeName(name);
    if (!safe) return null;
    const result = await this.cli.run(["-p", this.profile(), "skills", "check", safe]);
    if (result.timedOut || result.exitCode !== 0) return null;
    const normalized = result.output.toLowerCase();
    if (normalized.includes("update_available")) return true;
    if (normalized.includes("up_to_date") || normalized.includes("0 update(s) available")) return false;
    return null;
  }

  async execute(operation: HermesSkillOperation): Promise<{ responseReceived: boolean }> {
    if (operation.profile !== this.profile() || !safeName(operation.targetName)) {
      throw new HermesSkillsAdapterError("dispatch_failed", "The Hermes skill target is invalid.");
    }
    if (operation.action === "enable" || operation.action === "disable") {
      await this.api(`/api/skills/toggle?profile=${encodeURIComponent(operation.profile)}`, {
        method: "PUT",
        body: JSON.stringify({ name: operation.targetName, enabled: operation.action === "enable", profile: operation.profile }),
      });
      return { responseReceived: true };
    }
    const args = ["-p", operation.profile, "skills"];
    if (operation.action === "install") {
      const identifier = safeIdentifier(operation.targetIdentity);
      if (!identifier) throw new HermesSkillsAdapterError("dispatch_failed", "The Hermes catalog identity is invalid.");
      args.push("install", identifier, "--yes");
    } else if (operation.action === "update") {
      args.push("update", operation.targetName);
    } else if (operation.action === "remove") {
      args.push("uninstall", operation.targetName);
    } else {
      throw new HermesSkillsAdapterError("dispatch_failed", "This Hermes skill operation is unsupported.");
    }
    const result = await this.cli.run(args, { input: operation.action === "remove" ? "yes\n" : undefined });
    if (result.timedOut) throw new HermesSkillsAdapterError("timeout", "Hermes did not report a final operation result before timeout.", true, false);
    if (result.exitCode !== 0) throw new HermesSkillsAdapterError("invalid_response", "Hermes reported a non-successful operation result.", true, true);
    return { responseReceived: true };
  }
}
