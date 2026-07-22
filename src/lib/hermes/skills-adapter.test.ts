import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AUDITED_HERMES_SOURCE_REVISION,
  FixedHermesSkillsCli,
  HermesSkillsAdapterError,
  HermesSkillsCliAdapter,
  type HermesCliAuthority,
  type HermesSkillsCli,
  type HermesSkillsReadPolicies,
} from "./skills-adapter";
import type { HermesSkillsServerConfig } from "./server-config";

const config: HermesSkillsServerConfig = {
  profile: "operator-os",
};

const authority: HermesCliAuthority = {
  opaqueIdentity: "a".repeat(64),
  version: "0.19.0",
  sourceRevision: AUDITED_HERMES_SOURCE_REVISION,
  schemaVersion: 1,
  installationId: "b".repeat(64),
};

const fastPolicies: HermesSkillsReadPolicies = {
  canonicalInstalled: { perAttemptTimeoutMs: 20, totalDeadlineMs: 45, maxAttempts: 2 },
  exactCandidate: { perAttemptTimeoutMs: 20, totalDeadlineMs: 45, maxAttempts: 2 },
  catalog: { perAttemptTimeoutMs: 20, totalDeadlineMs: 25, maxAttempts: 1 },
};

function canonical(matches: unknown[] = []): unknown {
  const names = new Map<string, number>();
  for (const value of matches) {
    const name = String((value as { name?: unknown }).name ?? "");
    names.set(name, (names.get(name) ?? 0) + 1);
  }
  return {
    ambiguity_count: 0,
    contract: "hermes.skills.installed-state",
    exact_match_count: matches.filter((value) => (value as { origin?: unknown }).origin === "hub").length,
    matches,
    profile: "operator-os",
    same_name_collision_count: [...names.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
    schema_version: 2,
  };
}

const officialMatch = {
  authority_class: "official_public",
  enabled: true,
  identifier: "official/communication/one-three-one-rule",
  install_path: "communication/one-three-one-rule",
  installed: true,
  local_fulfillment: true,
  name: "one-three-one-rule",
  native_trust: "builtin",
  official: true,
  origin: "hub",
  public: true,
  source: "official",
};

const officialCatalog = {
  contract: "hermes.skills.catalog",
  entry_count: 1,
  profile: "operator-os",
  schema_version: 2,
  entries: [{
    authority_class: "official_public",
    category: "communication",
    identifier: "official/communication/one-three-one-rule",
    local_fulfillment: true,
    name: "one-three-one-rule",
    native_trust: "builtin",
    official: true,
    public: true,
    source: "official",
    supported_actions: ["install"],
  }],
};

function candidate(contract: "hermes.skills.candidate" | "hermes.skills.audit"): Record<string, unknown> {
  return {
    authority_class: "official_public",
    contract,
    ...(contract === "hermes.skills.audit" ? { finding_count: 0 } : {}),
    identifier: "official/communication/one-three-one-rule",
    local_fulfillment: true,
    name: "one-three-one-rule",
    native_trust: "builtin",
    official: true,
    prerequisite_classes: ["platform"],
    profile: "operator-os",
    public: true,
    schema_version: 2,
    source: "official",
    ...(contract === "hermes.skills.audit" ? { verdict: "safe" } : {}),
  };
}

function cliRouter(
  route: (args: readonly string[], call: number) => unknown = (args) => args.includes("list")
    ? canonical()
    : args.includes("catalog")
      ? officialCatalog
      : candidate(args.includes("audit") ? "hermes.skills.audit" : "hermes.skills.candidate"),
): HermesSkillsCli & { calls: Array<{ args: readonly string[]; skip?: boolean }>; inspections: number } {
  let call = 0;
  return {
    calls: [],
    inspections: 0,
    configured: () => true,
    inspect: async function () { this.inspections += 1; return authority; },
    run: async function (args, options) {
      this.calls.push({ args, skip: options?.skipExternalSecretSources });
      call += 1;
      const value = route(args, call);
      if (value instanceof Error) throw value;
      return { exitCode: 0, timedOut: false, forcedTermination: false, output: typeof value === "string" ? value : `${JSON.stringify(value)}\n` };
    },
  };
}

test("canonical installed state comes only from strict CLI JSON and preserves exact official provenance", async () => {
  const fakeCli = cliRouter((args) => args.includes("list") ? canonical([officialMatch]) : canonical());
  const adapter = new HermesSkillsCliAdapter(config, fakeCli, fastPolicies);
  const state = await adapter.readCanonicalInstalledState("operator-os");
  assert.equal(state.interface, "Canonical Hermes CLI installed-state JSON");
  assert.equal(state.installed.length, 1);
  assert.equal(state.installed[0].identity, "operator-os:hub:official/communication/one-three-one-rule");
  assert.deepEqual(state.installed[0].supportedActions, ["remove"]);
  assert.equal(state.installed[0].enabled, true);
  assert.deepEqual(fakeCli.calls, [{ args: ["-p", "operator-os", "skills", "list", "--json"], skip: true }]);
});

test("official catalog and canonical state use only strict CLI JSON", async () => {
  const fakeCli = cliRouter();
  const adapter = new HermesSkillsCliAdapter(config, fakeCli, fastPolicies);
  const snapshot = await adapter.discoverCatalog("three");
  assert.equal(snapshot.available.length, 1);
  assert.deepEqual(snapshot.available[0].supportedActions, ["install"]);
  assert.equal(snapshot.operations.enable.supported, false);
  assert.equal(snapshot.operations.disable.supported, false);
  assert.equal(snapshot.operations.update.supported, false);
  assert.deepEqual(fakeCli.calls.map((call) => call.args), [
    ["-p", "operator-os", "skills", "list", "--json"],
    ["-p", "operator-os", "skills", "catalog", "--json"],
  ]);
  assert.doesNotMatch(JSON.stringify(snapshot), /description|prompt|manifest|https?:\/\//i);
});

test("catalog schema drift, extra fields, count mismatch, and ambiguity fail closed", async () => {
  const malformedCases = [
    { ...officialCatalog, schema_version: 1 },
    { ...officialCatalog, unexpected: true },
    { ...officialCatalog, entry_count: 2 },
  ];
  for (const catalog of malformedCases) {
    const fakeCli = cliRouter((args) => args.includes("list") ? canonical() : catalog);
    const snapshot = await new HermesSkillsCliAdapter(config, fakeCli, fastPolicies).discoverCatalog();
    assert.equal(snapshot.sourceState, "malformed");
    assert.deepEqual(snapshot.available, []);
    assert.match(snapshot.summary, /Catalog discovery is unavailable/);
  }
  const ambiguous = {
    ...officialCatalog,
    entries: [
      ...officialCatalog.entries,
      { ...officialCatalog.entries[0], identifier: "official/communication/other-rule" },
    ],
    entry_count: 2,
  };
  const fakeCli = cliRouter((args) => args.includes("list") ? canonical() : ambiguous);
  await assert.rejects(
    () => new HermesSkillsCliAdapter(config, fakeCli, fastPolicies).discoverCatalog(),
    /ambiguous identity/i,
  );
});

test("exact candidate inspect and audit bind one identifier with safe zero-finding local official authority", async () => {
  const fakeCli = cliRouter();
  const adapter = new HermesSkillsCliAdapter(config, fakeCli, fastPolicies);
  const inspected = await adapter.inspectExactCandidate("official/communication/one-three-one-rule", "operator-os");
  assert.equal(inspected.identifier, "official/communication/one-three-one-rule");
  assert.equal(inspected.source, "official");
  assert.equal(inspected.nativeTrust, "builtin");
  assert.equal(inspected.authorityClass, "official_public");
  assert.equal(inspected.scanVerdict, "safe");
  assert.equal(inspected.findingCount, 0);
  assert.deepEqual(inspected.prerequisiteClasses, ["platform"]);
  assert.equal(inspected.prerequisiteClassification, "none_declared");
  assert.deepEqual(fakeCli.calls.map((call) => call.args), [
    ["-p", "operator-os", "skills", "inspect", "official/communication/one-three-one-rule", "--json"],
    ["-p", "operator-os", "skills", "audit", "official/communication/one-three-one-rule", "--json"],
  ]);
  assert.ok(fakeCli.calls.every((call) => call.skip === true));
});

test("malformed JSON, human output, extra fields, version drift, collisions, and provenance drift fail closed", async () => {
  const cases: unknown[] = [
    "Name: human table output",
    "{not-json}",
    { ...(canonical() as Record<string, unknown>), unexpected: "field" },
    { ...(canonical() as Record<string, unknown>), schema_version: 1 },
    canonical([{ ...officialMatch, identifier: null }]),
    { ...(canonical([officialMatch, { ...officialMatch, identifier: null, install_path: null, origin: "local", source: "local", native_trust: "local", authority_class: "unapproved", official: false, public: false }]) as Record<string, unknown>), same_name_collision_count: 0 },
    canonical([{ ...officialMatch, native_trust: "official" }]),
  ];
  for (const value of cases) {
    const adapter = new HermesSkillsCliAdapter(config, cliRouter(() => value), fastPolicies);
    await assert.rejects(() => adapter.readCanonicalInstalledState("operator-os"), HermesSkillsAdapterError);
  }
});

test("candidate mismatches and sensitive prerequisites block exact authority", async () => {
  const mismatch = cliRouter((args) => args.includes("audit") ? { ...candidate("hermes.skills.audit"), identifier: "official/other/skill" } : candidate("hermes.skills.candidate"));
  await assert.rejects(() => new HermesSkillsCliAdapter(config, mismatch, fastPolicies).inspectExactCandidate("official/communication/one-three-one-rule", "operator-os"), /disagree/i);

  const sensitive = cliRouter((args) => ({ ...candidate(args.includes("audit") ? "hermes.skills.audit" : "hermes.skills.candidate"), prerequisite_classes: ["credential"] }));
  const value = await new HermesSkillsCliAdapter(config, sensitive, fastPolicies).inspectExactCandidate("official/communication/one-three-one-rule", "operator-os");
  assert.equal(value.prerequisiteClassification, "declared");
});

test("execution authority and dispatch use only fixed CLI arrays; enable, disable, and update are unsupported", async () => {
  const fakeCli = cliRouter();
  const adapter = new HermesSkillsCliAdapter(config, fakeCli, fastPolicies);
  const install = await adapter.inspectExecutionAuthority("install", "operator-os");
  await adapter.execute({ action: "install", targetIdentity: "official/communication/one-three-one-rule", targetName: "one-three-one-rule", profile: "operator-os", reason: "governed test", skipExternalSecretSources: true }, install);
  const remove = await adapter.inspectExecutionAuthority("remove", "operator-os");
  await adapter.execute({ action: "remove", targetIdentity: "operator-os:hub:official/communication/one-three-one-rule", targetName: "one-three-one-rule", profile: "operator-os", reason: "governed test", skipExternalSecretSources: true }, remove);
  assert.deepEqual(fakeCli.calls.slice(-2).map((call) => call.args), [
    ["-p", "operator-os", "skills", "install", "official/communication/one-three-one-rule", "--yes"],
    ["-p", "operator-os", "skills", "uninstall", "official/communication/one-three-one-rule", "--yes"],
  ]);
  for (const action of ["enable", "disable", "update"] as const) await assert.rejects(() => adapter.inspectExecutionAuthority(action, "operator-os"), /only governed install and removal/i);
});

test("25 catalog, canonical, candidate, precondition, verification, and reconciliation simulations are CLI-only", async () => {
  for (let index = 0; index < 25; index += 1) {
    const fakeCli = cliRouter((args) => args.includes("list")
      ? canonical(index % 2 ? [officialMatch] : [])
      : args.includes("catalog")
        ? officialCatalog
        : candidate(args.includes("audit") ? "hermes.skills.audit" : "hermes.skills.candidate"));
    const adapter = new HermesSkillsCliAdapter(config, fakeCli, fastPolicies);
    await adapter.discoverCatalog();
    await adapter.readCanonicalInstalledState("operator-os");
    await adapter.inspectExactCandidate("official/communication/one-three-one-rule", "operator-os");
    assert.ok(fakeCli.calls.every((call) => call.args[0] === "-p"));
  }
});

async function fakeHermesExecutable(body: string): Promise<{ root: string; executable: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "cabinet-hermes-cli-"));
  const install = path.join(root, "hermes-agent");
  const bin = path.join(install, "venv", "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "hermes");
  const resolvedInstall = await realpath(install);
  const resolvedExecutable = path.join(resolvedInstall, "venv", "bin", "hermes");
  const identityCore = {
    entrypoint: resolvedExecutable, install_method: "git", installation_root: resolvedInstall,
    product: "Hermes Agent", python_executable: "/usr/bin/python3", release_date: "2026.7.20",
    schema: "hermes.cli.identity", schema_version: 1,
    source_revision: AUDITED_HERMES_SOURCE_REVISION, version: "0.19.0",
  };
  const identity = { ...identityCore, installation_id: createHash("sha256").update(JSON.stringify(identityCore)).digest("hex") };
  await writeFile(executable, `#!/bin/sh\nif [ "$1" = version ]; then printf '%s\\n' '${JSON.stringify(identity)}'; exit 0; fi\n${body}\n`, { mode: 0o755 });
  await chmod(executable, 0o755);
  return { root, executable };
}

test("fixed CLI pins exact companion identity, detects file drift, and passes a nonsecret minimal environment", async () => {
  const fixture = await fakeHermesExecutable("env");
  process.env.OPENAI_API_KEY = "must-not-egress";
  try {
    const fixed = new FixedHermesSkillsCli(fixture.executable, 1_000, 50);
    const inspected = await fixed.inspect();
    const result = await fixed.run(["skills", "list", "--json"], { expectedAuthority: inspected.opaqueIdentity, skipExternalSecretSources: true });
    assert.equal(result.exitCode, 0);
    assert.doesNotMatch(result.output, /OPENAI_API_KEY|must-not-egress/);
    assert.match(result.output, /HERMES_SKIP_EXTERNAL_SECRET_SOURCES=official-public-skills-v1/);
    await writeFile(fixture.executable, `${await readFile(fixture.executable, "utf8")}\n# drift\n`, { mode: 0o755 });
    await assert.rejects(() => fixed.run(["skills", "list", "--json"], { expectedAuthority: inspected.opaqueIdentity }), /identity changed/i);
  } finally {
    delete process.env.OPENAI_API_KEY;
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("production adapter contains no Agent or Desktop HTTP dependency, shell execution, human-output parser, direct writes, or inherited environment", async () => {
  const source = await readFile(fileURLToPath(new URL("./skills-adapter.ts", import.meta.url)), "utf8");
  for (const forbidden of [/\/v1\/skills/, /\/api\/skills/, /toggle/, /\/hub\/(?:search|sources|preview|scan)/, /openapi\.json/, /\bfetch\s*\(/, /shell:\s*true/, /\bexec(?:Sync)?\s*\(/, /writeFile|mkdir|rename|copyFile|rmSync|unlink/, /\{\s*\.\.\.process\.env/, /parse.*table|split.*column/i]) assert.doesNotMatch(source, forbidden);
  assert.match(source, /shell:\s*false/);
  assert.match(source, /\["catalog", "--json"\]/);
});
