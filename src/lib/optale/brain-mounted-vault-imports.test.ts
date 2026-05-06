import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OptaleIdentitySnapshot } from "./identity-shared";

const ENV_KEYS = [
  "CABINET_DATA_DIR",
  "OPTALE_BRAIN_IMPORT_AUDIT_ROOT",
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

const ACTOR: OptaleIdentitySnapshot = {
  authenticated: true,
  provider: "local",
  source: "local-dev",
  subject: "thor",
  email: "thor@optale.no",
  name: "Thor Haaland",
  groups: ["local"],
  role: "admin",
  permissions: [],
};

let tempRoot: string;
let originalEnv: Map<string, string | undefined>;
type ImportModule = typeof import("./brain-mounted-vault-imports");
type ScopeRegistryModule = typeof import("./scope-registry");
let imports: ImportModule;
let registry: ScopeRegistryModule;

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  process.env.CABINET_DATA_DIR = tempRoot;
  process.env.OPTALE_BRAIN_IMPORT_AUDIT_ROOT = path.join(tempRoot, ".audit");
}

async function writeScopes(): Promise<void> {
  await registry.writeCabinetOptaleScope(".", {
    scope: "company",
    companyId: "optale",
    ownerId: "optale-team",
    policyId: "optale-internal",
    memoryNamespace: "company:optale",
    companyBrainTargetId: "optale-company",
  });
  await registry.writeCabinetOptaleScope("personal/thor", {
    scope: "personal",
    companyId: "optale",
    userId: "thor",
    ownerId: "thor",
    policyId: "optale-internal",
    memoryNamespace: "personal:thor",
    companyBrainTargetId: "optale-company",
  });
}

async function writeCanarySource(): Promise<void> {
  const sourceDir = path.join(tempRoot, "company-brain", "canary");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(
    path.join(sourceDir, "optale-console-canary.md"),
    "title: Optale Console Canary\n\n# Optale Console Canary\n",
  );
  await fs.writeFile(
    path.join(sourceDir, "manifest.json"),
    JSON.stringify({ documents: ["optale-console-canary.md"] }),
  );
}

before(async () => {
  originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-import-test-"));
  clearEnv();
  imports = await import("./brain-mounted-vault-imports");
  registry = await import("./scope-registry");
});

afterEach(async () => {
  clearEnv();
  await fs.rm(tempRoot, { recursive: true, force: true });
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-import-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  process.env.OPTALE_BRAIN_IMPORT_AUDIT_ROOT = path.join(tempRoot, ".audit");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("mounted-vault import records immutable audit for allowed company source", async () => {
  await writeScopes();
  await writeCanarySource();

  const record = await imports.recordOptaleBrainMountedVaultImport({
    cabinetPath: ".",
    sourcePath: "company-brain/canary",
    personalCabinetPath: "personal/thor",
    actor: ACTOR,
  });
  const log = await imports.readOptaleBrainMountedVaultImportLog();

  assert.equal(record.status, "recorded");
  assert.equal(record.actor.subject, "thor");
  assert.equal(record.source.sourcePath, "company-brain/canary");
  assert.equal(record.target.scope, "company");
  assert.equal(record.manifest.present, true);
  assert.equal(record.documents.length, 1);
  assert.equal(record.result.semanticIngestion, false);
  assert.equal(record.result.privateSourcesIncluded, false);
  assert.equal(log.counts.records, 1);
  assert.equal(log.records[0]?.id, record.id);
});

test("mounted-vault import rejects non-allowlisted personal source", async () => {
  await writeScopes();
  await assert.rejects(
    () =>
      imports.recordOptaleBrainMountedVaultImport({
        cabinetPath: ".",
        sourcePath: "personal/thor",
        personalCabinetPath: "personal/thor",
        actor: ACTOR,
      }),
    /company-brain|allowlist|red checks/,
  );

  const log = await imports.readOptaleBrainMountedVaultImportLog();
  assert.equal(log.counts.records, 0);
});

test("mounted-vault import requires a source manifest", async () => {
  await writeScopes();
  const sourceDir = path.join(tempRoot, "company-brain", "no-manifest");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "doc.md"), "# Doc\n");

  await assert.rejects(
    () =>
      imports.recordOptaleBrainMountedVaultImport({
        cabinetPath: ".",
        sourcePath: "company-brain/no-manifest",
        personalCabinetPath: "personal/thor",
        actor: ACTOR,
      }),
    /manifest/,
  );
});
