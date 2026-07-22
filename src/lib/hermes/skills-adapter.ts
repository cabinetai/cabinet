import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { sanitizeHermesText } from "./control-center-sanitizer";
import type { HermesReadOnlyServerConfig } from "./server-config";
import type {
  HermesManagedSkill,
  HermesCanonicalSkillsState,
  HermesExactSkillCandidate,
  HermesSkillAction,
  HermesSkillExecutionAuthority,
  HermesSkillOperation,
  HermesSkillsReadEvidence,
  HermesSkillsSnapshot,
} from "./skills-management-types";

type Fetch = typeof fetch;

const AUDITED_HERMES_VERSION = "0.19.0";
const AUDITED_HERMES_SOURCE_REVISION = "714ed4ec6cbe3e57b7bb6379c5e97f7b801469a5";
const HERMES_IDENTITY_SCHEMA = "hermes.cli.identity";
const HERMES_IDENTITY_SCHEMA_VERSION = 1;
const HERMES_PUBLIC_SKILLS_SKIP_VALUE = "official-public-skills-v1";
const SAFE_NAME = /^[a-z][a-z0-9_-]{0,95}$/;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*){0,6}$/;
const MAX_OUTPUT_BYTES = 128 * 1024;
const MAX_EXECUTABLE_BYTES = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TERMINATION_GRACE_MS = 2_000;
const HARD_SETTLEMENT_SLACK_MS = 1_000;

export type HermesCliAuthority = {
  opaqueIdentity: string;
  version: typeof AUDITED_HERMES_VERSION;
  sourceRevision: typeof AUDITED_HERMES_SOURCE_REVISION;
  schemaVersion: typeof HERMES_IDENTITY_SCHEMA_VERSION;
  installationId: string;
};

export type CliResult = {
  exitCode: number | null;
  timedOut: boolean;
  forcedTermination: boolean;
  output: string;
};

export type HermesSkillsCli = {
  configured(): boolean;
  inspect(): Promise<HermesCliAuthority>;
  run(args: readonly string[], options?: { input?: string; timeoutMs?: number; expectedAuthority?: string; skipExternalSecretSources?: boolean }): Promise<CliResult>;
};

export type HermesSkillsAdapter = {
  configuredProfile(): string;
  discoverCatalog(query?: string): Promise<HermesSkillsSnapshot>;
  readCanonicalInstalledState(profile: string): Promise<HermesCanonicalSkillsState>;
  inspectExactCandidate(identifier: string, profile: string): Promise<HermesExactSkillCandidate>;
  inspectExecutionAuthority(action: HermesSkillAction, profile: string): Promise<HermesSkillExecutionAuthority>;
  execute(operation: HermesSkillOperation, authority: HermesSkillExecutionAuthority): Promise<{ responseReceived: boolean }>;
};

export class HermesSkillsAdapterError extends Error {
  constructor(
    readonly kind: "unavailable" | "authentication" | "timeout" | "invalid_response" | "contract_mismatch" | "dispatch_failed",
    message: string,
    readonly dispatched = false,
    readonly responseReceived = false,
    readonly readEvidence: HermesSkillsReadEvidence | null = null,
  ) {
    super(message);
    this.name = "HermesSkillsAdapterError";
  }
}

export type HermesSkillsReadPolicy = {
  perAttemptTimeoutMs: number;
  totalDeadlineMs: number;
  maxAttempts: 1 | 2;
};

export type HermesSkillsReadPolicies = {
  canonicalInstalled: HermesSkillsReadPolicy;
  agentContract: HermesSkillsReadPolicy;
  exactCandidate: HermesSkillsReadPolicy;
  catalog: HermesSkillsReadPolicy;
};

export const HERMES_SKILLS_READ_POLICIES: HermesSkillsReadPolicies = {
  canonicalInstalled: { perAttemptTimeoutMs: 750, totalDeadlineMs: 1_750, maxAttempts: 2 },
  agentContract: { perAttemptTimeoutMs: 1_500, totalDeadlineMs: 3_250, maxAttempts: 2 },
  exactCandidate: { perAttemptTimeoutMs: 6_000, totalDeadlineMs: 12_500, maxAttempts: 2 },
  catalog: { perAttemptTimeoutMs: 5_000, totalDeadlineMs: 5_500, maxAttempts: 1 },
};

function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

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

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
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

function installedIdentity(profile: string, name: string, provenance: HermesManagedSkill["provenance"], hubIdentifier: string | null): string {
  if (provenance === "hub" && hubIdentifier) return `${profile}:hub:${hubIdentifier}`;
  return `${profile}:${provenance ?? "unknown"}:${name}`;
}

function supportedActions(
  skill: Pick<HermesManagedSkill, "installed" | "enabled" | "provenance" | "hubIdentifier">,
  cliConfigured: boolean,
): HermesSkillAction[] {
  if (!skill.installed) return cliConfigured ? ["install"] : [];
  const actions: HermesSkillAction[] = skill.enabled === false ? ["enable"] : skill.enabled === true ? ["disable"] : [];
  if (skill.provenance === "hub" && skill.hubIdentifier && cliConfigured) actions.push("remove");
  return actions;
}

export function hermesCliChildEnvironment(skipExternalSecretSources = false): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    HOME: homedir(),
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    HERMES_NONINTERACTIVE: "1",
    NO_COLOR: "1",
    TERM: "dumb",
  };
  if (skipExternalSecretSources) environment.HERMES_SKIP_EXTERNAL_SECRET_SOURCES = HERMES_PUBLIC_SKILLS_SKIP_VALUE;
  return environment;
}

function runBoundedProcess(
  executable: string,
  args: readonly string[],
  options: { input?: string; timeoutMs: number; terminationGraceMs: number; skipExternalSecretSources?: boolean },
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, [...args], {
        shell: false,
        windowsHide: true,
        env: hermesCliChildEnvironment(options.skipExternalSecretSources),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      reject(new HermesSkillsAdapterError("dispatch_failed", error instanceof Error ? error.message : "Hermes CLI could not start."));
      return;
    }

    let settled = false;
    let spawned = false;
    let timedOut = false;
    let forcedTermination = false;
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let terminationTimer: NodeJS.Timeout | null = null;
    let hardTimer: NodeJS.Timeout | null = null;

    const clearTimers = () => {
      clearTimeout(operationTimer);
      if (terminationTimer) clearTimeout(terminationTimer);
      if (hardTimer) clearTimeout(hardTimer);
    };
    const closeStreams = () => {
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
    };
    const finish = (result: CliResult) => {
      if (settled) return;
      settled = true;
      clearTimers();
      closeStreams();
      resolve(result);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      closeStreams();
      reject(error);
    };
    const append = (chunk: Buffer | string) => {
      if (settled || outputBytes >= MAX_OUTPUT_BYTES) return;
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const bounded = value.subarray(0, MAX_OUTPUT_BYTES - outputBytes);
      chunks.push(bounded);
      outputBytes += bounded.byteLength;
    };
    const output = () => Buffer.concat(chunks).toString("utf8");

    child.once("spawn", () => { spawned = true; });
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", (error) => {
      fail(new HermesSkillsAdapterError("dispatch_failed", error.message, spawned, false));
    });
    child.once("close", (exitCode) => {
      finish({ exitCode, timedOut, forcedTermination, output: output() });
    });

    if (options.input) child.stdin?.end(options.input);
    else child.stdin?.end();

    const operationTimer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      child.kill("SIGTERM");
      terminationTimer = setTimeout(() => {
        if (settled) return;
        forcedTermination = true;
        child.kill("SIGKILL");
      }, options.terminationGraceMs);
      hardTimer = setTimeout(() => {
        if (settled) return;
        forcedTermination = true;
        child.kill("SIGKILL");
      }, options.terminationGraceMs + HARD_SETTLEMENT_SLACK_MS);
    }, options.timeoutMs);
  });
}

export class FixedHermesSkillsCli implements HermesSkillsCli {
  private readonly executablePath: string | null;
  private readonly approvedStaticIdentities = new Map<string, string>();

  constructor(
    executable = process.env.CABINET_HERMES_CLI_PATH?.trim() || null,
    private readonly defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly terminationGraceMs = DEFAULT_TERMINATION_GRACE_MS,
  ) {
    this.executablePath = executable;
  }

  configured(): boolean {
    return Boolean(this.executablePath);
  }

  private async inspectStatic(): Promise<{ resolved: string; staticIdentity: string }> {
    const configured = this.executablePath;
    if (!configured) throw new HermesSkillsAdapterError("unavailable", "An approved Hermes CLI executable is not configured.");
    if (!path.isAbsolute(configured)) throw new HermesSkillsAdapterError("contract_mismatch", "The approved Hermes CLI executable must be an absolute path.");

    let resolved: string;
    let executableStat;
    let executableBytes: Buffer;
    try {
      resolved = await realpath(configured);
      executableStat = await stat(resolved, { bigint: true });
      await access(resolved, constants.X_OK);
      if (!executableStat.isFile() || executableStat.size > BigInt(MAX_EXECUTABLE_BYTES)) throw new Error("unexpected executable target");
      executableBytes = await readFile(resolved);
    } catch {
      throw new HermesSkillsAdapterError("contract_mismatch", "The approved Hermes CLI executable is missing, non-executable, or unexpected.");
    }

    return {
      resolved,
      staticIdentity: hash(JSON.stringify({
        resolved,
        device: executableStat.dev.toString(),
        inode: executableStat.ino.toString(),
        size: executableStat.size.toString(),
        modifiedNanoseconds: executableStat.mtimeNs.toString(),
        sha256: hash(executableBytes),
      })),
    };
  }

  async inspect(): Promise<HermesCliAuthority> {
    const staticAuthority = await this.inspectStatic();
    const versionResult = await runBoundedProcess(staticAuthority.resolved, ["version", "--json"], {
      timeoutMs: Math.min(Math.max(this.defaultTimeoutMs, 1_000), 3_000),
      terminationGraceMs: this.terminationGraceMs,
    });
    if (versionResult.timedOut || versionResult.exitCode !== 0) {
      throw new HermesSkillsAdapterError("contract_mismatch", "The approved Hermes CLI did not report its audited identity.");
    }
    let machine: Record<string, unknown>;
    try {
      machine = record(JSON.parse(stripAnsi(versionResult.output)));
    } catch {
      throw new HermesSkillsAdapterError("contract_mismatch", "The approved Hermes CLI returned malformed machine identity.");
    }
    const installationRoot = typeof machine.installation_root === "string" ? machine.installation_root : "";
    const entrypoint = typeof machine.entrypoint === "string" ? machine.entrypoint : "";
    const pythonExecutable = typeof machine.python_executable === "string" ? machine.python_executable : "";
    const installationId = typeof machine.installation_id === "string" ? machine.installation_id : "";
    if (
      machine.schema !== HERMES_IDENTITY_SCHEMA
      || machine.schema_version !== HERMES_IDENTITY_SCHEMA_VERSION
      || machine.product !== "Hermes Agent"
      || machine.version !== AUDITED_HERMES_VERSION
      || typeof machine.release_date !== "string"
      || !/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(machine.release_date)
      || machine.source_revision !== AUDITED_HERMES_SOURCE_REVISION
      || machine.install_method !== "git"
      || !path.isAbsolute(installationRoot)
      || !path.isAbsolute(entrypoint)
      || !path.isAbsolute(pythonExecutable)
      || !/^[a-f0-9]{64}$/.test(installationId)
    ) {
      throw new HermesSkillsAdapterError("contract_mismatch", "The approved Hermes CLI is not the audited Hermes Agent 0.19.0 executable.");
    }
    const sortedIdentityCore = JSON.stringify({
      entrypoint,
      install_method: machine.install_method,
      installation_root: installationRoot,
      product: machine.product,
      python_executable: pythonExecutable,
      release_date: machine.release_date,
      schema: machine.schema,
      schema_version: machine.schema_version,
      source_revision: machine.source_revision,
      version: machine.version,
    });
    if (hash(sortedIdentityCore) !== installationId) throw new HermesSkillsAdapterError("contract_mismatch", "The Hermes CLI reported an invalid installation identity.");
    let reportedEntrypoint: string;
    try {
      reportedEntrypoint = await realpath(entrypoint);
    } catch {
      throw new HermesSkillsAdapterError("contract_mismatch", "The Hermes CLI reported an unexpected installation identity.");
    }
    const relativeEntrypoint = path.relative(installationRoot, staticAuthority.resolved);
    if (reportedEntrypoint !== staticAuthority.resolved || relativeEntrypoint === ".." || relativeEntrypoint.startsWith(`..${path.sep}`)) {
      throw new HermesSkillsAdapterError("contract_mismatch", "The Hermes CLI target does not match its audited installation identity.");
    }

    const authority: HermesCliAuthority = {
      version: AUDITED_HERMES_VERSION,
      sourceRevision: AUDITED_HERMES_SOURCE_REVISION,
      schemaVersion: HERMES_IDENTITY_SCHEMA_VERSION,
      installationId,
      opaqueIdentity: hash(JSON.stringify({
        staticIdentity: staticAuthority.staticIdentity,
        machineIdentity: machine,
      })),
    };
    this.approvedStaticIdentities.clear();
    this.approvedStaticIdentities.set(authority.opaqueIdentity, staticAuthority.staticIdentity);
    return authority;
  }

  async run(args: readonly string[], options: { input?: string; timeoutMs?: number; expectedAuthority?: string; skipExternalSecretSources?: boolean } = {}): Promise<CliResult> {
    const expectedStatic = options.expectedAuthority ? this.approvedStaticIdentities.get(options.expectedAuthority) : null;
    const staticAuthority = await this.inspectStatic();
    if (!expectedStatic || staticAuthority.staticIdentity !== expectedStatic) {
      throw new HermesSkillsAdapterError("contract_mismatch", "The audited Hermes CLI identity changed before dispatch.");
    }
    return runBoundedProcess(staticAuthority.resolved, args, {
      input: options.input,
      timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
      terminationGraceMs: this.terminationGraceMs,
      skipExternalSecretSources: options.skipExternalSecretSources,
    });
  }
}

export class HermesSkillsAgentAdapter implements HermesSkillsAdapter {
  constructor(
    private readonly config: HermesReadOnlyServerConfig,
    private readonly fetchImpl: Fetch = fetch,
    private readonly cli: HermesSkillsCli = new FixedHermesSkillsCli(),
    private readonly policies: HermesSkillsReadPolicies = HERMES_SKILLS_READ_POLICIES,
  ) {}

  configuredProfile(): string {
    const profile = safeName(this.config.profile);
    if (!profile) throw new HermesSkillsAdapterError("unavailable", "A safe Hermes profile is not configured.");
    return profile;
  }

  private requireProfile(profile: string): string {
    const configured = this.configuredProfile();
    if (safeName(profile) !== configured) throw new HermesSkillsAdapterError("contract_mismatch", "The Hermes Skills profile does not match the configured profile.");
    return configured;
  }

  private classification(kind: HermesSkillsAdapterError["kind"]): HermesSkillsReadEvidence["finalClassification"] {
    if (kind === "authentication") return "authentication_rejected";
    if (kind === "timeout") return "timeout";
    if (kind === "unavailable") return "transport_unavailable";
    if (kind === "contract_mismatch") return "contract_mismatch";
    return "malformed_response";
  }

  private async readApi<T>(
    pathname: string,
    sourceClass: "Hermes Agent Skills installed-state read" | "Hermes Skills Hub candidate lookup" | "Hermes Agent contract check" | "Hermes Skills catalog discovery",
    policy: HermesSkillsReadPolicy,
    validate: (value: unknown) => T,
  ): Promise<{ value: T; evidence: HermesSkillsReadEvidence }> {
    if (!this.config.apiBaseUrl || !this.config.apiKey || this.config.sourceStates.agent_api !== "ready_to_probe") {
      throw new HermesSkillsAdapterError("unavailable", `${sourceClass} is not configured.`);
    }
    const started = Date.now();
    let lastKind: HermesSkillsAdapterError["kind"] = "unavailable";
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      const elapsed = Date.now() - started;
      const remaining = policy.totalDeadlineMs - elapsed;
      if (remaining <= 0) {
        lastKind = "timeout";
        break;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(policy.perAttemptTimeoutMs, remaining));
      try {
        const response = await this.fetchImpl(`${this.config.apiBaseUrl}${pathname}`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json" },
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          const evidence: HermesSkillsReadEvidence = { attemptCount: attempt as 1 | 2, finalClassification: "authentication_rejected", totalElapsedMs: Date.now() - started };
          throw new HermesSkillsAdapterError("authentication", `${sourceClass} was rejected by Hermes authentication.`, false, false, evidence);
        }
        if (response.status === 408 || response.status === 502 || response.status === 503 || response.status === 504) {
          throw new HermesSkillsAdapterError("unavailable", `${sourceClass} is temporarily unavailable.`, false, true);
        }
        if (!response.ok) {
          const evidence: HermesSkillsReadEvidence = { attemptCount: attempt as 1 | 2, finalClassification: "malformed_response", totalElapsedMs: Date.now() - started };
          throw new HermesSkillsAdapterError("invalid_response", `${sourceClass} returned an unexpected response.`, false, true, evidence);
        }
        let raw: unknown;
        try {
          raw = await response.json();
        } catch {
          const evidence: HermesSkillsReadEvidence = { attemptCount: attempt as 1 | 2, finalClassification: "malformed_response", totalElapsedMs: Date.now() - started };
          throw new HermesSkillsAdapterError("invalid_response", `${sourceClass} returned malformed JSON.`, false, true, evidence);
        }
        let value: T;
        try {
          value = validate(raw);
        } catch (error) {
          if (error instanceof HermesSkillsAdapterError) {
            const evidence: HermesSkillsReadEvidence = { attemptCount: attempt as 1 | 2, finalClassification: this.classification(error.kind), totalElapsedMs: Date.now() - started };
            throw new HermesSkillsAdapterError(error.kind, error.message, false, true, error.readEvidence ?? evidence);
          }
          const evidence: HermesSkillsReadEvidence = { attemptCount: attempt as 1 | 2, finalClassification: "malformed_response", totalElapsedMs: Date.now() - started };
          throw new HermesSkillsAdapterError("invalid_response", `${sourceClass} returned a malformed contract.`, false, true, evidence);
        }
        return {
          value,
          evidence: { attemptCount: attempt as 1 | 2, finalClassification: "success", totalElapsedMs: Date.now() - started },
        };
      } catch (error) {
        if (error instanceof HermesSkillsAdapterError) {
          if (error.kind !== "timeout" && error.kind !== "unavailable") throw error;
          lastKind = error.kind;
        } else {
          const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
          lastKind = timedOut ? "timeout" : "unavailable";
        }
        const retryable = (lastKind === "timeout" || lastKind === "unavailable") && attempt < policy.maxAttempts && Date.now() - started < policy.totalDeadlineMs;
        if (!retryable) {
          const evidence: HermesSkillsReadEvidence = { attemptCount: attempt as 1 | 2, finalClassification: this.classification(lastKind), totalElapsedMs: Date.now() - started };
          throw new HermesSkillsAdapterError(lastKind, lastKind === "timeout" ? `${sourceClass} timed out.` : `${sourceClass} is unavailable.`, false, false, evidence);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    const evidence: HermesSkillsReadEvidence = { attemptCount: policy.maxAttempts, finalClassification: this.classification(lastKind), totalElapsedMs: Date.now() - started };
    throw new HermesSkillsAdapterError(lastKind, `${sourceClass} timed out.`, false, false, evidence);
  }

  private async mutationApi(pathname: string, init: RequestInit): Promise<void> {
    if (!this.config.apiBaseUrl || !this.config.apiKey || this.config.sourceStates.agent_api !== "ready_to_probe") {
      throw new HermesSkillsAdapterError("unavailable", "Hermes Agent Skills mutation is not configured.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.config.apiBaseUrl}${pathname}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json", "Content-Type": "application/json" },
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) throw new HermesSkillsAdapterError("authentication", "Hermes rejected the configured server credential.", true, true);
      if (!response.ok) throw new HermesSkillsAdapterError("invalid_response", "Hermes Agent Skills mutation returned an unexpected response.", true, true);
      await response.json();
    } catch (error) {
      if (error instanceof HermesSkillsAdapterError) throw error;
      const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
      throw new HermesSkillsAdapterError(timedOut ? "timeout" : "unavailable", timedOut ? "Hermes Agent Skills mutation timed out." : "Hermes Agent Skills mutation is unavailable.", true, false);
    } finally {
      clearTimeout(timer);
    }
  }

  private async inspectAgentContract(): Promise<{ identity: string; version: typeof AUDITED_HERMES_VERSION }> {
    const result = await this.readApi<typeof AUDITED_HERMES_VERSION>("/openapi.json", "Hermes Agent contract check", this.policies.agentContract, (raw) => {
      const version = record(record(raw).info).version;
      if (version !== AUDITED_HERMES_VERSION) throw new HermesSkillsAdapterError("contract_mismatch", "Hermes Agent contract check did not report the audited 0.19.0 contract.");
      return AUDITED_HERMES_VERSION;
    });
    return { identity: hash(JSON.stringify({ contract: "agent-openapi", version: result.value })), version: result.value };
  }

  async readCanonicalInstalledState(profile: string): Promise<HermesCanonicalSkillsState> {
    const exactProfile = this.requireProfile(profile);
    const result = await this.readApi(`/api/skills?profile=${encodeURIComponent(exactProfile)}`, "Hermes Agent Skills installed-state read", this.policies.canonicalInstalled, (raw) => {
      if (!Array.isArray(raw)) throw new HermesSkillsAdapterError("invalid_response", "Hermes Agent Skills installed-state read returned a malformed contract.");
      return raw;
    });
    const observedAt = new Date().toISOString();
    const cliConfigured = this.cli.configured();
    const installed = result.value.flatMap((raw): HermesManagedSkill[] => {
        const item = record(raw);
        const name = safeName(item.name);
        if (!name) return [];
        const provenance = item.provenance === "hub" || item.provenance === "bundled" || item.provenance === "agent" ? item.provenance : null;
        const hubIdentifier = provenance === "hub" ? safeIdentifier(item.identifier) ?? safeIdentifier(item.hub_identifier) : null;
        const identity = installedIdentity(exactProfile, name, provenance, hubIdentifier);
        const skill: HermesManagedSkill = {
          identity,
          name,
          category: safeLabel(item.category),
          installed: true,
          enabled: typeof item.enabled === "boolean" ? item.enabled : null,
          version: safeLabel(item.version, 32),
          source: provenance === "hub" ? safeLabel(item.source) ?? (hubIdentifier?.split("/")[0] ?? "Hermes Skills Hub") : provenance,
          provenance,
          hubIdentifier,
          profile: exactProfile,
          updateAvailable: null,
          observedAt,
          supportedActions: [],
        };
        skill.supportedActions = supportedActions(skill, cliConfigured);
        return [skill];
      });
    const unique = uniqueSkills(installed);
    const names = new Map<string, number>();
    for (const skill of installed) names.set(skill.name, (names.get(skill.name) ?? 0) + 1);
    const duplicateNames = [...names.entries()].filter(([, count]) => count > 1).map(([name]) => name).sort();
    const duplicateIdentities = [...new Set([...unique.duplicates, ...installed.filter((skill) => duplicateNames.includes(skill.name)).map((skill) => skill.identity)])];
    for (const skill of unique.items) if (duplicateNames.includes(skill.name)) skill.supportedActions = [];
    return {
      profile: exactProfile,
      observedAt,
      sourceState: unique.items.length ? "success" : "connected_empty",
      summary: unique.items.length ? `Hermes reported ${unique.items.length} installed skill(s).` : "Hermes responded with no installed skills.",
      interface: "Hermes Agent Skills installed-state read",
      installed: unique.items,
      duplicateIdentities,
      duplicateNames,
      evidence: result.evidence,
    };
  }

  private hubMapping(raw: unknown): Map<string, string[]> {
    const installedByIdentifier = record(record(raw).installed);
    const mapping = new Map<string, string[]>();
    for (const [identifierValue, detailValue] of Object.entries(installedByIdentifier)) {
      const identifier = safeIdentifier(identifierValue);
      const name = safeName(record(detailValue).name);
      if (!identifier || !name) continue;
      mapping.set(name, [...(mapping.get(name) ?? []), identifier]);
    }
    return mapping;
  }

  private operations(cliConfigured: boolean): HermesSkillsSnapshot["operations"] {
    return {
      install: { supported: cliConfigured, interface: cliConfigured ? "audited absolute Hermes CLI: skills install <identifier> --yes" : "Unavailable", note: cliConfigured ? "Requires exact Agent, candidate, and CLI authority before dispatch." : "The installed Hermes CLI management contract is not approved." },
      enable: { supported: true, interface: "PUT /api/skills/toggle", note: "Profile-scoped Hermes activation state." },
      disable: { supported: true, interface: "PUT /api/skills/toggle", note: "Profile-scoped Hermes activation state." },
      update: { supported: false, interface: "Audit only", note: "Hermes Agent 0.19.0 does not provide exact structured target-specific update readback." },
      remove: { supported: cliConfigured, interface: cliConfigured ? "audited absolute Hermes CLI: skills uninstall <name>" : "Unavailable", note: cliConfigured ? "Requires exact hub identity and exact 0.19.0 executable identity." : "The installed Hermes CLI management contract is not approved." },
    };
  }

  private async cliManagementAvailable(): Promise<boolean> {
    if (!this.cli.configured()) return false;
    try {
      await this.cli.inspect();
      return true;
    } catch {
      return false;
    }
  }

  async discoverCatalog(query = ""): Promise<HermesSkillsSnapshot> {
    const profile = this.configuredProfile();
    const canonical = await this.readCanonicalInstalledState(profile);
    const normalizedQuery = safeLabel(query, 80) ?? "";
    const profileParam = encodeURIComponent(profile);
    const cliConfigured = await this.cliManagementAvailable();
    let catalogRaw: unknown;
    try {
      const path = normalizedQuery
        ? `/api/skills/hub/search?q=${encodeURIComponent(normalizedQuery)}&source=all&limit=50&profile=${profileParam}`
        : `/api/skills/hub/sources?profile=${profileParam}`;
      catalogRaw = (await this.readApi(path, "Hermes Skills catalog discovery", this.policies.catalog, (raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HermesSkillsAdapterError("invalid_response", "Hermes Skills catalog discovery returned a malformed contract.");
        return raw;
      })).value;
    } catch {
      return {
        fixture: false,
        fixtureLabel: null,
        profile,
        observedAt: canonical.observedAt,
        sourceState: canonical.sourceState,
        summary: `${canonical.summary} Catalog discovery is unavailable; canonical installed state remains available.`,
        interface: "Hermes Agent 0.19.0 authenticated API",
        operations: this.operations(cliConfigured),
        installed: canonical.installed.map((skill) => ({
          ...skill,
          supportedActions: supportedActions(skill, cliConfigured),
        })),
        available: [],
        duplicateIdentities: canonical.duplicateIdentities,
      };
    }
    const observedAt = new Date().toISOString();
    const hubIdentifiersByName = this.hubMapping(catalogRaw);
    const ambiguous = new Set<string>();
    const installed = canonical.installed.map((skill) => {
      if (skill.provenance !== "hub") {
        if (canonical.duplicateNames.includes(skill.name)) ambiguous.add(skill.identity);
        return { ...skill, observedAt };
      }
      const identifiers = [...new Set(hubIdentifiersByName.get(skill.name) ?? [])];
      if (identifiers.length !== 1) {
        ambiguous.add(skill.identity);
        return { ...skill, observedAt, supportedActions: [] };
      }
      const enriched = { ...skill, identity: installedIdentity(profile, skill.name, "hub", identifiers[0]), hubIdentifier: identifiers[0], source: identifiers[0].split("/")[0] ?? skill.source, observedAt, supportedActions: supportedActions({ ...skill, hubIdentifier: identifiers[0] }, cliConfigured) };
      if (canonical.duplicateNames.includes(skill.name)) {
        ambiguous.add(enriched.identity);
        enriched.supportedActions = [];
      }
      return enriched;
    });
    const installedHubIdentifiers = new Set([...hubIdentifiersByName.values()].flat());
    const rawAvailable = normalizedQuery ? array(record(catalogRaw).results) : array(record(catalogRaw).featured);
      const available = rawAvailable.flatMap((raw): HermesManagedSkill[] => {
        const item = record(raw);
        const name = safeName(item.name);
        const identifier = safeIdentifier(item.identifier);
        if (!name || !identifier || installedHubIdentifiers.has(identifier)) return [];
        const skill: HermesManagedSkill = {
          identity: identifier,
          name,
          category: null,
          installed: false,
          enabled: null,
          version: null,
          source: safeLabel(item.source) ?? identifier.split("/")[0] ?? "Hermes Skills Hub",
          provenance: "hub",
          hubIdentifier: identifier,
          profile,
          updateAvailable: null,
          observedAt,
          supportedActions: cliConfigured ? ["install"] : [],
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
        operations: this.operations(cliConfigured),
        installed: installedUnique.items,
        available: availableUnique.items,
        duplicateIdentities: [...new Set([...installedUnique.duplicates, ...availableUnique.duplicates, ...ambiguous])],
      };
  }

  private prerequisiteClassification(skillMd: unknown): HermesExactSkillCandidate["prerequisiteClassification"] {
    if (typeof skillMd !== "string") return "declared";
    const frontmatter = skillMd.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/)?.[1] ?? "";
    return /^(?:requires|prerequisites|credentials|accounts|network|environment|commands)\s*:\s*\S+/im.test(frontmatter) ? "declared" : "none_declared";
  }

  async inspectExactCandidate(identifier: string, profile: string): Promise<HermesExactSkillCandidate> {
    const exactProfile = this.requireProfile(profile);
    const exactIdentifier = safeIdentifier(identifier);
    if (!exactIdentifier || exactIdentifier !== identifier.toLowerCase()) throw new HermesSkillsAdapterError("contract_mismatch", "Hermes Skills Hub candidate lookup requires an exact safe identifier.");
    const suffix = `identifier=${encodeURIComponent(exactIdentifier)}&profile=${encodeURIComponent(exactProfile)}`;
    const operationStarted = Date.now();
    const boundedPolicy = (): HermesSkillsReadPolicy => ({
      ...this.policies.exactCandidate,
      totalDeadlineMs: Math.max(1, this.policies.exactCandidate.totalDeadlineMs - (Date.now() - operationStarted)),
    });
    const preview = await this.readApi(`/api/skills/hub/preview?${suffix}`, "Hermes Skills Hub candidate lookup", boundedPolicy(), (raw) => {
      const value = record(raw);
      if (safeIdentifier(value.identifier) !== exactIdentifier || !safeName(value.name) || !safeLabel(value.source) || !safeLabel(value.trust_level)) {
        throw new HermesSkillsAdapterError("contract_mismatch", "Hermes Skills Hub candidate lookup changed the exact target binding.");
      }
      return value;
    });
    const scan = await this.readApi(`/api/skills/hub/scan?${suffix}`, "Hermes Skills Hub candidate lookup", boundedPolicy(), (raw) => {
      const value = record(raw);
      if (safeIdentifier(value.identifier) !== exactIdentifier || !safeName(value.name) || !safeLabel(value.source) || !safeLabel(value.verdict) || !Array.isArray(value.findings)) {
        throw new HermesSkillsAdapterError("contract_mismatch", "Hermes Skills Hub candidate scan changed the exact target binding.");
      }
      return value;
    });
    const name = safeName(preview.value.name)!;
    if (safeName(scan.value.name) !== name) throw new HermesSkillsAdapterError("contract_mismatch", "Hermes Skills Hub candidate metadata and scan disagree.");
    const source = safeLabel(preview.value.source)!;
    const trust = safeLabel(preview.value.trust_level)!;
    const scanVerdict = safeLabel(scan.value.verdict)!;
    const installPolicy = scan.value.policy === "allow" || scan.value.policy === "ask" || scan.value.policy === "block" ? scan.value.policy : "block";
    const findingCount = array(scan.value.findings).length;
    const prerequisiteClassification = this.prerequisiteClassification(preview.value.skill_md);
    const fingerprint = hash(JSON.stringify({ exactIdentifier, name, source, trust, scanVerdict, installPolicy, findingCount, prerequisiteClassification }));
    return {
      identifier: exactIdentifier,
      name,
      source,
      trust,
      scanVerdict,
      installPolicy,
      findingCount,
      prerequisiteClassification,
      fingerprint,
      observedAt: new Date().toISOString(),
      evidence: { preview: preview.evidence, scan: scan.evidence },
    };
  }

  async inspectExecutionAuthority(action: HermesSkillAction, profile: string): Promise<HermesSkillExecutionAuthority> {
    const exactProfile = this.requireProfile(profile);
    if (action === "update") throw new HermesSkillsAdapterError("contract_mismatch", "Target-specific update verification remains audit-only for Hermes Agent 0.19.0.");
    const contract = await this.inspectAgentContract();
    const cliAuthority = action === "install" || action === "remove" ? await this.cli.inspect() : null;
    const opaqueIdentity = hash(JSON.stringify({ contract: `skills-${action}`, agentContract: contract.identity, cliAuthority: cliAuthority?.opaqueIdentity ?? null, profile: exactProfile }));
    return { action, profile: exactProfile, opaqueIdentity, agentContractIdentity: contract.identity, cliAuthorityIdentity: cliAuthority?.opaqueIdentity ?? null, inspectedAt: new Date().toISOString() };
  }

  async execute(operation: HermesSkillOperation, authority: HermesSkillExecutionAuthority): Promise<{ responseReceived: boolean }> {
    if (operation.profile !== this.configuredProfile() || !safeName(operation.targetName) || authority.action !== operation.action || authority.profile !== operation.profile) {
      throw new HermesSkillsAdapterError("dispatch_failed", "The Hermes skill target is invalid.");
    }
    if (operation.action === "enable" || operation.action === "disable") {
      await this.mutationApi(`/api/skills/toggle?profile=${encodeURIComponent(operation.profile)}`, {
        method: "PUT",
        body: JSON.stringify({ name: operation.targetName, enabled: operation.action === "enable", profile: operation.profile }),
      });
      return { responseReceived: true };
    }
    if (operation.action === "update") throw new HermesSkillsAdapterError("contract_mismatch", "Target-specific update remains audit-only.");

    if (!authority.cliAuthorityIdentity) throw new HermesSkillsAdapterError("contract_mismatch", "The audited Hermes CLI authority is unavailable.");
    const args = ["-p", operation.profile, "skills"];
    if (operation.action === "install") {
      const identifier = safeIdentifier(operation.targetIdentity);
      if (!identifier) throw new HermesSkillsAdapterError("dispatch_failed", "The Hermes catalog identity is invalid.");
      args.push("install", identifier, "--yes");
    } else if (operation.action === "remove") {
      if (!safeIdentifier(operation.targetIdentity.split(":hub:")[1] ?? "")) throw new HermesSkillsAdapterError("dispatch_failed", "The exact Hermes hub identity is unavailable.");
      args.push("uninstall", operation.targetName);
    } else {
      throw new HermesSkillsAdapterError("dispatch_failed", "This Hermes skill operation is unsupported.");
    }
    const exactHubIdentifier = operation.action === "install"
      ? operation.targetIdentity
      : operation.targetIdentity.split(":hub:")[1] ?? "";
    if (operation.skipExternalSecretSources && !exactHubIdentifier.startsWith("official/")) {
      throw new HermesSkillsAdapterError("contract_mismatch", "External secret-source isolation is unavailable for this skill source.");
    }
    const result = await this.cli.run(args, {
      input: operation.action === "remove" ? "yes\n" : undefined,
      expectedAuthority: authority.cliAuthorityIdentity,
      skipExternalSecretSources: operation.skipExternalSecretSources,
    });
    if (result.timedOut || result.forcedTermination) throw new HermesSkillsAdapterError("timeout", "Hermes did not report a final operation result before timeout.", true, false);
    if (result.exitCode !== 0) throw new HermesSkillsAdapterError("invalid_response", "Hermes reported a non-successful operation result.", true, true);
    return { responseReceived: true };
  }
}
