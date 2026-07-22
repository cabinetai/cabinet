import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { sanitizeHermesText } from "./control-center-sanitizer";
import type { HermesSkillsServerConfig } from "./server-config";
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

const AUDITED_HERMES_VERSION = "0.19.0";
export const AUDITED_HERMES_SOURCE_REVISION = "78a803a013547794a295d674982f1fe0515f5713";
const HERMES_IDENTITY_SCHEMA = "hermes.cli.identity";
const HERMES_IDENTITY_SCHEMA_VERSION = 1;
const HERMES_SKILLS_SCHEMA_VERSION = 2;
const OFFICIAL_PUBLIC_AUTHORITY = "official_public";
const HERMES_PUBLIC_SKILLS_SKIP_VALUE = "official-public-skills-v1";
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]{0,95}$/;
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
  exactCandidate: HermesSkillsReadPolicy;
  catalog: HermesSkillsReadPolicy;
};

export const HERMES_SKILLS_READ_POLICIES: HermesSkillsReadPolicies = {
  canonicalInstalled: { perAttemptTimeoutMs: 750, totalDeadlineMs: 1_750, maxAttempts: 2 },
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

function safeInstallPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return candidate && candidate.split("/").every((part) => SAFE_NAME.test(part))
    ? candidate
    : null;
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

function installedIdentity(profile: string, name: string, provenance: HermesManagedSkill["provenance"], hubIdentifier: string | null): string {
  if (provenance === "hub" && hubIdentifier) return `${profile}:hub:${hubIdentifier}`;
  return `${profile}:${provenance ?? "unknown"}:${name}`;
}

function supportedActions(
  skill: Pick<HermesManagedSkill, "installed" | "provenance" | "hubIdentifier" | "source" | "nativeTrust" | "authorityClass" | "official" | "public" | "localFulfillment">,
  cliConfigured: boolean,
): HermesSkillAction[] {
  if (!skill.installed) return cliConfigured ? ["install"] : [];
  return cliConfigured
    && skill.provenance === "hub"
    && Boolean(skill.hubIdentifier?.startsWith("official/"))
    && skill.source === "official"
    && skill.nativeTrust === "builtin"
    && skill.authorityClass === OFFICIAL_PUBLIC_AUTHORITY
    && skill.official
    && skill.public
    && skill.localFulfillment
    ? ["remove"]
    : [];
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
        configured,
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
      skipExternalSecretSources: true,
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

export class HermesSkillsCliAdapter implements HermesSkillsAdapter {
  constructor(
    private readonly config: HermesSkillsServerConfig,
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

  private exactKeys(value: Record<string, unknown>, keys: readonly string[], contract: string): void {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      throw new HermesSkillsAdapterError("contract_mismatch", `${contract} returned unexpected fields.`);
    }
  }

  private async readCliMachine<T>(
    profile: string,
    args: readonly string[],
    policy: HermesSkillsReadPolicy,
    validate: (value: unknown) => T,
    approvedAuthority?: HermesCliAuthority,
  ): Promise<{ value: T; evidence: HermesSkillsReadEvidence; authority: HermesCliAuthority }> {
    if (!this.cli.configured()) throw new HermesSkillsAdapterError("unavailable", "The canonical Hermes CLI is not configured.");
    const started = Date.now();
    let lastKind: HermesSkillsAdapterError["kind"] = "unavailable";
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      const remaining = policy.totalDeadlineMs - (Date.now() - started);
      if (remaining <= 0) { lastKind = "timeout"; break; }
      try {
        const authority = approvedAuthority ?? await this.cli.inspect();
        const result = await this.cli.run(["-p", profile, "skills", ...args], {
          expectedAuthority: authority.opaqueIdentity,
          skipExternalSecretSources: true,
          timeoutMs: Math.min(policy.perAttemptTimeoutMs, remaining),
        });
        if (result.timedOut || result.forcedTermination) throw new HermesSkillsAdapterError("timeout", "Canonical Hermes CLI JSON timed out.");
        if (result.exitCode !== 0) throw new HermesSkillsAdapterError("invalid_response", "Canonical Hermes CLI JSON returned a non-successful status.");
        if (stripAnsi(result.output) !== result.output) throw new HermesSkillsAdapterError("contract_mismatch", "Canonical Hermes CLI JSON contained terminal rendering.");
        const output = result.output.trim();
        if (!output || output.includes("\n")) throw new HermesSkillsAdapterError("invalid_response", "Canonical Hermes CLI JSON was not exactly one JSON object.");
        let raw: unknown;
        try { raw = JSON.parse(output); } catch { throw new HermesSkillsAdapterError("invalid_response", "Canonical Hermes CLI returned malformed JSON."); }
        const value = validate(raw);
        return {
          value,
          authority,
          evidence: { attemptCount: attempt as 1 | 2, finalClassification: "success", totalElapsedMs: Date.now() - started },
        };
      } catch (error) {
        lastKind = error instanceof HermesSkillsAdapterError ? error.kind : "unavailable";
        const retryable = (lastKind === "timeout" || lastKind === "unavailable") && attempt < policy.maxAttempts && Date.now() - started < policy.totalDeadlineMs;
        if (!retryable) {
          const evidence: HermesSkillsReadEvidence = { attemptCount: attempt as 1 | 2, finalClassification: this.classification(lastKind), totalElapsedMs: Date.now() - started };
          if (error instanceof HermesSkillsAdapterError) throw new HermesSkillsAdapterError(error.kind, error.message, false, false, evidence);
          throw new HermesSkillsAdapterError(lastKind, "Canonical Hermes CLI JSON is unavailable.", false, false, evidence);
        }
      }
    }
    const evidence: HermesSkillsReadEvidence = { attemptCount: policy.maxAttempts, finalClassification: this.classification(lastKind), totalElapsedMs: Date.now() - started };
    throw new HermesSkillsAdapterError(lastKind, "Canonical Hermes CLI JSON timed out.", false, false, evidence);
  }

  async readCanonicalInstalledState(profile: string): Promise<HermesCanonicalSkillsState> {
    const exactProfile = this.requireProfile(profile);
    const result = await this.readCliMachine(exactProfile, ["list", "--json"], this.policies.canonicalInstalled, (raw) => {
      const value = record(raw);
      this.exactKeys(value, ["ambiguity_count", "contract", "exact_match_count", "matches", "profile", "same_name_collision_count", "schema_version"], "Canonical Hermes CLI installed state");
      if (value.contract !== "hermes.skills.installed-state" || value.schema_version !== HERMES_SKILLS_SCHEMA_VERSION || value.profile !== exactProfile) {
        throw new HermesSkillsAdapterError("contract_mismatch", "Canonical Hermes CLI installed state changed contract or profile.");
      }
      if (
        !Number.isSafeInteger(value.ambiguity_count)
        || value.ambiguity_count !== 0
        || !Number.isSafeInteger(value.exact_match_count)
        || !Number.isSafeInteger(value.same_name_collision_count)
        || value.same_name_collision_count !== 0
        || !Array.isArray(value.matches)
      ) {
        throw new HermesSkillsAdapterError("invalid_response", "Canonical Hermes CLI installed state returned malformed counts.");
      }
      return value;
    });
    const observedAt = new Date().toISOString();
    const cliConfigured = this.cli.configured();
    const installed = array(result.value.matches).map((raw): HermesManagedSkill => {
        const item = record(raw);
        this.exactKeys(item, ["authority_class", "enabled", "identifier", "install_path", "installed", "local_fulfillment", "name", "native_trust", "official", "origin", "public", "source"], "Canonical Hermes CLI skill match");
        const name = safeName(item.name);
        const origin = item.origin;
        const source = safeLabel(item.source);
        const nativeTrust = safeLabel(item.native_trust);
        const authorityClass = item.authority_class === OFFICIAL_PUBLIC_AUTHORITY ? "official_public" : item.authority_class === "unapproved" ? "unapproved" : null;
        const provenance = origin === "hub" ? "hub" : origin === "builtin" ? "bundled" : origin === "local" ? "agent" : null;
        const hubIdentifier = provenance === "hub" ? safeIdentifier(item.identifier) : null;
        const installPath = provenance === "agent" ? item.install_path === null ? null : safeInstallPath(item.install_path) : safeInstallPath(item.install_path);
        if (
          !name
          || !provenance
          || !source
          || !nativeTrust
          || !authorityClass
          || item.installed !== true
          || typeof item.enabled !== "boolean"
          || typeof item.official !== "boolean"
          || typeof item.public !== "boolean"
          || typeof item.local_fulfillment !== "boolean"
          || (provenance === "hub" && (!hubIdentifier || !installPath))
          || (provenance !== "hub" && item.identifier !== null)
          || (authorityClass === "official_public" && (
            provenance !== "hub"
            || !hubIdentifier?.startsWith("official/")
            || source !== "official"
            || nativeTrust !== "builtin"
            || item.official !== true
            || item.public !== true
            || item.local_fulfillment !== true
          ))
          || (authorityClass === "unapproved" && (item.official !== false || item.public !== false))
        ) {
          throw new HermesSkillsAdapterError("contract_mismatch", "Canonical Hermes CLI skill match was malformed or ambiguous.");
        }
        const identity = installedIdentity(exactProfile, name, provenance, hubIdentifier);
        const skill: HermesManagedSkill = {
          identity,
          name,
          category: safeLabel(item.category),
          installed: true,
          enabled: typeof item.enabled === "boolean" ? item.enabled : null,
          version: safeLabel(item.version, 32),
          source,
          nativeTrust,
          authorityClass,
          official: item.official,
          public: item.public,
          localFulfillment: item.local_fulfillment,
          provenance,
          hubIdentifier,
          profile: exactProfile,
          updateAvailable: null,
          observedAt,
          supportedActions: [],
        };
        skill.supportedActions = supportedActions(skill, cliConfigured);
        return skill;
      });
    const hubCount = installed.filter((skill) => skill.provenance === "hub").length;
    if (result.value.exact_match_count !== hubCount) throw new HermesSkillsAdapterError("contract_mismatch", "Canonical Hermes CLI installed count disagreed with its Hub matches.");
    const identityCounts = new Map<string, number>();
    const names = new Map<string, number>();
    for (const skill of installed) {
      identityCounts.set(skill.identity, (identityCounts.get(skill.identity) ?? 0) + 1);
      names.set(skill.name, (names.get(skill.name) ?? 0) + 1);
    }
    if ([...identityCounts.values(), ...names.values()].some((count) => count > 1)) {
      throw new HermesSkillsAdapterError("contract_mismatch", "Canonical Hermes CLI returned duplicate identities after claiming no ambiguity.");
    }
    return {
      profile: exactProfile,
      observedAt,
      sourceState: installed.length ? "success" : "connected_empty",
      summary: installed.length ? `Hermes reported ${installed.length} installed skill(s).` : "Hermes responded with no installed skills.",
      interface: "Canonical Hermes CLI installed-state JSON",
      installed,
      duplicateIdentities: [],
      duplicateNames: [],
      evidence: result.evidence,
    };
  }

  private operations(cliConfigured: boolean): HermesSkillsSnapshot["operations"] {
    return {
      install: { supported: cliConfigured, interface: cliConfigured ? "audited absolute Hermes CLI: skills install <identifier> --yes" : "Unavailable", note: cliConfigured ? "Requires exact candidate, canonical state, and CLI authority before dispatch." : "The installed Hermes CLI management contract is not approved." },
      enable: { supported: false, interface: "Unsupported", note: "Hermes 0.19.0 exposes only an interactive config flow, not a fixed durable mutation." },
      disable: { supported: false, interface: "Unsupported", note: "Hermes 0.19.0 exposes only an interactive config flow, not a fixed durable mutation." },
      update: { supported: false, interface: "Audit only", note: "Hermes Agent 0.19.0 does not provide exact structured target-specific update readback." },
      remove: { supported: cliConfigured, interface: cliConfigured ? "audited absolute Hermes CLI: skills uninstall <official-identifier> --yes" : "Unavailable", note: cliConfigured ? "Requires one exact installed official Hub identity with official_public authority." : "The installed Hermes CLI management contract is not approved." },
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
    const cliConfigured = await this.cliManagementAvailable();
    let catalogRaw: unknown[];
    try {
      catalogRaw = (await this.readCliMachine(profile, ["catalog", "--json"], this.policies.catalog, (raw) => {
        const envelope = record(raw);
        this.exactKeys(envelope, ["contract", "entries", "entry_count", "profile", "schema_version"], "Hermes official Skills catalog");
        if (
          envelope.contract !== "hermes.skills.catalog"
          || envelope.schema_version !== HERMES_SKILLS_SCHEMA_VERSION
          || envelope.profile !== profile
          || !Array.isArray(envelope.entries)
          || !Number.isSafeInteger(envelope.entry_count)
          || envelope.entry_count !== envelope.entries.length
          || envelope.entry_count > 256
        ) throw new HermesSkillsAdapterError("invalid_response", "Hermes official Skills catalog returned a malformed contract.");
        return envelope.entries;
      })).value;
    } catch (error) {
      const catalogState: HermesSkillsSnapshot["sourceState"] = error instanceof HermesSkillsAdapterError
        ? error.kind === "timeout" ? "timeout"
          : error.kind === "unavailable" ? "unavailable"
            : error.kind === "contract_mismatch" || error.kind === "invalid_response" ? "malformed"
              : "failure"
        : "failure";
      return {
        fixture: false,
        fixtureLabel: null,
        profile,
        observedAt: canonical.observedAt,
        sourceState: catalogState,
        summary: `${canonical.summary} Catalog discovery is unavailable; canonical installed state remains available.`,
        interface: "Approved Hermes CLI catalog + canonical Skills JSON",
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
    const installed = canonical.installed.map((skill) => ({ ...skill, observedAt, supportedActions: supportedActions(skill, cliConfigured) }));
    const installedHubIdentifiers = new Set(installed.flatMap((skill) => skill.hubIdentifier ? [skill.hubIdentifier] : []));
    const catalogItems = catalogRaw.map((raw): HermesManagedSkill => {
        const item = record(raw);
        this.exactKeys(item, ["authority_class", "category", "identifier", "local_fulfillment", "name", "native_trust", "official", "public", "source", "supported_actions"], "Hermes official Skills catalog entry");
        const name = safeName(item.name);
        const identifier = safeIdentifier(item.identifier);
        const category = safeName(item.category);
        if (
          !name
          || !identifier
          || !identifier.startsWith("official/")
          || item.source !== "official"
          || item.native_trust !== "builtin"
          || item.authority_class !== OFFICIAL_PUBLIC_AUTHORITY
          || item.official !== true
          || item.public !== true
          || item.local_fulfillment !== true
          || JSON.stringify(item.supported_actions) !== JSON.stringify(["install"])
          || !category
        ) throw new HermesSkillsAdapterError("contract_mismatch", "Hermes official Skills catalog entry was malformed.");
        const skill: HermesManagedSkill = {
          identity: identifier,
          name,
          category,
          installed: false,
          enabled: null,
          version: null,
          source: "official",
          nativeTrust: "builtin",
          authorityClass: "official_public",
          official: true,
          public: true,
          localFulfillment: true,
          provenance: "hub",
          hubIdentifier: identifier,
          profile,
          updateAvailable: null,
          observedAt,
          supportedActions: cliConfigured ? ["install"] : [],
        };
        return skill;
      });
    const catalogIdentities = new Set<string>();
    const catalogNames = new Set<string>();
    for (const skill of catalogItems) {
      if (catalogIdentities.has(skill.identity) || catalogNames.has(skill.name)) {
        throw new HermesSkillsAdapterError("contract_mismatch", "Hermes official Skills catalog returned an ambiguous identity.");
      }
      catalogIdentities.add(skill.identity);
      catalogNames.add(skill.name);
    }
    const available = catalogItems.filter((skill) => !installedHubIdentifiers.has(skill.hubIdentifier!) && (!normalizedQuery || skill.name.includes(normalizedQuery.toLowerCase()) || skill.hubIdentifier!.includes(normalizedQuery.toLowerCase())));
    const total = installed.length + available.length;
    return {
        fixture: false,
        fixtureLabel: null,
        profile,
        observedAt,
        sourceState: total ? "success" : "connected_empty",
        summary: total ? `Hermes reported ${installed.length} installed skill(s) and ${available.length} catalog result(s).` : "Hermes responded with an empty skills catalog.",
        interface: "Approved Hermes CLI catalog + canonical Skills JSON",
        operations: this.operations(cliConfigured),
        installed,
        available,
        duplicateIdentities: [],
      };
  }

  async inspectExactCandidate(identifier: string, profile: string): Promise<HermesExactSkillCandidate> {
    const exactProfile = this.requireProfile(profile);
    const exactIdentifier = safeIdentifier(identifier);
    if (!exactIdentifier || exactIdentifier !== identifier.toLowerCase()) throw new HermesSkillsAdapterError("contract_mismatch", "Hermes Skills Hub candidate lookup requires an exact safe identifier.");
    const authority = await this.cli.inspect();
    const inspect = await this.readCliMachine(exactProfile, ["inspect", exactIdentifier, "--json"], this.policies.exactCandidate, (raw) => {
      const value = record(raw);
      this.exactKeys(value, ["authority_class", "contract", "identifier", "local_fulfillment", "name", "native_trust", "official", "prerequisite_classes", "profile", "public", "schema_version", "source"], "Hermes CLI candidate inspect");
      return value;
    }, authority);
    const scan = await this.readCliMachine(exactProfile, ["audit", exactIdentifier, "--json"], this.policies.exactCandidate, (raw) => {
      const value = record(raw);
      this.exactKeys(value, ["authority_class", "contract", "finding_count", "identifier", "local_fulfillment", "name", "native_trust", "official", "prerequisite_classes", "profile", "public", "schema_version", "source", "verdict"], "Hermes CLI candidate audit");
      return value;
    }, authority);
    const name = safeName(inspect.value.name);
    const source = safeLabel(inspect.value.source);
    const nativeTrust = safeLabel(inspect.value.native_trust);
    const scanVerdict = safeLabel(scan.value.verdict)!;
    const findingCount = Number.isSafeInteger(scan.value.finding_count) ? Number(scan.value.finding_count) : -1;
    const inspectPrerequisitesRaw = array(inspect.value.prerequisite_classes);
    const auditPrerequisitesRaw = array(scan.value.prerequisite_classes);
    const prerequisiteClasses = inspectPrerequisitesRaw.map((value) => safeName(value)).filter((value): value is string => Boolean(value));
    const auditPrerequisites = auditPrerequisitesRaw.map((value) => safeName(value)).filter((value): value is string => Boolean(value));
    const shared = [inspect.value, scan.value].every((value) => value.schema_version === HERMES_SKILLS_SCHEMA_VERSION && value.profile === exactProfile && value.identifier === exactIdentifier && value.name === name && value.source === "official" && value.native_trust === "builtin" && value.authority_class === OFFICIAL_PUBLIC_AUTHORITY && value.official === true && value.public === true && value.local_fulfillment === true);
    const allowedPrerequisites = new Set(["account", "command", "credential", "environment", "network", "platform"]);
    const prerequisiteShapeValid = prerequisiteClasses.length === inspectPrerequisitesRaw.length
      && auditPrerequisites.length === auditPrerequisitesRaw.length
      && new Set(prerequisiteClasses).size === prerequisiteClasses.length
      && prerequisiteClasses.every((value) => allowedPrerequisites.has(value))
      && JSON.stringify([...prerequisiteClasses].sort()) === JSON.stringify(prerequisiteClasses);
    if (!shared || !name || !source || !nativeTrust || inspect.value.contract !== "hermes.skills.candidate" || scan.value.contract !== "hermes.skills.audit" || JSON.stringify(prerequisiteClasses) !== JSON.stringify(auditPrerequisites) || !prerequisiteShapeValid || findingCount < 0 || !["safe", "caution", "dangerous"].includes(scanVerdict)) {
      throw new HermesSkillsAdapterError("contract_mismatch", "Hermes CLI candidate inspect and audit disagree or are malformed.");
    }
    const sensitivePrerequisites = new Set(["account", "command", "credential", "environment", "network"]);
    const prerequisiteClassification = prerequisiteClasses.some((value) => sensitivePrerequisites.has(value)) ? "declared" : "none_declared";
    const installPolicy = scanVerdict === "safe" && findingCount === 0 ? "allow" : "block";
    const fingerprint = hash(JSON.stringify({ exactIdentifier, name, source, nativeTrust, authorityClass: OFFICIAL_PUBLIC_AUTHORITY, scanVerdict, installPolicy, findingCount, prerequisiteClassification, prerequisiteClasses }));
    return {
      identifier: exactIdentifier,
      name,
      source,
      nativeTrust,
      authorityClass: "official_public",
      official: true,
      public: true,
      localFulfillment: true,
      scanVerdict,
      installPolicy,
      findingCount,
      prerequisiteClassification,
      prerequisiteClasses,
      fingerprint,
      observedAt: new Date().toISOString(),
      evidence: { preview: inspect.evidence, scan: scan.evidence },
    };
  }

  async inspectExecutionAuthority(action: HermesSkillAction, profile: string): Promise<HermesSkillExecutionAuthority> {
    const exactProfile = this.requireProfile(profile);
    if (action !== "install" && action !== "remove") throw new HermesSkillsAdapterError("contract_mismatch", "Only governed install and removal have fixed native Hermes CLI mutations; update remains audit-only.");
    const cliAuthority = await this.cli.inspect();
    const opaqueIdentity = hash(JSON.stringify({ contract: `skills-${action}`, cliAuthority: cliAuthority.opaqueIdentity, profile: exactProfile }));
    return { action, profile: exactProfile, opaqueIdentity, cliAuthorityIdentity: cliAuthority.opaqueIdentity, inspectedAt: new Date().toISOString() };
  }

  async execute(operation: HermesSkillOperation, authority: HermesSkillExecutionAuthority): Promise<{ responseReceived: boolean }> {
    if (operation.profile !== this.configuredProfile() || !safeName(operation.targetName) || authority.action !== operation.action || authority.profile !== operation.profile) {
      throw new HermesSkillsAdapterError("dispatch_failed", "The Hermes skill target is invalid.");
    }
    if (operation.action !== "install" && operation.action !== "remove") throw new HermesSkillsAdapterError("contract_mismatch", "This Hermes skill action has no fixed native mutation contract.");

    if (!authority.cliAuthorityIdentity) throw new HermesSkillsAdapterError("contract_mismatch", "The audited Hermes CLI authority is unavailable.");
    const args = ["-p", operation.profile, "skills"];
    if (operation.action === "install") {
      const identifier = safeIdentifier(operation.targetIdentity);
      if (!identifier?.startsWith("official/") || !operation.skipExternalSecretSources) throw new HermesSkillsAdapterError("dispatch_failed", "The official Hermes catalog identity is invalid.");
      args.push("install", identifier, "--yes");
    } else if (operation.action === "remove") {
      const identifier = safeIdentifier(operation.targetIdentity.split(":hub:")[1] ?? "");
      if (!identifier?.startsWith("official/") || !operation.skipExternalSecretSources) throw new HermesSkillsAdapterError("dispatch_failed", "The exact approved official Hermes Hub identity is unavailable.");
      args.push("uninstall", identifier, "--yes");
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
      expectedAuthority: authority.cliAuthorityIdentity,
      skipExternalSecretSources: operation.skipExternalSecretSources,
    });
    if (result.timedOut || result.forcedTermination) throw new HermesSkillsAdapterError("timeout", "Hermes did not report a final operation result before timeout.", true, false);
    if (result.exitCode !== 0) throw new HermesSkillsAdapterError("invalid_response", "Hermes reported a non-successful operation result.", true, true);
    return { responseReceived: true };
  }
}
