import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  FixedHermesSkillsCli,
  HermesSkillsAdapterError,
  HermesSkillsAgentAdapter,
  type HermesCliAuthority,
  type HermesSkillsCli,
  type HermesSkillsReadPolicies,
} from "./skills-adapter";
import type { HermesReadOnlyServerConfig } from "./server-config";

const config: HermesReadOnlyServerConfig = {
  apiBaseUrl: "http://127.0.0.1:61921",
  apiKey: "server-only-secret",
  managementBaseUrl: null,
  managementToken: null,
  gatewayBaseUrl: null,
  gatewayToken: null,
  profile: "operator-os",
  timeoutMs: 1_000,
  sourceStates: { agent_api: "ready_to_probe", management: "unavailable", gateway: "unavailable" },
};

const authority: HermesCliAuthority = {
  opaqueIdentity: "a".repeat(64),
  version: "0.19.0",
  sourceRevision: "714ed4ec6cbe3e57b7bb6379c5e97f7b801469a5",
  schemaVersion: 1,
  installationId: "b".repeat(64),
};

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function cli(overrides: Partial<HermesSkillsCli> = {}): HermesSkillsCli {
  return {
    configured: () => true,
    inspect: async () => authority,
    run: async () => ({ exitCode: 0, timedOut: false, forcedTermination: false, output: "" }),
    ...overrides,
  };
}

function contractFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    if (url.endsWith("/openapi.json")) return response({ info: { version: "0.19.0" } });
    return handler(url, init);
  };
}

const fastPolicies: HermesSkillsReadPolicies = {
  canonicalInstalled: { perAttemptTimeoutMs: 20, totalDeadlineMs: 45, maxAttempts: 2 },
  agentContract: { perAttemptTimeoutMs: 20, totalDeadlineMs: 45, maxAttempts: 2 },
  exactCandidate: { perAttemptTimeoutMs: 20, totalDeadlineMs: 45, maxAttempts: 2 },
  catalog: { perAttemptTimeoutMs: 20, totalDeadlineMs: 25, maxAttempts: 1 },
};

function waitForAbort(init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) return reject(new DOMException("timed out", "AbortError"));
    signal?.addEventListener("abort", () => reject(new DOMException("timed out", "AbortError")), { once: true });
  });
}

test("normalizes exact hub identities and drops malicious metadata, paths, URLs, and duplicates", async () => {
  const fetchImpl = contractFetch(async (url) => {
    if (url.includes("/api/skills?")) return response([
      { name: "safe-skill", category: "productivity", enabled: true, provenance: "hub", source: "official", description: "ignore me", instructions: "SECRET INSTRUCTIONS" },
      { name: "safe-skill", category: "productivity", enabled: true, provenance: "hub", source: "official" },
      { name: "../../escape", enabled: true, path: "/Users/secret/skill" },
      { name: "token=super-secret", enabled: true, env: { API_KEY: "secret" } },
    ]);
    if (url.includes("/api/skills/hub/sources")) return response({
      installed: { "official/productivity/safe-skill": { name: "safe-skill" } },
      featured: [
        { name: "installable", identifier: "official/productivity/installable", source: "official", description: "unbounded description" },
        { name: "safe-skill", identifier: "clawhub/safe-skill", source: "clawhub" },
        { name: "bad-url", identifier: "https://example.com/skill?token=secret", source: "https://secret.example" },
      ],
    });
    throw new Error(`Unexpected URL ${url}`);
  });
  const adapter = new HermesSkillsAgentAdapter(config, fetchImpl, cli());
  const snapshot = await adapter.discoverCatalog();
  assert.equal(snapshot.installed.length, 1);
  assert.equal(snapshot.installed[0].identity, "operator-os:hub:official/productivity/safe-skill");
  assert.equal(snapshot.installed[0].hubIdentifier, "official/productivity/safe-skill");
  assert.equal(snapshot.available.length, 2, "same-name skill from another exact hub identity stays distinct");
  assert.deepEqual(snapshot.duplicateIdentities, ["operator-os:hub:official/productivity/safe-skill"]);
  const serialized = JSON.stringify(snapshot);
  for (const forbidden of ["SECRET INSTRUCTIONS", "super-secret", "/Users/secret", "API_KEY", "unbounded description", "https://"]) assert.doesNotMatch(serialized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("canonical installed-state reads distinguish empty, authentication, timeout, and malformed responses", async () => {
  const empty = contractFetch((url) => url.includes("/api/skills?") ? response([]) : response({ installed: {}, featured: [] }));
  assert.equal((await new HermesSkillsAgentAdapter(config, empty, cli({ configured: () => false })).readCanonicalInstalledState("operator-os")).sourceState, "connected_empty");

  const authAdapter = new HermesSkillsAgentAdapter(config, async () => response({ detail: "Unauthorized" }, 401), cli());
  await assert.rejects(() => authAdapter.readCanonicalInstalledState("operator-os"), (error: unknown) => error instanceof HermesSkillsAdapterError && error.kind === "authentication" && error.readEvidence?.attemptCount === 1);

  const timeoutAdapter = new HermesSkillsAgentAdapter(config, async () => { throw new DOMException("timed out", "AbortError"); }, cli());
  await assert.rejects(() => timeoutAdapter.readCanonicalInstalledState("operator-os"), (error: unknown) => error instanceof HermesSkillsAdapterError && error.kind === "timeout" && error.readEvidence?.attemptCount === 2);

  const malformed = contractFetch((url) => url.includes("/api/skills?") ? response({ not: "an array" }) : response({ installed: {}, featured: [] }));
  await assert.rejects(() => new HermesSkillsAgentAdapter(config, malformed, cli()).readCanonicalInstalledState("operator-os"), (error: unknown) => error instanceof HermesSkillsAdapterError && error.kind === "invalid_response" && error.readEvidence?.attemptCount === 1);

  const mismatched = async (input: RequestInfo | URL) => String(input).endsWith("/openapi.json") ? response({ info: { version: "0.20.0" } }) : response([]);
  await assert.rejects(() => new HermesSkillsAgentAdapter(config, mismatched, cli()).inspectExecutionAuthority("disable", "operator-os"), /audited 0\.19\.0 contract/i);
});

test("without an explicit CLI path only API-backed enable and disable are operational", async () => {
  const fetchImpl = contractFetch((url) => url.includes("/api/skills?")
    ? response([{ name: "safe-skill", enabled: true, provenance: "hub", source: "official" }])
    : response({ installed: { "official/productivity/safe-skill": { name: "safe-skill" } }, featured: [{ name: "installable", identifier: "official/productivity/installable", source: "official" }] }));
  const adapter = new HermesSkillsAgentAdapter(config, fetchImpl, cli({ configured: () => false }));
  const snapshot = await adapter.discoverCatalog();
  assert.equal(snapshot.operations.install.supported, false);
  assert.equal(snapshot.operations.remove.supported, false);
  assert.equal(snapshot.operations.update.supported, false);
  assert.equal(snapshot.operations.enable.supported, true);
  assert.deepEqual(snapshot.available[0].supportedActions, []);
  assert.deepEqual(snapshot.installed[0].supportedActions, ["disable"]);
});

test("configured but unapproved CLI contract keeps install and removal unavailable", async () => {
  const fetchImpl = contractFetch(async (url) => {
    if (url.includes("/api/skills?")) return response([]);
    if (url.includes("/api/skills/hub/sources")) return response({ installed: {}, featured: [] });
    throw new Error(`Unexpected URL ${url}`);
  });
  const adapter = new HermesSkillsAgentAdapter(config, fetchImpl, cli({
    inspect: async () => { throw new HermesSkillsAdapterError("contract_mismatch", "unapproved"); },
  }));
  const snapshot = await adapter.discoverCatalog();
  assert.equal(snapshot.operations.install.supported, false);
  assert.equal(snapshot.operations.remove.supported, false);
  assert.match(snapshot.operations.install.note, /not approved/i);
});

test("catalog failure does not expose removal through an unapproved CLI contract", async () => {
  const fetchImpl = contractFetch((url, init) => {
    if (url.includes("/api/skills?")) {
      return response([{ name: "safe-skill", enabled: true, provenance: "hub", source: "official" }]);
    }
    if (url.includes("/api/skills/hub/sources")) return waitForAbort(init);
    throw new Error(`Unexpected URL ${url}`);
  });
  const adapter = new HermesSkillsAgentAdapter(config, fetchImpl, cli({
    inspect: async () => { throw new HermesSkillsAdapterError("contract_mismatch", "unapproved"); },
  }), fastPolicies);
  const snapshot = await adapter.discoverCatalog();
  assert.equal(snapshot.operations.remove.supported, false);
  assert.deepEqual(snapshot.installed[0].supportedActions, ["disable"]);
});

test("catalog discovery is isolated from canonical state and a catalog timeout does not erase installed state", async () => {
  const paths: string[] = [];
  const fetchImpl = contractFetch((url, init) => {
    paths.push(new URL(url).pathname);
    if (url.includes("/api/skills?")) return response([{ name: "safe-skill", enabled: true, provenance: "bundled" }]);
    if (url.includes("/api/skills/hub/sources")) return waitForAbort(init);
    throw new Error(`Unexpected URL ${url}`);
  });
  const adapter = new HermesSkillsAgentAdapter(config, fetchImpl, cli(), fastPolicies);
  const canonical = await adapter.readCanonicalInstalledState("operator-os");
  assert.equal(canonical.installed.length, 1);
  assert.deepEqual(paths, ["/api/skills"]);
  paths.length = 0;
  const discovery = await adapter.discoverCatalog();
  assert.equal(discovery.installed.length, 1);
  assert.equal(discovery.available.length, 0);
  assert.match(discovery.summary, /catalog discovery is unavailable/i);
  assert.deepEqual(paths, ["/api/skills", "/api/skills/hub/sources"]);
});

test("canonical timeout retries once, while authentication and malformed contracts never retry", async () => {
  let transientCalls = 0;
  const transient = new HermesSkillsAgentAdapter(config, async () => {
    transientCalls += 1;
    if (transientCalls === 1) throw new DOMException("timed out", "AbortError");
    return response([]);
  }, cli(), fastPolicies);
  const recovered = await transient.readCanonicalInstalledState("operator-os");
  assert.equal(transientCalls, 2);
  assert.deepEqual(recovered.evidence, { attemptCount: 2, finalClassification: "success", totalElapsedMs: recovered.evidence.totalElapsedMs });

  let unavailableCalls = 0;
  const unavailable = new HermesSkillsAgentAdapter(config, async () => {
    unavailableCalls += 1;
    return unavailableCalls === 1 ? response({}, 503) : response([]);
  }, cli(), fastPolicies);
  assert.equal((await unavailable.readCanonicalInstalledState("operator-os")).evidence.attemptCount, 2);
  assert.equal(unavailableCalls, 2);

  let authCalls = 0;
  const auth = new HermesSkillsAgentAdapter(config, async () => { authCalls += 1; return response({}, 401); }, cli(), fastPolicies);
  await assert.rejects(() => auth.readCanonicalInstalledState("operator-os"), (error: unknown) => error instanceof HermesSkillsAdapterError && error.readEvidence?.attemptCount === 1);
  assert.equal(authCalls, 1);

  let malformedCalls = 0;
  const malformed = new HermesSkillsAgentAdapter(config, async () => { malformedCalls += 1; return response({ wrong: true }); }, cli(), fastPolicies);
  await assert.rejects(() => malformed.readCanonicalInstalledState("operator-os"), (error: unknown) => error instanceof HermesSkillsAdapterError && error.readEvidence?.attemptCount === 1);
  assert.equal(malformedCalls, 1);

  let mismatchCalls = 0;
  const mismatch = new HermesSkillsAgentAdapter(config, async () => {
    mismatchCalls += 1;
    return response({ info: { version: "0.20.0" } });
  }, cli(), fastPolicies);
  await assert.rejects(
    () => mismatch.inspectExecutionAuthority("disable", "operator-os"),
    (error: unknown) => error instanceof HermesSkillsAdapterError
      && error.kind === "contract_mismatch"
      && error.readEvidence?.attemptCount === 1
      && error.readEvidence.finalClassification === "contract_mismatch",
  );
  assert.equal(mismatchCalls, 1);
});

test("two canonical timeouts obey the total deadline and retain safe source-class evidence", async () => {
  let calls = 0;
  const adapter = new HermesSkillsAgentAdapter(config, async (_input, init) => { calls += 1; return waitForAbort(init); }, cli(), fastPolicies);
  const startedAt = Date.now();
  await assert.rejects(
    () => adapter.readCanonicalInstalledState("operator-os"),
    (error: unknown) => error instanceof HermesSkillsAdapterError
      && error.kind === "timeout"
      && error.message === "Hermes Agent Skills installed-state read timed out."
      && error.readEvidence?.attemptCount === 2
      && error.readEvidence.finalClassification === "timeout",
  );
  assert.equal(calls, 2);
  assert.ok(Date.now() - startedAt < 150, "the total read deadline must remain bounded");
});

test("exact candidate inspection binds preview and scan to one full identifier without broad search", async () => {
  const urls: string[] = [];
  const identifier = "official/communication/one-three-one-rule";
  const fetchImpl = contractFetch((url) => {
    urls.push(url);
    if (url.includes("/api/skills/hub/preview")) return response({ identifier, name: "one-three-one-rule", source: "official", trust_level: "official", skill_md: "---\nname: one-three-one-rule\n---\nprivate content" });
    if (url.includes("/api/skills/hub/scan")) return response({ identifier, name: "one-three-one-rule", source: "official", verdict: "safe", policy: "allow", findings: [] });
    throw new Error(`Unexpected URL ${url}`);
  });
  const adapter = new HermesSkillsAgentAdapter(config, fetchImpl, cli(), fastPolicies);
  const candidate = await adapter.inspectExactCandidate(identifier, "operator-os");
  assert.equal(candidate.identifier, identifier);
  assert.equal(candidate.trust, "official");
  assert.equal(candidate.scanVerdict, "safe");
  assert.equal(candidate.findingCount, 0);
  assert.equal(candidate.prerequisiteClassification, "none_declared");
  assert.equal(urls.length, 2);
  for (const url of urls) {
    assert.match(url, /identifier=official%2Fcommunication%2Fone-three-one-rule/);
    assert.match(url, /profile=operator-os/);
    assert.doesNotMatch(url, /\/search\?/);
  }
  assert.doesNotMatch(JSON.stringify(candidate), /private content/);
});

test("uses only fixed Hermes argument arrays for install and exact removal; Update remains audit-only", async () => {
  const calls: Array<{ args: readonly string[]; input?: string; expectedAuthority?: string; skipExternalSecretSources?: boolean }> = [];
  let cliInspections = 0;
  let contractChecks = 0;
  const fakeCli = cli({
    inspect: async () => { cliInspections += 1; return authority; },
    run: async (args, options) => {
      calls.push({ args, input: options?.input, expectedAuthority: options?.expectedAuthority, skipExternalSecretSources: options?.skipExternalSecretSources });
      return { exitCode: 0, timedOut: false, forcedTermination: false, output: "token=must-not-egress" };
    },
  });
  const adapter = new HermesSkillsAgentAdapter(config, async (input) => {
    if (String(input).endsWith("/openapi.json")) {
      contractChecks += 1;
      return response({ info: { version: "0.19.0" } });
    }
    return response({ ok: true });
  }, fakeCli);
  const installAuthority = await adapter.inspectExecutionAuthority("install", "operator-os");
  await adapter.execute({ action: "install", targetIdentity: "official/productivity/installable", targetName: "installable", profile: "operator-os", reason: "test reason", skipExternalSecretSources: true }, installAuthority);
  const removeAuthority = await adapter.inspectExecutionAuthority("remove", "operator-os");
  await adapter.execute({ action: "remove", targetIdentity: "operator-os:hub:official/productivity/safe-skill", targetName: "safe-skill", profile: "operator-os", reason: "test reason", skipExternalSecretSources: true }, removeAuthority);
  await assert.rejects(() => adapter.inspectExecutionAuthority("update", "operator-os"), /audit-only/i);
  assert.deepEqual(calls, [
    { args: ["-p", "operator-os", "skills", "install", "official/productivity/installable", "--yes"], input: undefined, expectedAuthority: authority.opaqueIdentity, skipExternalSecretSources: true },
    { args: ["-p", "operator-os", "skills", "uninstall", "safe-skill"], input: "yes\n", expectedAuthority: authority.opaqueIdentity, skipExternalSecretSources: true },
  ]);
  assert.equal(contractChecks, 2, "each prepared authority check reads the Agent contract once");
  assert.equal(cliInspections, 2, "each prepared authority check inspects the CLI once");
});

test("enable and disable use the exact authenticated Agent API toggle contract", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const adapter = new HermesSkillsAgentAdapter(config, contractFetch(async (url, init) => { requests.push({ url, init }); return response({ ok: true }); }), cli({ run: async () => { throw new Error("CLI must not run"); } }));
  const executionAuthority = await adapter.inspectExecutionAuthority("disable", "operator-os");
  await adapter.execute({ action: "disable", targetIdentity: "operator-os:hub:official/productivity/safe-skill", targetName: "safe-skill", profile: "operator-os", reason: "test reason", skipExternalSecretSources: false }, executionAuthority);
  const toggle = requests.find((request) => request.url.includes("/api/skills/toggle"));
  assert.equal(toggle?.url, "http://127.0.0.1:61921/api/skills/toggle?profile=operator-os");
  assert.equal(toggle?.init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(toggle?.init?.body)), { name: "safe-skill", enabled: false, profile: "operator-os" });
});

test("CLI output and process failures never cross the adapter boundary", async () => {
  const adapter = new HermesSkillsAgentAdapter(config, contractFetch(async () => response({})), cli({ run: async () => ({ exitCode: 9, timedOut: false, forcedTermination: false, output: "Authorization: Bearer secret-value /Users/private/.env" }) }));
  const executionAuthority = await adapter.inspectExecutionAuthority("remove", "operator-os");
  await assert.rejects(
    () => adapter.execute({ action: "remove", targetIdentity: "operator-os:hub:official/productivity/safe-skill", targetName: "safe-skill", profile: "operator-os", reason: "test reason", skipExternalSecretSources: true }, executionAuthority),
    (error: unknown) => error instanceof Error && !error.message.includes("secret-value") && !error.message.includes("/Users/private"),
  );
});

test("private candidate execution cannot request external secret-source isolation", async () => {
  const adapter = new HermesSkillsAgentAdapter(config, contractFetch(async () => response({})), cli({ run: async () => { throw new Error("CLI must not run"); } }));
  const executionAuthority = await adapter.inspectExecutionAuthority("install", "operator-os");
  await assert.rejects(
    () => adapter.execute({ action: "install", targetIdentity: "github/private/skill", targetName: "skill", profile: "operator-os", reason: "test reason", skipExternalSecretSources: true }, executionAuthority),
    /isolation is unavailable/i,
  );
});

async function fakeHermesExecutable(body: string): Promise<{ root: string; executable: string; pidFile: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "cabinet-hermes-cli-"));
  const install = path.join(root, "hermes-agent");
  const bin = path.join(install, "venv", "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "hermes");
  const pidFile = path.join(root, "child.pid");
  const resolvedInstall = await realpath(install);
  const resolvedExecutable = path.join(resolvedInstall, "venv", "bin", "hermes");
  const identityCore = {
    entrypoint: resolvedExecutable,
    install_method: "git",
    installation_root: resolvedInstall,
    product: "Hermes Agent",
    python_executable: "/usr/bin/python3",
    release_date: "2026.7.20",
    schema: "hermes.cli.identity",
    schema_version: 1,
    source_revision: "714ed4ec6cbe3e57b7bb6379c5e97f7b801469a5",
    version: "0.19.0",
  };
  const identity = { ...identityCore, installation_id: createHash("sha256").update(JSON.stringify(identityCore)).digest("hex") };
  const source = `#!/bin/sh\nif [ "$1" = "version" ] && [ "$2" = "--json" ]; then\n  printf '%s\\n' '${JSON.stringify(identity)}'\n  exit 0\nfi\n${body}\n`;
  await writeFile(executable, source, { mode: 0o755 });
  await chmod(executable, 0o755);
  return { root, executable, pidFile };
}

test("fixed CLI requires an absolute executable and detects a changed target", async () => {
  await assert.rejects(() => new FixedHermesSkillsCli("hermes").inspect(), /absolute path/i);
  await assert.rejects(() => new FixedHermesSkillsCli("/definitely/missing/hermes").inspect(), /missing, non-executable, or unexpected/i);
  const fixture = await fakeHermesExecutable("echo ok");
  try {
    const fixed = new FixedHermesSkillsCli(fixture.executable, 1_000, 50);
    const inspected = await fixed.inspect();
    await writeFile(fixture.executable, `${await readFile(fixture.executable, "utf8")}\n# changed\n`, { mode: 0o755 });
    await assert.rejects(() => fixed.run(["skills", "list"], { expectedAuthority: inspected.opaqueIdentity }), /identity changed/i);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("fixed CLI blocks malformed identity and a changed Hermes source revision", async () => {
  const malformed = await fakeHermesExecutable("echo ok");
  try {
    const source = await readFile(malformed.executable, "utf8");
    await writeFile(malformed.executable, source.replace(/\{\"entrypoint\"[^']+/, "{"), { mode: 0o755 });
    await assert.rejects(() => new FixedHermesSkillsCli(malformed.executable, 1_000, 50).inspect(), /malformed machine identity/i);
  } finally {
    await rm(malformed.root, { recursive: true, force: true });
  }

  const changed = await fakeHermesExecutable("echo ok");
  try {
    const source = await readFile(changed.executable, "utf8");
    await writeFile(changed.executable, source.replaceAll("714ed4ec6cbe3e57b7bb6379c5e97f7b801469a5", "0c33db0564597ac8e392e710555b0bddec5cdd1f"), { mode: 0o755 });
    await assert.rejects(() => new FixedHermesSkillsCli(changed.executable, 1_000, 50).inspect(), /not the audited Hermes Agent/i);
  } finally {
    await rm(changed.root, { recursive: true, force: true });
  }
});

test("fixed CLI passes a minimal environment with no Cabinet or provider secrets", async () => {
  const fixture = await fakeHermesExecutable("env");
  const prior = {
    cabinet: process.env.CABINET_DISTINCT_SECRET,
    provider: process.env.OPENAI_API_KEY,
    authorization: process.env.AUTHORIZATION,
    url: process.env.PROVIDER_SECRET_URL,
  };
  process.env.CABINET_DISTINCT_SECRET = "cabinet-secret-unique";
  process.env.OPENAI_API_KEY = "provider-secret-unique";
  process.env.AUTHORIZATION = "Bearer authorization-secret-unique";
  process.env.PROVIDER_SECRET_URL = "https://user:secret@example.invalid";
  try {
    const fixed = new FixedHermesSkillsCli(fixture.executable, 1_000, 50);
    const inspected = await fixed.inspect();
    const result = await fixed.run(["skills", "list"], { expectedAuthority: inspected.opaqueIdentity });
    assert.equal(result.exitCode, 0);
    for (const forbidden of ["CABINET_DISTINCT_SECRET", "OPENAI_API_KEY", "AUTHORIZATION", "PROVIDER_SECRET_URL", "cabinet-secret-unique", "provider-secret-unique", "authorization-secret-unique", "user:secret"]) {
      assert.doesNotMatch(result.output, new RegExp(forbidden));
    }
    assert.match(result.output, /^HOME=/m);
    assert.match(result.output, /^HERMES_NONINTERACTIVE=1$/m);
  } finally {
    if (prior.cabinet === undefined) delete process.env.CABINET_DISTINCT_SECRET; else process.env.CABINET_DISTINCT_SECRET = prior.cabinet;
    if (prior.provider === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prior.provider;
    if (prior.authorization === undefined) delete process.env.AUTHORIZATION; else process.env.AUTHORIZATION = prior.authorization;
    if (prior.url === undefined) delete process.env.PROVIDER_SECRET_URL; else process.env.PROVIDER_SECRET_URL = prior.url;
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("hard process timeout escalates from SIGTERM to SIGKILL and reaps an ignoring child", async () => {
  const fixture = await fakeHermesExecutable("exit 1");
  try {
    const source = await readFile(fixture.executable, "utf8");
    await writeFile(fixture.executable, source.replace("exit 1", () => `echo $$ > "${fixture.pidFile}"\ntrap '' TERM\nwhile :; do :; done`), { mode: 0o755 });
    const fixed = new FixedHermesSkillsCli(fixture.executable, 250, 80);
    const inspected = await fixed.inspect();
    const startedAt = Date.now();
    const result = await fixed.run(["skills", "list"], { expectedAuthority: inspected.opaqueIdentity });
    assert.equal(result.timedOut, true);
    assert.equal(result.forcedTermination, true);
    assert.ok(Date.now() - startedAt < 2_000, "hard deadline must settle promptly");
    assert.equal(result.exitCode, null, "the promise settles only after the killed child closes");
    const pidText = (await readFile(fixture.pidFile, "utf8")).trim();
    const pid = Number(pidText);
    assert.ok(Number.isInteger(pid) && pid > 0, `expected a child pid, received ${JSON.stringify(pidText)}`);
    assert.throws(() => process.kill(pid, 0), /ESRCH/, "the child must be reaped before settlement");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("production adapter contains no shell execution, direct skill writes, PATH fallback, or inherited environment", async () => {
  const source = await readFile(fileURLToPath(new URL("./skills-adapter.ts", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /shell:\s*true/);
  assert.doesNotMatch(source, /\bexec(?:Sync)?\s*\(/);
  assert.doesNotMatch(source, /writeFile|mkdir|rename|copyFile|rmSync|unlink/);
  assert.doesNotMatch(source, /fallback.*executor/i);
  assert.doesNotMatch(source, /\{\s*\.\.\.process\.env/);
  assert.doesNotMatch(source, /\|\|\s*["']hermes["']/);
  assert.match(source, /shell:\s*false/);
});
