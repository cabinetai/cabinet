import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
type CoreModule = typeof import("./brain-core");
type ContractsModule = typeof import("./brain-contracts");
type ScopeRegistryModule = typeof import("./scope-registry");
let core: CoreModule;
let contracts: ContractsModule;
let registry: ScopeRegistryModule;

const envKeys = [
  "CABINET_DATA_DIR",
  "OPTALE_COMMAND_BRAIN_ORIGIN",
  "OPTALE_COMMAND_BRAIN_AUTH_MODE",
  "OPTALE_COMMAND_BRAIN_SERVICE_TOKEN",
  "OPTALE_COMPANY_BRAIN_REVIEWER_ENABLED",
  "OPTALE_COMPANY_BRAIN_REVIEWER_ALLOW",
  "OPTALE_COMPANY_BRAIN_TARGET",
] as const;
let originalEnv: Map<string, string | undefined>;

before(async () => {
  originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-core-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  delete process.env.OPTALE_COMMAND_BRAIN_ORIGIN;
  delete process.env.OPTALE_COMMAND_BRAIN_AUTH_MODE;
  delete process.env.OPTALE_COMMAND_BRAIN_SERVICE_TOKEN;
  delete process.env.OPTALE_COMPANY_BRAIN_REVIEWER_ENABLED;
  delete process.env.OPTALE_COMPANY_BRAIN_REVIEWER_ALLOW;
  delete process.env.OPTALE_COMPANY_BRAIN_TARGET;
  core = await import("./brain-core");
  contracts = await import("./brain-contracts");
  registry = await import("./scope-registry");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("readOptaleBrainCoreStatus returns canonical Observatory-owned read model", async () => {
  await registry.writeCabinetOptaleScope("clients/acme", {
    scope: "company",
    companyId: "acme",
    policyId: "policy-acme",
    memoryNamespace: "company:acme",
  });

  const status = await core.readOptaleBrainCoreStatus({
    cabinetPath: "clients/acme",
    actor: {
      actorType: "user",
      source: "command-jwt",
      actorId: "user-1",
      role: "admin",
      allowedScopes: ["company", "personal"],
      allowedTargetIds: ["optale-acme"],
    },
    requestId: "req-core",
  });

  assert.equal(status.version, 1);
  assert.equal(status.migration.canonicalOwner, "observatory");
  assert.equal(status.migration.commandBridgeEnabled, false);
  assert.equal(status.request.actor.requestId, "req-core");
  assert.deepEqual(status.request.actor.allowedScopes, ["company"]);
  assert.equal(status.request.brain.companyId, "acme");
  assert.equal(status.provisioning.companyBrainTargetId, "optale-acme");
  assert.equal(status.provisioning.copyPersonalVault, false);
  assert.equal(status.provisioning.copyPersonalMemory, false);
  assert.equal(status.boundary.privateToCompanyAutomaticWrite, false);
  assert.equal(status.boundary.companyWritesRequireHumanApproval, true);
  assert.deepEqual(status.sources.find((source) => source.id === "vault")?.permissions, ["read"]);
  assert.ok(status.sources.find((source) => source.id === "vault"));
  assert.ok(status.sources.find((source) => source.id === "company-brain"));
  assert.equal(
    status.sources.find((source) => source.id === "company-brain")?.status,
    "blocked"
  );
});

test("redactBrainCoreStatusForClient removes server paths and secret refs", async () => {
  const status = await core.readOptaleBrainCoreStatus({ cabinetPath: "." });
  const redacted = contracts.redactBrainCoreStatusForClient(status);

  assert.equal(redacted.request.brain.dataRoot, "[server-side]");
  assert.equal(redacted.provisioning.dataRoot, "[server-side]");
  assert.equal(redacted.request.brain.secretsRef, "[configured]");
  assert.equal(redacted.provisioning.secretsRef, "[configured]");
});

test("readOptaleBrainCoreStatus marks Command bridge healthy only for configured user-jwt bridge", async () => {
  process.env.OPTALE_COMMAND_BRAIN_ORIGIN = "https://command.example.com";
  process.env.OPTALE_COMMAND_BRAIN_AUTH_MODE = "user-jwt";
  process.env.OPTALE_COMPANY_BRAIN_REVIEWER_ENABLED = "true";
  process.env.OPTALE_COMPANY_BRAIN_TARGET = "optale-global";

  const status = await core.readOptaleBrainCoreStatus({ cabinetPath: "." });
  const companyBrain = status.sources.find((source) => source.id === "company-brain");

  assert.equal(status.migration.commandBridgeEnabled, true);
  assert.equal(status.migration.commandBridgeConfigured, true);
  assert.equal(companyBrain?.status, "healthy");
  assert.deepEqual(companyBrain?.capabilities, ["read"]);
});
