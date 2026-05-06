import fs from "fs/promises";
import path from "path";
import { CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";
import { ensureDirectory, fileExists, readFileContent } from "@/lib/storage/fs-operations";
import {
  readOptaleBrainIngestionPreflight,
  type OptaleBrainIngestionPreflightPayload,
} from "@/lib/optale/brain-ingestion-preflight";
import type { OptaleIdentitySnapshot } from "@/lib/optale/identity-shared";

export type OptaleBrainMountedVaultImportStatus = "recorded";

export interface OptaleBrainMountedVaultImportActor {
  subject: string;
  email: string | null;
  name: string | null;
  role: string;
  provider: string;
  source: string;
}

export interface OptaleBrainMountedVaultImportRecord {
  id: string;
  version: 1;
  action: "mounted_vault_import_recorded";
  status: OptaleBrainMountedVaultImportStatus;
  createdAt: string;
  actor: OptaleBrainMountedVaultImportActor;
  source: OptaleBrainIngestionPreflightPayload["source"];
  target: OptaleBrainIngestionPreflightPayload["target"];
  manifest: OptaleBrainIngestionPreflightPayload["manifest"];
  stats: OptaleBrainIngestionPreflightPayload["stats"];
  isolation: OptaleBrainIngestionPreflightPayload["isolation"];
  checks: OptaleBrainIngestionPreflightPayload["checks"];
  documents: OptaleBrainIngestionPreflightPayload["documents"];
  result: {
    visibleInMountedVault: true;
    semanticIngestion: false;
    cogneeIngestion: false;
    privateSourcesIncluded: false;
    personalToCompanyPromotion: false;
  };
}

export interface OptaleBrainMountedVaultImportLog {
  version: 1;
  generatedAt: string;
  records: OptaleBrainMountedVaultImportRecord[];
  counts: {
    records: number;
    documents: number;
  };
}

const DEFAULT_IMPORT_LOG_ROOT = path.join(CABINET_INTERNAL_DIR, "optale-console");
const IMPORT_LOG_FILE = "brain-mounted-vault-imports.jsonl";

function importLogRoot(): string {
  return process.env.OPTALE_BRAIN_IMPORT_AUDIT_ROOT || DEFAULT_IMPORT_LOG_ROOT;
}

function importLogPath(): string {
  return path.join(importLogRoot(), IMPORT_LOG_FILE);
}

function randomId(): string {
  const id = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `brain_import_${id}`;
}

function actorSnapshot(identity: OptaleIdentitySnapshot): OptaleBrainMountedVaultImportActor {
  return {
    subject: identity.subject || identity.email || "unknown",
    email: identity.email,
    name: identity.name,
    role: identity.role,
    provider: identity.provider,
    source: identity.source,
  };
}

function parseRecord(line: string): OptaleBrainMountedVaultImportRecord | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Partial<OptaleBrainMountedVaultImportRecord>;
    if (
      typeof record.id !== "string" ||
      record.version !== 1 ||
      record.action !== "mounted_vault_import_recorded"
    ) {
      return null;
    }
    return record as OptaleBrainMountedVaultImportRecord;
  } catch {
    return null;
  }
}

function validatePreflight(preflight: OptaleBrainIngestionPreflightPayload): void {
  if (preflight.source.cabinetPath !== ".") {
    throw new Error("Mounted-vault import v0 only supports the root company cabinet.");
  }
  if (preflight.target.scope !== "company") {
    throw new Error("Mounted-vault import v0 only supports company Brain targets.");
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
    throw new Error("Brain isolation gate must be green before mounted-vault import.");
  }
  if (!preflight.manifest.present) {
    throw new Error("Mounted-vault import requires a source manifest.");
  }
  if (preflight.documents.length === 0) {
    throw new Error("Mounted-vault import requires at least one markdown document.");
  }
}

export async function readOptaleBrainMountedVaultImportLog(input: {
  limit?: number | null;
} = {}): Promise<OptaleBrainMountedVaultImportLog> {
  const logPath = importLogPath();
  const limit = Math.max(1, Math.min(250, Math.trunc(input.limit || 50)));
  const content = (await fileExists(logPath)) ? await readFileContent(logPath) : "";
  const records = content
    .split(/\r?\n/)
    .map(parseRecord)
    .filter((record): record is OptaleBrainMountedVaultImportRecord => Boolean(record))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const limited = records.slice(0, limit);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    records: limited,
    counts: {
      records: records.length,
      documents: records.reduce((total, record) => total + record.documents.length, 0),
    },
  };
}

export async function recordOptaleBrainMountedVaultImport(input: {
  cabinetPath?: string | null;
  sourcePath?: string | null;
  personalCabinetPath?: string | null;
  actor: OptaleIdentitySnapshot;
}): Promise<OptaleBrainMountedVaultImportRecord> {
  const preflight = await readOptaleBrainIngestionPreflight({
    cabinetPath: input.cabinetPath,
    sourcePath: input.sourcePath,
    personalCabinetPath: input.personalCabinetPath,
  });
  validatePreflight(preflight);

  const record: OptaleBrainMountedVaultImportRecord = {
    id: randomId(),
    version: 1,
    action: "mounted_vault_import_recorded",
    status: "recorded",
    createdAt: new Date().toISOString(),
    actor: actorSnapshot(input.actor),
    source: preflight.source,
    target: preflight.target,
    manifest: preflight.manifest,
    stats: preflight.stats,
    isolation: preflight.isolation,
    checks: preflight.checks,
    documents: preflight.documents,
    result: {
      visibleInMountedVault: true,
      semanticIngestion: false,
      cogneeIngestion: false,
      privateSourcesIncluded: false,
      personalToCompanyPromotion: false,
    },
  };

  await ensureDirectory(importLogRoot());
  await fs.appendFile(importLogPath(), `${JSON.stringify(record)}\n`, "utf8");
  return record;
}
