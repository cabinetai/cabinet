import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const GLOBAL_OVERRIDE_KEYS = [
  "OPTALE_TENANT_ID",
  "OPTALE_TENANT",
  "OPTALE_GRAPH_NAMESPACE",
  "GRAPH_GROUP_ID",
  "OPTALE_ENTITY_NAMESPACE",
  "OPTALE_COMPANY_BRAIN_TARGET",
  "OPTALE_QMD_PROFILE",
  "OPTALE_GRAPH_PROFILE",
  "OPTALE_ENTITY_PROFILE",
  "OPTALE_MCP_CLIENT_PROFILE",
  "OPTALE_SECRETS_REF",
] as const;

const SCOPED_OVERRIDE_KEYS = ["ROOT", "ACME"].flatMap((segment) =>
  GLOBAL_OVERRIDE_KEYS.map((key) => `${key}_${segment}`)
);

const ENV_KEYS = ["CABINET_DATA_DIR", ...GLOBAL_OVERRIDE_KEYS, ...SCOPED_OVERRIDE_KEYS];

let tempRoot: string;
let originalEnv: Map<string, string | undefined>;
type BrainContextModule = typeof import("./brain-context");
type ScopeRegistryModule = typeof import("./scope-registry");
let context: BrainContextModule;
let registry: ScopeRegistryModule;

function clearOverrides(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  process.env.CABINET_DATA_DIR = tempRoot;
}

before(async () => {
  originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-context-test-"));
  clearOverrides();

  context = await import("./brain-context");
  registry = await import("./scope-registry");
});

afterEach(() => {
  clearOverrides();
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });

  for (const [key, value] of originalEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("resolveOptaleBrainContext infers root as system context", async () => {
  const resolved = await context.resolveOptaleBrainContext(".");

  assert.equal(resolved.subjectType, "system");
  assert.equal(resolved.source, "inferred");
  assert.equal(resolved.cabinetPath, ".");
  assert.equal(resolved.dataRoot, path.resolve(tempRoot));
  assert.equal(resolved.tenantId, undefined);
  assert.equal(resolved.companyId, undefined);
  assert.equal(resolved.personId, undefined);
  assert.equal(resolved.ownerId, undefined);
  assert.equal(resolved.vaultNamespace, "vault:root");
  assert.equal(resolved.memoryNamespace, "system:root");
  assert.equal(resolved.graphNamespace, "system:root");
  assert.equal(resolved.entityNamespace, "system:root");
  assert.equal(resolved.qmdProfile, "root");
  assert.equal(resolved.graphProfile, "root");
  assert.equal(resolved.entityProfile, "root");
  assert.equal(resolved.companyBrainTargetId, undefined);
  assert.equal(resolved.mcpPolicyId, undefined);
  assert.equal(resolved.mcpClientProfile, "root");
  assert.equal(resolved.secretsRef, "root");
  assert.deepEqual(resolved.allowedScopes, ["system", "company", "personal"]);
});

test("resolveOptaleBrainContext maps explicit company scope to company-only context", async () => {
  await registry.writeCabinetOptaleScope("clients/acme", {
    scope: "company",
    companyId: "acme",
    policyId: "policy-acme",
    memoryNamespace: "company:acme",
  });

  const resolved = await context.resolveOptaleBrainContext("clients/acme");

  assert.equal(resolved.subjectType, "company");
  assert.equal(resolved.source, "explicit");
  assert.equal(resolved.cabinetPath, "clients/acme");
  assert.equal(resolved.dataRoot, path.resolve(tempRoot, "clients", "acme"));
  assert.equal(resolved.tenantId, "acme");
  assert.equal(resolved.companyId, "acme");
  assert.equal(resolved.personId, undefined);
  assert.equal(resolved.vaultNamespace, "vault:clients-acme");
  assert.equal(resolved.memoryNamespace, "company:acme");
  assert.equal(resolved.graphNamespace, "company:acme");
  assert.equal(resolved.entityNamespace, "company:acme");
  assert.equal(resolved.qmdProfile, "acme");
  assert.equal(resolved.graphProfile, "acme");
  assert.equal(resolved.entityProfile, "acme");
  assert.equal(resolved.companyBrainTargetId, "optale-acme");
  assert.equal(resolved.mcpPolicyId, "policy-acme");
  assert.equal(resolved.mcpClientProfile, "acme");
  assert.equal(resolved.secretsRef, "acme");
  assert.deepEqual(resolved.allowedScopes, ["company"]);
});

test("resolveOptaleBrainContext applies scoped company env overrides", async () => {
  await registry.writeCabinetOptaleScope("clients/acme", {
    scope: "company",
    companyId: "acme",
    policyId: "policy-acme",
    memoryNamespace: "company:acme",
  });
  process.env.OPTALE_GRAPH_NAMESPACE_ACME = "graph:acme-production";
  process.env.OPTALE_GRAPH_PROFILE_ACME = "graph-profile-acme";
  process.env.OPTALE_QMD_PROFILE_ACME = "qmd-profile-acme";
  process.env.OPTALE_COMPANY_BRAIN_TARGET_ACME = "target-acme-production";

  const resolved = await context.resolveOptaleBrainContext("clients/acme");

  assert.equal(resolved.graphNamespace, "graph:acme-production");
  assert.equal(resolved.graphProfile, "graph-profile-acme");
  assert.equal(resolved.qmdProfile, "qmd-profile-acme");
  assert.equal(resolved.companyBrainTargetId, "target-acme-production");
  assert.equal(resolved.memoryNamespace, "company:acme");
  assert.deepEqual(resolved.allowedScopes, ["company"]);
});
