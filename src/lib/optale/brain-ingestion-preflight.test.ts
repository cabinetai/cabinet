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
type PreflightModule = typeof import("./brain-ingestion-preflight");
type ScopeRegistryModule = typeof import("./scope-registry");
let preflight: PreflightModule;
let registry: ScopeRegistryModule;

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  process.env.CABINET_DATA_DIR = tempRoot;
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

before(async () => {
  originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-preflight-test-"));
  clearEnv();
  preflight = await import("./brain-ingestion-preflight");
  registry = await import("./scope-registry");
});

afterEach(async () => {
  clearEnv();
  await fs.rm(tempRoot, { recursive: true, force: true });
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-preflight-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("Brain ingestion preflight produces a dry-run manifest for allowed company sources", async () => {
  await writeScopes();
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

  const result = await preflight.readOptaleBrainIngestionPreflight({
    cabinetPath: ".",
    sourcePath: "company-brain/canary",
    personalCabinetPath: "personal/thor",
  });

  assert.equal(result.dryRunOnly, true);
  assert.equal(result.readyForReview, true);
  assert.equal(result.source.allowlistStatus, "allowed");
  assert.equal(result.target.scope, "company");
  assert.equal(result.target.memoryNamespace, "company:optale");
  assert.equal(result.manifest.present, true);
  assert.equal(result.stats.markdownFiles, 1);
  assert.equal(result.documents[0]?.title, "Optale Console Canary");
  assert.equal(result.documents[0]?.path, "company-brain/canary/optale-console-canary.md");
  assert.equal(result.isolation.readyForIngestion, true);
});

test("Brain ingestion preflight blocks root company reads from personal paths", async () => {
  await writeScopes();
  const personalDir = path.join(tempRoot, "personal", "thor");
  await fs.mkdir(personalDir, { recursive: true });
  await fs.writeFile(path.join(personalDir, "private.md"), "# Private\n");

  const result = await preflight.readOptaleBrainIngestionPreflight({
    cabinetPath: ".",
    sourcePath: "personal/thor",
    personalCabinetPath: "personal/thor",
  });

  assert.equal(result.readyForReview, false);
  assert.equal(result.source.allowlistStatus, "blocked");
  assert.equal(result.stats.markdownFiles, 0);
  assert.equal(
    result.checks.find((entry) => entry.id === "source-allowlist")?.status,
    "red",
  );
});
