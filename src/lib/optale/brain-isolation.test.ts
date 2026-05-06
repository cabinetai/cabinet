import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ENV_KEYS = [
  "CABINET_DATA_DIR",
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

let tempRoot: string;
let originalEnv: Map<string, string | undefined>;
type IsolationModule = typeof import("./brain-isolation");
type ScopeRegistryModule = typeof import("./scope-registry");
let isolation: IsolationModule;
let registry: ScopeRegistryModule;

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  process.env.CABINET_DATA_DIR = tempRoot;
}

async function writeOptaleTeamScopes(input: {
  personalMemoryNamespace?: string;
  personalCompanyBrainTargetId?: string;
} = {}): Promise<void> {
  await registry.writeCabinetOptaleScope(".", {
    scope: "company",
    companyId: "optale",
    ownerId: "optale-team",
    policyId: "optale-internal",
    memoryNamespace: "company:optale",
    companyBrainTargetId: "optale-company",
    labels: ["Optale team", "company brain"],
  });
  await registry.writeCabinetOptaleScope("personal/thor", {
    scope: "personal",
    companyId: "optale",
    userId: "thor",
    ownerId: "thor",
    policyId: "optale-internal",
    memoryNamespace: input.personalMemoryNamespace || "personal:thor",
    companyBrainTargetId: input.personalCompanyBrainTargetId || "optale-company",
    labels: ["Thor", "personal brain", "Optale team"],
  });
}

before(async () => {
  originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-isolation-test-"));
  clearEnv();
  isolation = await import("./brain-isolation");
  registry = await import("./scope-registry");
});

afterEach(async () => {
  clearEnv();
  await fs.rm(tempRoot, { recursive: true, force: true });
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-isolation-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("Brain isolation gate is green for explicit company and personal team scopes", async () => {
  await writeOptaleTeamScopes();

  const status = await isolation.readOptaleBrainIsolationStatus({
    companyCabinetPath: ".",
    personalCabinetPath: "personal/thor",
  });

  assert.equal(status.readyForIngestion, true);
  assert.equal(status.sharedCompanyBrainTargetId, "optale-company");
  assert.equal(status.company.scope, "company");
  assert.equal(status.personal.scope, "personal");
  assert.equal(status.company.memoryNamespace, "company:optale");
  assert.equal(status.personal.memoryNamespace, "personal:thor");
  assert.deepEqual(
    status.checks.map((entry) => entry.status),
    status.checks.map(() => "green"),
  );
});

test("Brain isolation gate fails when company and personal memory collide", async () => {
  await writeOptaleTeamScopes({ personalMemoryNamespace: "company:optale" });

  const status = await isolation.readOptaleBrainIsolationStatus({
    companyCabinetPath: ".",
    personalCabinetPath: "personal/thor",
  });

  assert.equal(status.readyForIngestion, false);
  assert.equal(
    status.checks.find((entry) => entry.id === "memory-namespaces-distinct")?.status,
    "red",
  );
});

test("Brain isolation gate fails when company Brain target ids do not match", async () => {
  await writeOptaleTeamScopes({ personalCompanyBrainTargetId: "other-company-brain" });

  const status = await isolation.readOptaleBrainIsolationStatus({
    companyCabinetPath: ".",
    personalCabinetPath: "personal/thor",
  });

  assert.equal(status.readyForIngestion, false);
  assert.equal(status.sharedCompanyBrainTargetId, undefined);
  assert.equal(
    status.checks.find((entry) => entry.id === "company-target-shared")?.status,
    "red",
  );
});
