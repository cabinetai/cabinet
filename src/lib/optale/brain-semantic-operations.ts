import fs from "fs/promises";
import path from "path";
import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import { CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";
import { ensureDirectory, fileExists, readFileContent } from "@/lib/storage/fs-operations";
import {
  readOptaleBrainIngestionPreflight,
  type OptaleBrainIngestionPreflightDocument,
  type OptaleBrainIngestionPreflightPayload,
} from "@/lib/optale/brain-ingestion-preflight";
import type { OptaleIdentitySnapshot } from "@/lib/optale/identity-shared";

export type OptaleBrainSemanticOperationAction =
  | "semantic_ingestion_requested"
  | "semantic_ingestion_accepted"
  | "semantic_ingestion_running"
  | "semantic_ingestion_retryable"
  | "semantic_ingestion_completed"
  | "semantic_ingestion_cancelled"
  | "semantic_ingestion_failed"
  | "semantic_reset_requested"
  | "semantic_reset_accepted"
  | "semantic_reset_failed";
export type OptaleBrainSemanticOperationStatus =
  | "requested"
  | "queued"
  | "running"
  | "retryable"
  | "completed"
  | "failed"
  | "cancelled";

export interface OptaleBrainSemanticOperationActor {
  subject: string;
  email: string | null;
  name: string | null;
  role: string;
  provider: string;
  source: string;
}

export interface OptaleBrainSemanticHarnessCall {
  tool: string;
  status: string;
  approvalRequestId?: string;
  checkpointId?: string;
  ingestionJobId?: string;
  datasetName: string;
  sourceRef?: string;
  error?: string;
  output?: unknown;
}

export interface OptaleBrainSemanticReviewSnapshot {
  sourcePath: string;
  virtualRoot: string;
  manifestSha256: string;
  documentCount: number;
  documentSha256s: string[];
}

export interface OptaleBrainSemanticOperationRecord {
  id: string;
  version: 1;
  action: OptaleBrainSemanticOperationAction;
  status: OptaleBrainSemanticOperationStatus;
  createdAt: string;
  actor: OptaleBrainSemanticOperationActor;
  source: OptaleBrainIngestionPreflightPayload["source"] | null;
  target: OptaleBrainIngestionPreflightPayload["target"] | null;
  manifest: OptaleBrainIngestionPreflightPayload["manifest"] | null;
  stats: OptaleBrainIngestionPreflightPayload["stats"] | null;
  documents: OptaleBrainIngestionPreflightDocument[];
  review?: OptaleBrainSemanticReviewSnapshot | null;
  harness: OptaleBrainSemanticHarnessCall;
  result: {
    visibleInMountedVault: boolean;
    semanticIngestion: boolean;
    cogneeIngestion: boolean;
    privateSourcesIncluded: false;
    personalToCompanyPromotion: false;
  };
}

export interface OptaleBrainSemanticOperationLog {
  version: 1;
  generatedAt: string;
  records: OptaleBrainSemanticOperationRecord[];
  counts: {
    records: number;
    requested: number;
    queued: number;
    running: number;
    retryable: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
}

interface HarnessInvokeResult {
  status: string;
  output?: Record<string, unknown>;
}

interface HarnessPipelineResult {
  status: string;
  output?: Record<string, unknown>;
  approvalRequestId?: string;
  checkpointId?: string;
}

interface OptaleBrainSemanticReviewInput {
  manifestSha256?: string | null;
  documentCount?: number | null;
  documentSha256s?: string[] | null;
  sourcePath?: string | null;
  virtualRoot?: string | null;
}

const DEFAULT_OPERATION_ROOT = path.join(CABINET_INTERNAL_DIR, "optale-console");
const OPERATION_LOG_FILE = "brain-semantic-operations.jsonl";
const DEFAULT_BRANCH_ID = "018f0000-0000-7000-8000-000000000999";
const DEFAULT_CANARY_DATASET = "optale-company-canary-2026-05-05-7bc0cd10";
const MAX_SEMANTIC_CONTENT_BYTES = 1_500_000;

function operationRoot(): string {
  return process.env.OPTALE_BRAIN_SEMANTIC_AUDIT_ROOT || DEFAULT_OPERATION_ROOT;
}

function operationLogPath(): string {
  return path.join(operationRoot(), OPERATION_LOG_FILE);
}

function randomId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}_${id}`;
}

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function actorSnapshot(identity: OptaleIdentitySnapshot): OptaleBrainSemanticOperationActor {
  return {
    subject: identity.subject || identity.email || "unknown",
    email: identity.email,
    name: identity.name,
    role: identity.role,
    provider: identity.provider,
    source: identity.source,
  };
}

function parseRecord(line: string): OptaleBrainSemanticOperationRecord | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Partial<OptaleBrainSemanticOperationRecord>;
    if (
      typeof record.id !== "string" ||
      record.version !== 1 ||
      (record.action !== "semantic_ingestion_requested" &&
        record.action !== "semantic_ingestion_accepted" &&
        record.action !== "semantic_ingestion_running" &&
        record.action !== "semantic_ingestion_retryable" &&
        record.action !== "semantic_ingestion_completed" &&
        record.action !== "semantic_ingestion_cancelled" &&
        record.action !== "semantic_ingestion_failed" &&
        record.action !== "semantic_reset_requested" &&
        record.action !== "semantic_reset_accepted" &&
        record.action !== "semantic_reset_failed")
    ) {
      return null;
    }
    return record as OptaleBrainSemanticOperationRecord;
  } catch {
    return null;
  }
}

function validatePreflight(preflight: OptaleBrainIngestionPreflightPayload): void {
  if (preflight.source.cabinetPath !== ROOT_CABINET_PATH) {
    throw new Error("Semantic ingestion v0 only supports the root company cabinet.");
  }
  if (preflight.target.scope !== "company") {
    throw new Error("Semantic ingestion v0 only supports company Brain targets.");
  }
  if (preflight.source.allowlistStatus !== "allowed") {
    throw new Error(preflight.source.allowlistReason || "Source path is not allowlisted.");
  }
  if (!preflight.readyForReview) {
    const red = preflight.checks
      .filter((entry) => entry.status === "red")
      .map((entry) => entry.id)
      .join(", ");
    throw new Error(red ? `Preflight has red checks: ${red}` : "Preflight is not ready.");
  }
  if (!preflight.isolation.readyForIngestion) {
    throw new Error("Brain isolation gate must be green before semantic ingestion.");
  }
  if (!preflight.manifest.present) {
    throw new Error("Semantic ingestion requires a source manifest.");
  }
  if (preflight.documents.length === 0) {
    throw new Error("Semantic ingestion requires at least one markdown document.");
  }
}

function validateReviewSnapshot(
  preflight: OptaleBrainIngestionPreflightPayload,
  review: OptaleBrainSemanticReviewInput | null | undefined,
): OptaleBrainSemanticReviewSnapshot {
  const reviewedManifest = trimString(review?.manifestSha256);
  const currentManifest = trimString(preflight.manifest.sha256);
  if (!reviewedManifest || !currentManifest || reviewedManifest !== currentManifest) {
    throw new Error("Semantic ingestion requires the reviewed source manifest hash.");
  }

  if (review?.documentCount !== preflight.documents.length) {
    throw new Error("Semantic ingestion source changed since review: document count mismatch.");
  }

  const reviewedHashes = normalizeHashList(review?.documentSha256s);
  const currentHashes = normalizeHashList(preflight.documents.map((document) => document.sha256));
  if (!sameStringList(reviewedHashes, currentHashes)) {
    throw new Error("Semantic ingestion source changed since review: document hash mismatch.");
  }

  const reviewedSourcePath = trimString(review?.sourcePath);
  if (!reviewedSourcePath || reviewedSourcePath !== preflight.source.sourcePath) {
    throw new Error("Semantic ingestion requires the reviewed source path.");
  }

  const reviewedVirtualRoot = trimString(review?.virtualRoot);
  if (!reviewedVirtualRoot || reviewedVirtualRoot !== preflight.source.virtualRoot) {
    throw new Error("Semantic ingestion requires the reviewed virtual root.");
  }

  return {
    sourcePath: preflight.source.sourcePath,
    virtualRoot: preflight.source.virtualRoot,
    manifestSha256: currentManifest,
    documentCount: preflight.documents.length,
    documentSha256s: preflight.documents.map((document) => document.sha256).sort(),
  };
}

function normalizeHashList(values: unknown): string[] {
  return Array.isArray(values)
    ? values
        .map(trimString)
        .filter((value): value is string => Boolean(value))
        .sort()
    : [];
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function datasetNameFor(preflight: OptaleBrainIngestionPreflightPayload): string {
  return (
    preflight.target.companyBrainTargetId ||
    `company-${slugSegment(preflight.target.companyId || "brain")}`
  );
}

function slugSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "brain";
}

async function readSemanticContent(
  preflight: OptaleBrainIngestionPreflightPayload,
): Promise<string> {
  const cabinetDir = resolveCabinetDir(preflight.source.cabinetPath);
  const chunks: string[] = [];
  let totalBytes = 0;

  for (const document of preflight.documents) {
    const normalizedPath = normalizeCabinetPath(document.path, false);
    if (!normalizedPath) continue;

    const fullPath = path.resolve(cabinetDir, normalizedPath);
    const relative = path.relative(cabinetDir, fullPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Semantic document escapes cabinet: ${document.path}`);
    }

    const content = await fs.readFile(fullPath, "utf8");
    totalBytes += Buffer.byteLength(content);
    if (totalBytes > MAX_SEMANTIC_CONTENT_BYTES) {
      throw new Error("Semantic ingestion source is too large for the v0 control path.");
    }

    chunks.push(
      [
        `# ${document.title}`,
        `Source: ${document.path}`,
        `SHA-256: ${document.sha256}`,
        "",
        content.trim(),
      ].join("\n"),
    );
  }

  if (chunks.length === 0) {
    throw new Error("Semantic ingestion found no readable markdown documents.");
  }

  return chunks.join("\n\n---\n\n");
}

function harnessBaseUrl(): string {
  return (process.env.OPTALE_AGENT_HARNESS_URL || "http://127.0.0.1:8787")
    .trim()
    .replace(/\/+$/, "");
}

function harnessControlKey(): string {
  const key =
    process.env.OPTALE_AGENT_HARNESS_CONTROL_API_KEY ||
    process.env.OPTALE_AGENT_HARNESS_ADMIN_API_KEY;
  if (!key?.trim()) {
    throw new Error("Agent Harness control key is not configured.");
  }
  return key.trim();
}

function harnessAuthHeaders(): Record<string, string> {
  const header = (
    process.env.OPTALE_AGENT_HARNESS_CONTROL_AUTH_HEADER ||
    process.env.OPTALE_AGENT_HARNESS_AUTH_HEADER ||
    "authorization"
  )
    .trim()
    .toLowerCase();
  const key = harnessControlKey();
  if (header === "x-harness-api-key") {
    return { "X-Harness-API-Key": key };
  }
  return { Authorization: `Bearer ${key}` };
}

async function harnessRequest(
  method: string,
  pathname: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${harnessBaseUrl()}${pathname}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...harnessAuthHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(
      `Agent Harness request failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return payload || {};
}

function nestedId(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const nested = record[key];
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return undefined;
  return trimString((nested as Record<string, unknown>).id);
}

async function runGovernedHarnessTool(input: {
  tool: string;
  arguments: Record<string, unknown>;
  checkpointNote: string;
}): Promise<HarnessPipelineResult> {
  const invokePath = `/tools/${encodeURIComponent(input.tool)}/invoke`;
  const baseBody = {
    branchId: DEFAULT_BRANCH_ID,
    arguments: input.arguments,
  };

  const first = (await harnessRequest(
    "POST",
    invokePath,
    baseBody,
  )) as unknown as HarnessInvokeResult;
  const approvalRequestId = nestedId(first.output, "approvalRequest");
  if (!approvalRequestId) {
    throw new Error(`Agent Harness did not return an approval request for ${input.tool}.`);
  }

  await harnessRequest("POST", `/approval-requests/${approvalRequestId}/review`, {
    status: "approved",
  });

  const second = (await harnessRequest("POST", invokePath, {
    ...baseBody,
    approvalRequestId,
  })) as unknown as HarnessInvokeResult;
  const checkpointId = nestedId(second.output, "checkpoint");
  if (!checkpointId) {
    throw new Error(`Agent Harness did not return a checkpoint for ${input.tool}.`);
  }

  await harnessRequest("POST", `/checkpoints/${checkpointId}/review`, {
    status: "satisfied",
    note: input.checkpointNote,
  });

  const final = (await harnessRequest("POST", invokePath, {
    ...baseBody,
    approvalRequestId,
    checkpointId,
  })) as unknown as HarnessInvokeResult;

  return {
    status: final.status,
    output: final.output,
    approvalRequestId,
    checkpointId,
  };
}

function outputString(output: Record<string, unknown> | undefined, key: string): string | undefined {
  return output ? trimString(output[key]) : undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function appendRecord(
  record: OptaleBrainSemanticOperationRecord,
): Promise<OptaleBrainSemanticOperationRecord> {
  await ensureDirectory(operationRoot());
  await fs.appendFile(operationLogPath(), `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

async function readSemanticOperationRecords(): Promise<OptaleBrainSemanticOperationRecord[]> {
  const logPath = operationLogPath();
  const content = (await fileExists(logPath)) ? await readFileContent(logPath) : "";
  return content
    .split(/\r?\n/)
    .map((line, index) => ({ record: parseRecord(line), index }))
    .filter(
      (
        entry,
      ): entry is { record: OptaleBrainSemanticOperationRecord; index: number } =>
        Boolean(entry.record),
    )
    .sort(
      (left, right) =>
        Date.parse(right.record.createdAt) - Date.parse(left.record.createdAt) ||
        right.index - left.index,
    )
    .map((entry) => entry.record);
}

export async function readOptaleBrainSemanticOperationLog(input: {
  limit?: number | null;
} = {}): Promise<OptaleBrainSemanticOperationLog> {
  const limit = Math.max(1, Math.min(250, Math.trunc(input.limit || 50)));
  const records = await readSemanticOperationRecords();
  const limited = records.slice(0, limit);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    records: limited,
    counts: {
      records: records.length,
      requested: records.filter((record) => record.status === "requested").length,
      queued: records.filter((record) => record.status === "queued").length,
      running: records.filter((record) => record.status === "running").length,
      retryable: records.filter((record) => record.status === "retryable").length,
      completed: records.filter((record) => record.status === "completed").length,
      failed: records.filter((record) => record.status === "failed").length,
      cancelled: records.filter((record) => record.status === "cancelled").length,
    },
  };
}

export async function refreshOptaleBrainSemanticOperationStatuses(input: {
  limit?: number | null;
} = {}): Promise<{ checked: number; appended: number }> {
  const records = await readSemanticOperationRecords();
  const latestById = new Map<string, OptaleBrainSemanticOperationRecord>();
  for (const record of records) {
    if (!latestById.has(record.id)) latestById.set(record.id, record);
  }

  const openIngestions = Array.from(latestById.values())
    .filter(
      (record) =>
        record.harness.tool === "sense_ingest_document" &&
        Boolean(record.harness.ingestionJobId) &&
        !isSemanticTerminalStatus(record.status),
    )
    .slice(0, Math.max(1, Math.min(25, Math.trunc(input.limit || 10))));

  let appended = 0;
  for (const record of openIngestions) {
    const job = await readHarnessIngestionJob(record.harness.ingestionJobId as string);
    const update = semanticStatusRecordForJob(record, job);
    if (!update) continue;
    await appendRecord(update);
    appended += 1;
  }

  return { checked: openIngestions.length, appended };
}

async function readHarnessIngestionJob(id: string): Promise<Record<string, unknown>> {
  const payload = await harnessRequest("GET", `/ingestion-jobs/${encodeURIComponent(id)}`);
  const job = asObject(payload.ingestionJob);
  if (!job) {
    throw new Error(`Agent Harness did not return ingestion job ${id}.`);
  }
  return job;
}

function semanticStatusRecordForJob(
  record: OptaleBrainSemanticOperationRecord,
  job: Record<string, unknown>,
): OptaleBrainSemanticOperationRecord | null {
  const harnessStatus = trimString(job.status);
  const operationStatus = semanticStatusForHarnessJob(harnessStatus);
  const action = semanticActionForOperationStatus(operationStatus);
  if (!operationStatus || !action) return null;

  if (record.status === operationStatus && record.harness.status === harnessStatus) {
    return null;
  }

  const lastError = trimString(job.last_error);
  return {
    ...record,
    action,
    status: operationStatus,
    createdAt: new Date().toISOString(),
    harness: {
      ...record.harness,
      status: harnessStatus || operationStatus,
      datasetName:
        trimString(job.dataset_name) || trimString(job.datasetName) || record.harness.datasetName,
      sourceRef: trimString(job.source_ref) || trimString(job.sourceRef) || record.harness.sourceRef,
      error: lastError || record.harness.error,
      output: { ingestionJob: job },
    },
    result: {
      ...record.result,
      cogneeIngestion: operationStatus === "completed",
    },
  };
}

function semanticStatusForHarnessJob(
  status: string | undefined,
): OptaleBrainSemanticOperationStatus | null {
  if (!status || status === "pending") return "queued";
  if (status === "running") return "running";
  if (status === "retryable") return "retryable";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "failed" || status === "dead_letter") return "failed";
  return null;
}

function semanticActionForOperationStatus(
  status: OptaleBrainSemanticOperationStatus | null,
): OptaleBrainSemanticOperationAction | null {
  if (status === "running") return "semantic_ingestion_running";
  if (status === "retryable") return "semantic_ingestion_retryable";
  if (status === "completed") return "semantic_ingestion_completed";
  if (status === "cancelled") return "semantic_ingestion_cancelled";
  if (status === "failed") return "semantic_ingestion_failed";
  return null;
}

function isSemanticTerminalStatus(status: OptaleBrainSemanticOperationStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export async function queueOptaleBrainSemanticIngestion(input: {
  cabinetPath?: string | null;
  sourcePath?: string | null;
  personalCabinetPath?: string | null;
  review?: OptaleBrainSemanticReviewInput | null;
  actor: OptaleIdentitySnapshot;
}): Promise<OptaleBrainSemanticOperationRecord> {
  const preflight = await readOptaleBrainIngestionPreflight({
    cabinetPath: input.cabinetPath,
    sourcePath: input.sourcePath,
    personalCabinetPath: input.personalCabinetPath,
  });
  validatePreflight(preflight);
  const review = validateReviewSnapshot(preflight, input.review);

  const id = randomId("brain_semantic");
  const datasetName = datasetNameFor(preflight);
  const sourceRef = `vault://${preflight.source.virtualRoot}`;
  const actor = actorSnapshot(input.actor);

  await appendRecord({
    id,
    version: 1,
    action: "semantic_ingestion_requested",
    status: "requested",
    createdAt: new Date().toISOString(),
    actor,
    source: preflight.source,
    target: preflight.target,
    manifest: preflight.manifest,
    stats: preflight.stats,
    documents: preflight.documents,
    review,
    harness: {
      tool: "sense_ingest_document",
      status: "requested",
      datasetName,
      sourceRef,
    },
    result: {
      visibleInMountedVault: true,
      semanticIngestion: true,
      cogneeIngestion: true,
      privateSourcesIncluded: false,
      personalToCompanyPromotion: false,
    },
  });

  try {
    const content = await readSemanticContent(preflight);
    const harness = await runGovernedHarnessTool({
      tool: "sense_ingest_document",
      arguments: {
        sourceRef,
        content,
        datasetName,
        customPrompt:
          "Extract durable company Brain knowledge only. Preserve source paths and ignore private or personal material.",
      },
      checkpointNote: `Console semantic ingestion for ${preflight.source.virtualRoot}.`,
    });
    const ingestionJobId = outputString(harness.output, "ingestionJobId");

    return appendRecord({
      id,
      version: 1,
      action: "semantic_ingestion_accepted",
      status: "queued",
      createdAt: new Date().toISOString(),
      actor,
      source: preflight.source,
      target: preflight.target,
      manifest: preflight.manifest,
      stats: preflight.stats,
      documents: preflight.documents,
      review,
      harness: {
        tool: "sense_ingest_document",
        status: harness.status,
        approvalRequestId: harness.approvalRequestId,
        checkpointId: harness.checkpointId,
        ingestionJobId,
        datasetName,
        sourceRef,
        output: harness.output,
      },
      result: {
        visibleInMountedVault: true,
        semanticIngestion: true,
        cogneeIngestion: true,
        privateSourcesIncluded: false,
        personalToCompanyPromotion: false,
      },
    });
  } catch (error) {
    await appendRecord({
      id,
      version: 1,
      action: "semantic_ingestion_failed",
      status: "failed",
      createdAt: new Date().toISOString(),
      actor,
      source: preflight.source,
      target: preflight.target,
      manifest: preflight.manifest,
      stats: preflight.stats,
      documents: preflight.documents,
      review,
      harness: {
        tool: "sense_ingest_document",
        status: "failed",
        datasetName,
        sourceRef,
        error: errorMessage(error),
      },
      result: {
        visibleInMountedVault: true,
        semanticIngestion: true,
        cogneeIngestion: false,
        privateSourcesIncluded: false,
        personalToCompanyPromotion: false,
      },
    });
    throw error;
  }
}

export async function resetOptaleBrainSemanticCanary(input: {
  datasetName?: string | null;
  actor: OptaleIdentitySnapshot;
}): Promise<OptaleBrainSemanticOperationRecord> {
  const datasetName =
    trimString(input.datasetName) ||
    trimString(process.env.OPTALE_BRAIN_CANARY_DATASET_NAME) ||
    DEFAULT_CANARY_DATASET;
  if (!datasetName.startsWith("optale-company-canary-")) {
    throw new Error("Canary reset only supports optale-company-canary-* datasets.");
  }

  const id = randomId("brain_reset");
  const actor = actorSnapshot(input.actor);
  await appendRecord({
    id,
    version: 1,
    action: "semantic_reset_requested",
    status: "requested",
    createdAt: new Date().toISOString(),
    actor,
    source: null,
    target: null,
    manifest: null,
    stats: null,
    documents: [],
    harness: {
      tool: "sense_delete_cognee_canary_dataset",
      status: "requested",
      datasetName,
    },
    result: {
      visibleInMountedVault: false,
      semanticIngestion: false,
      cogneeIngestion: true,
      privateSourcesIncluded: false,
      personalToCompanyPromotion: false,
    },
  });

  try {
    const harness = await runGovernedHarnessTool({
      tool: "sense_delete_cognee_canary_dataset",
      arguments: { datasetName },
      checkpointNote: `Console canary reset for ${datasetName}.`,
    });
    if (harness.status !== "completed") {
      throw new Error(`Canary reset did not complete: ${harness.status}`);
    }

    return appendRecord({
      id,
      version: 1,
      action: "semantic_reset_accepted",
      status: "completed",
      createdAt: new Date().toISOString(),
      actor,
      source: null,
      target: null,
      manifest: null,
      stats: null,
      documents: [],
      harness: {
        tool: "sense_delete_cognee_canary_dataset",
        status: harness.status,
        approvalRequestId: harness.approvalRequestId,
        checkpointId: harness.checkpointId,
        datasetName,
        output: harness.output,
      },
      result: {
        visibleInMountedVault: false,
        semanticIngestion: false,
        cogneeIngestion: true,
        privateSourcesIncluded: false,
        personalToCompanyPromotion: false,
      },
    });
  } catch (error) {
    await appendRecord({
      id,
      version: 1,
      action: "semantic_reset_failed",
      status: "failed",
      createdAt: new Date().toISOString(),
      actor,
      source: null,
      target: null,
      manifest: null,
      stats: null,
      documents: [],
      harness: {
        tool: "sense_delete_cognee_canary_dataset",
        status: "failed",
        datasetName,
        error: errorMessage(error),
      },
      result: {
        visibleInMountedVault: false,
        semanticIngestion: false,
        cogneeIngestion: false,
        privateSourcesIncluded: false,
        personalToCompanyPromotion: false,
      },
    });
    throw error;
  }
}
