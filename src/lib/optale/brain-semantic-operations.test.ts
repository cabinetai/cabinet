import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OptaleIdentitySnapshot } from "./identity-shared";

const ENV_KEYS = [
  "CABINET_DATA_DIR",
  "OPTALE_BRAIN_SEMANTIC_AUDIT_ROOT",
  "OPTALE_AGENT_HARNESS_URL",
  "OPTALE_AGENT_HARNESS_CONTROL_API_KEY",
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
let originalFetch: typeof globalThis.fetch;
type SemanticModule = typeof import("./brain-semantic-operations");
type ScopeRegistryModule = typeof import("./scope-registry");
type PreflightModule = typeof import("./brain-ingestion-preflight");
let semantic: SemanticModule;
let registry: ScopeRegistryModule;
let preflightModule: PreflightModule;

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  process.env.CABINET_DATA_DIR = tempRoot;
  process.env.OPTALE_BRAIN_SEMANTIC_AUDIT_ROOT = path.join(tempRoot, ".semantic");
  process.env.OPTALE_AGENT_HARNESS_URL = "https://harness.test";
  process.env.OPTALE_AGENT_HARNESS_CONTROL_API_KEY = "control-token";
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
    "title: Optale Console Canary\n\n# Optale Console Canary\nCompany-only fact.\n",
  );
  await fs.writeFile(
    path.join(sourceDir, "manifest.json"),
    JSON.stringify({ documents: ["optale-console-canary.md"] }),
  );
}

async function reviewedSnapshot(sourcePath = "company-brain/canary") {
  const preflight = await preflightModule.readOptaleBrainIngestionPreflight({
    cabinetPath: ".",
    sourcePath,
    personalCabinetPath: "personal/thor",
  });
  return {
    manifestSha256: preflight.manifest.sha256,
    documentCount: preflight.documents.length,
    documentSha256s: preflight.documents.map((document) => document.sha256),
    sourcePath: preflight.source.sourcePath,
    virtualRoot: preflight.source.virtualRoot,
  };
}

function installHarnessFetch(
  status: "success" | "failure" = "success",
  jobStatus: string = "completed",
): string[] {
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    const pathname = new URL(String(url)).pathname;
    const headers = new Headers(init?.headers);
    calls.push(`${init?.method || "GET"} ${pathname} ${headers.get("authorization") || ""}`);

    if (status === "failure" && pathname.includes("/tools/sense_ingest_document/invoke")) {
      return Response.json({ error: "boom" }, { status: 502 });
    }

    if (pathname === "/ingestion-jobs/job-1") {
      return Response.json({
        ingestionJob: {
          id: "job-1",
          status: jobStatus,
          dataset_name: "optale-company",
          source_ref: "vault://company-brain",
          result_ref:
            jobStatus === "completed"
              ? { content: [{ type: "text", text: "stored" }] }
              : {},
          last_error: jobStatus === "dead_letter" ? "COGNEE_FAILED" : null,
        },
      });
    }

    if (pathname.includes("/tools/") && pathname.endsWith("/invoke")) {
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      if (!body.approvalRequestId) {
        return Response.json({
          status: "requires_approval",
          output: { approvalRequest: { id: "approval-1" } },
        });
      }
      if (!body.checkpointId) {
        return Response.json({
          status: "requires_checkpoint",
          output: { checkpoint: { id: "checkpoint-1" } },
        });
      }
      const isReset = pathname.includes("sense_delete_cognee_canary_dataset");
      return Response.json({
        status: isReset ? "completed" : "queued",
        output: isReset
          ? { content: [{ type: "text", text: "deleted" }] }
          : { ingestionJobId: "job-1", status: "pending" },
      });
    }

    return Response.json({ ok: true });
  };
  return calls;
}

before(async () => {
  originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  originalFetch = globalThis.fetch;
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-semantic-test-"));
  clearEnv();
  semantic = await import("./brain-semantic-operations");
  registry = await import("./scope-registry");
  preflightModule = await import("./brain-ingestion-preflight");
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await fs.rm(tempRoot, { recursive: true, force: true });
  await fs.mkdir(tempRoot, { recursive: true });
  clearEnv();
});

after(async () => {
  globalThis.fetch = originalFetch;
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("semantic ingestion records requested and accepted states", async () => {
  await writeScopes();
  await writeCanarySource();
  const calls = installHarnessFetch();

  const record = await semantic.queueOptaleBrainSemanticIngestion({
    cabinetPath: ".",
    sourcePath: "company-brain/canary",
    personalCabinetPath: "personal/thor",
    review: await reviewedSnapshot(),
    actor: ACTOR,
  });
  const log = await semantic.readOptaleBrainSemanticOperationLog();

  assert.equal(record.action, "semantic_ingestion_accepted");
  assert.equal(record.status, "queued");
  assert.equal(record.harness.ingestionJobId, "job-1");
  assert.equal(record.harness.datasetName, "optale-company");
  assert.equal(log.counts.records, 2);
  assert.equal(log.counts.requested, 1);
  assert.equal(log.counts.queued, 1);
  assert.ok(calls.every((call) => call.includes("Bearer control-token")));
});

test("semantic status refresh records completed harness jobs once", async () => {
  await writeScopes();
  await writeCanarySource();
  installHarnessFetch("success", "completed");

  await semantic.queueOptaleBrainSemanticIngestion({
    cabinetPath: ".",
    sourcePath: "company-brain/canary",
    personalCabinetPath: "personal/thor",
    review: await reviewedSnapshot(),
    actor: ACTOR,
  });

  const firstRefresh = await semantic.refreshOptaleBrainSemanticOperationStatuses();
  const secondRefresh = await semantic.refreshOptaleBrainSemanticOperationStatuses();
  const log = await semantic.readOptaleBrainSemanticOperationLog();

  assert.deepEqual(firstRefresh, { checked: 1, appended: 1 });
  assert.deepEqual(secondRefresh, { checked: 0, appended: 0 });
  assert.equal(log.counts.records, 3);
  assert.equal(log.counts.completed, 1);
  assert.equal(log.records[0]?.action, "semantic_ingestion_completed");
  assert.equal(log.records[0]?.status, "completed");
  assert.equal(log.records[0]?.harness.status, "completed");
  assert.equal(log.records[0]?.harness.datasetName, "optale-company");
});

test("semantic status refresh records retryable harness jobs", async () => {
  await writeScopes();
  await writeCanarySource();
  installHarnessFetch("success", "retryable");

  await semantic.queueOptaleBrainSemanticIngestion({
    cabinetPath: ".",
    sourcePath: "company-brain/canary",
    personalCabinetPath: "personal/thor",
    review: await reviewedSnapshot(),
    actor: ACTOR,
  });

  const refresh = await semantic.refreshOptaleBrainSemanticOperationStatuses();
  const log = await semantic.readOptaleBrainSemanticOperationLog();

  assert.deepEqual(refresh, { checked: 1, appended: 1 });
  assert.equal(log.records[0]?.action, "semantic_ingestion_retryable");
  assert.equal(log.records[0]?.status, "retryable");
  assert.equal(log.records[0]?.harness.status, "retryable");
});

test("semantic ingestion requires a reviewed source snapshot before harness calls", async () => {
  await writeScopes();
  await writeCanarySource();
  const calls = installHarnessFetch();

  await assert.rejects(
    () =>
      semantic.queueOptaleBrainSemanticIngestion({
        cabinetPath: ".",
        sourcePath: "company-brain/canary",
        personalCabinetPath: "personal/thor",
        actor: ACTOR,
      }),
    /reviewed source manifest hash/,
  );

  const log = await semantic.readOptaleBrainSemanticOperationLog();
  assert.equal(log.counts.records, 0);
  assert.equal(calls.length, 0);
});

test("semantic ingestion rejects stale reviewed document hashes", async () => {
  await writeScopes();
  await writeCanarySource();
  const review = await reviewedSnapshot();
  const calls = installHarnessFetch();
  await fs.writeFile(
    path.join(tempRoot, "company-brain", "canary", "optale-console-canary.md"),
    "title: Optale Console Canary\n\n# Optale Console Canary\nChanged after review.\n",
  );

  await assert.rejects(
    () =>
      semantic.queueOptaleBrainSemanticIngestion({
        cabinetPath: ".",
        sourcePath: "company-brain/canary",
        personalCabinetPath: "personal/thor",
        review,
        actor: ACTOR,
      }),
    /document hash mismatch/,
  );

  const log = await semantic.readOptaleBrainSemanticOperationLog();
  assert.equal(log.counts.records, 0);
  assert.equal(calls.length, 0);
});

test("semantic ingestion records failure after request", async () => {
  await writeScopes();
  await writeCanarySource();
  installHarnessFetch("failure");
  const review = await reviewedSnapshot();

  await assert.rejects(
    () =>
      semantic.queueOptaleBrainSemanticIngestion({
        cabinetPath: ".",
        sourcePath: "company-brain/canary",
        personalCabinetPath: "personal/thor",
        review,
        actor: ACTOR,
      }),
    /Agent Harness request failed/,
  );

  const log = await semantic.readOptaleBrainSemanticOperationLog();
  assert.equal(log.counts.records, 2);
  assert.equal(log.counts.requested, 1);
  assert.equal(log.counts.failed, 1);
  assert.equal(log.records[0]?.action, "semantic_ingestion_failed");
});

test("semantic reset records requested and accepted states", async () => {
  const calls = installHarnessFetch();

  const record = await semantic.resetOptaleBrainSemanticCanary({
    datasetName: "optale-company-canary-test",
    actor: ACTOR,
  });
  const log = await semantic.readOptaleBrainSemanticOperationLog();

  assert.equal(record.action, "semantic_reset_accepted");
  assert.equal(record.status, "completed");
  assert.equal(record.harness.datasetName, "optale-company-canary-test");
  assert.equal(log.counts.records, 2);
  assert.equal(log.counts.completed, 1);
  assert.ok(calls.some((call) => call.includes("sense_delete_cognee_canary_dataset")));
});

test("semantic reset blocks non-canary datasets before harness calls", async () => {
  const calls = installHarnessFetch();
  await assert.rejects(
    () =>
      semantic.resetOptaleBrainSemanticCanary({
        datasetName: "optale-company",
        actor: ACTOR,
      }),
    /optale-company-canary/,
  );
  assert.equal(calls.length, 0);
});
