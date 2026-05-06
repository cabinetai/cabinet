import type { Dirent } from "fs";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import { isHiddenEntry } from "@/lib/storage/path-utils";
import { resolveOptaleBrainContext } from "@/lib/optale/brain-context";
import { readOptaleBrainIsolationStatus } from "@/lib/optale/brain-isolation";
import {
  readCabinetOptaleScope,
  type OptaleCabinetScopeMetadata,
} from "@/lib/optale/scope-registry";

export type OptaleBrainIngestionPreflightStatus = "green" | "yellow" | "red";

export interface OptaleBrainIngestionPreflightCheck {
  id: string;
  label: string;
  status: OptaleBrainIngestionPreflightStatus;
  message: string;
}

export interface OptaleBrainIngestionPreflightDocument {
  kind: "markdown";
  path: string;
  title: string;
  size: number;
  sha256: string;
  updatedAt: string;
}

export interface OptaleBrainIngestionPreflightPayload {
  version: 1;
  generatedAt: string;
  dryRunOnly: true;
  readyForReview: boolean;
  source: {
    cabinetPath: string;
    sourcePath: string;
    virtualRoot: string;
    allowlistStatus: "allowed" | "blocked";
    allowlistReason: string;
  };
  target: {
    scope: OptaleCabinetScopeMetadata["scope"];
    scopeSource: OptaleCabinetScopeMetadata["source"];
    companyId?: string;
    userId?: string;
    memoryNamespace: string;
    graphNamespace: string;
    entityNamespace: string;
    vaultNamespace: string;
    qmdProfile: string;
    companyBrainTargetId?: string;
  };
  manifest: {
    present: boolean;
    path?: string;
    sha256?: string;
    size?: number;
  };
  stats: {
    filesScanned: number;
    markdownFiles: number;
    totalBytes: number;
    maxFiles: number;
  };
  isolation: {
    readyForIngestion: boolean;
    redChecks: string[];
    yellowChecks: string[];
  };
  checks: OptaleBrainIngestionPreflightCheck[];
  documents: OptaleBrainIngestionPreflightDocument[];
}

const DEFAULT_PERSONAL_CABINET_PATH = "personal/thor";
const MAX_PREFLIGHT_FILES = 100;
const MAX_PREFLIGHT_FILE_BYTES = 512 * 1024;
const ROOT_COMPANY_ALLOWLIST = new Set([
  "company-brain",
  "shared-company",
  "company",
]);

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSourcePath(value: unknown): string {
  const trimmed = trimString(value) || "";
  return trimmed
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function virtualPath(cabinetPath: string, sourcePath: string, relativePath = ""): string {
  const parts = [cabinetPath === ROOT_CABINET_PATH ? "" : cabinetPath, sourcePath, relativePath]
    .filter(Boolean)
    .join("/");
  return parts.replace(/\/+/g, "/") || ROOT_CABINET_PATH;
}

function check(
  id: string,
  label: string,
  status: OptaleBrainIngestionPreflightStatus,
  message: string,
): OptaleBrainIngestionPreflightCheck {
  return { id, label, status, message };
}

function titleFromContent(content: string, fallback: string): string {
  const frontmatter = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  if (frontmatter?.[1]?.trim()) return frontmatter[1].trim();
  const heading = content.match(/^#\s+(.+?)\s*$/m);
  if (heading?.[1]?.trim()) return heading[1].trim();
  return fallback.replace(/\.md$/i, "").replace(/[-_]+/g, " ");
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function allowlistFor(input: {
  cabinetPath: string;
  scope: OptaleCabinetScopeMetadata["scope"];
  sourcePath: string;
}): { status: "allowed" | "blocked"; reason: string } {
  if (input.sourcePath.split("/").some((segment) => segment === "..")) {
    return {
      status: "blocked",
      reason: "Source path cannot contain parent-directory segments.",
    };
  }

  if (input.scope === "company" && input.cabinetPath === ROOT_CABINET_PATH) {
    const firstSegment = input.sourcePath.split("/").filter(Boolean)[0];
    if (!firstSegment || !ROOT_COMPANY_ALLOWLIST.has(firstSegment)) {
      return {
        status: "blocked",
        reason: "Root company preflight is limited to company-brain, shared-company, or company paths.",
      };
    }
  }

  if (input.scope === "system") {
    return {
      status: "blocked",
      reason: "System-scoped cabinets are not ingestion targets.",
    };
  }

  return {
    status: "allowed",
    reason: "Source path is within the allowed Brain ingestion preflight boundary.",
  };
}

async function scanPreflightFiles(input: {
  dir: string;
  baseDir: string;
  cabinetPath: string;
  sourcePath: string;
  filesScanned: { count: number };
  documents: OptaleBrainIngestionPreflightDocument[];
}): Promise<{ totalBytes: number; manifest?: OptaleBrainIngestionPreflightPayload["manifest"] }> {
  let totalBytes = 0;
  let manifest: OptaleBrainIngestionPreflightPayload["manifest"] | undefined;
  let entries: Dirent[];

  try {
    entries = await fs.readdir(input.dir, { withFileTypes: true });
  } catch {
    return { totalBytes };
  }

  for (const entry of entries) {
    if (input.filesScanned.count >= MAX_PREFLIGHT_FILES) break;
    if (isHiddenEntry(entry.name)) continue;

    const fullPath = path.join(input.dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await scanPreflightFiles({ ...input, dir: fullPath });
      totalBytes += nested.totalBytes;
      manifest ||= nested.manifest;
      continue;
    }
    if (!entry.isFile()) continue;

    input.filesScanned.count += 1;
    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat) continue;
    totalBytes += stat.size;

    const relativePath = path.relative(input.baseDir, fullPath).replace(/\\/g, "/");
    if (entry.name === "manifest.json") {
      const content = await fs.readFile(fullPath).catch(() => null);
      if (content) {
        manifest = {
          present: true,
          path: virtualPath(input.cabinetPath, input.sourcePath, relativePath),
          sha256: sha256(content),
          size: stat.size,
        };
      }
      continue;
    }

    if (!entry.name.toLowerCase().endsWith(".md")) continue;
    if (stat.size > MAX_PREFLIGHT_FILE_BYTES) continue;

    const content = await fs.readFile(fullPath, "utf8").catch(() => "");
    input.documents.push({
      kind: "markdown",
      path: virtualPath(input.cabinetPath, input.sourcePath, relativePath),
      title: titleFromContent(content, entry.name),
      size: stat.size,
      sha256: sha256(content),
      updatedAt: stat.mtime.toISOString(),
    });
  }

  return { totalBytes, manifest };
}

export async function readOptaleBrainIngestionPreflight(input: {
  cabinetPath?: string | null;
  sourcePath?: string | null;
  personalCabinetPath?: string | null;
} = {}): Promise<OptaleBrainIngestionPreflightPayload> {
  const cabinetPath =
    normalizeCabinetPath(input.cabinetPath, true) || ROOT_CABINET_PATH;
  const sourcePath = normalizeSourcePath(input.sourcePath);
  const personalCabinetPath =
    trimString(input.personalCabinetPath) || DEFAULT_PERSONAL_CABINET_PATH;

  const scope = await readCabinetOptaleScope(cabinetPath);
  const context = await resolveOptaleBrainContext(cabinetPath, scope);
  const allowlist = allowlistFor({ cabinetPath, scope: scope.scope, sourcePath });
  const cabinetDir = resolveCabinetDir(cabinetPath);
  const scanRoot = path.resolve(cabinetDir, sourcePath || ".");
  const scanInsideCabinet = isPathInside(cabinetDir, scanRoot);
  const documents: OptaleBrainIngestionPreflightDocument[] = [];
  const filesScanned = { count: 0 };
  const scan =
    allowlist.status === "allowed" && scanInsideCabinet
      ? await scanPreflightFiles({
          dir: scanRoot,
          baseDir: scanRoot,
          cabinetPath,
          sourcePath,
          filesScanned,
          documents,
        })
      : { totalBytes: 0 };
  const isolation = await readOptaleBrainIsolationStatus({
    companyCabinetPath: ROOT_CABINET_PATH,
    personalCabinetPath,
  });

  const redChecks = isolation.checks
    .filter((entry) => entry.status === "red")
    .map((entry) => entry.id);
  const yellowChecks = isolation.checks
    .filter((entry) => entry.status === "yellow")
    .map((entry) => entry.id);
  const checks: OptaleBrainIngestionPreflightCheck[] = [
    check(
      "source-allowlist",
      "Source allowlist",
      allowlist.status === "allowed" && scanInsideCabinet ? "green" : "red",
      scanInsideCabinet ? allowlist.reason : "Resolved source path escapes its cabinet.",
    ),
    check(
      "target-scope",
      "Target scope",
      scope.scope === "company" || scope.scope === "personal" ? "green" : "red",
      scope.scope === "company" || scope.scope === "personal"
        ? `Target is ${scope.scope}-scoped.`
        : "Target must be company or personal scoped.",
    ),
    check(
      "isolation-gate",
      "Isolation gate",
      isolation.readyForIngestion ? "green" : "red",
      isolation.readyForIngestion
        ? "Company and personal Brain isolation gate is green."
        : "Isolation gate must be green before ingestion review.",
    ),
    check(
      "markdown-documents",
      "Markdown documents",
      documents.length > 0 ? "green" : "yellow",
      documents.length > 0
        ? `${documents.length} markdown documents are in the dry-run manifest.`
        : "No markdown documents found in this source path.",
    ),
    check(
      "manifest",
      "Manifest",
      scan.manifest?.present ? "green" : "yellow",
      scan.manifest?.present
        ? "Source manifest is present."
        : "Source manifest is missing; add one before real ingestion.",
    ),
  ];

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    dryRunOnly: true,
    readyForReview: checks.every((entry) => entry.status !== "red"),
    source: {
      cabinetPath,
      sourcePath,
      virtualRoot: virtualPath(cabinetPath, sourcePath),
      allowlistStatus: allowlist.status,
      allowlistReason: allowlist.reason,
    },
    target: {
      scope: scope.scope,
      scopeSource: scope.source,
      companyId: scope.companyId,
      userId: scope.userId,
      memoryNamespace: context.memoryNamespace,
      graphNamespace: context.graphNamespace,
      entityNamespace: context.entityNamespace,
      vaultNamespace: context.vaultNamespace,
      qmdProfile: context.qmdProfile,
      companyBrainTargetId: context.companyBrainTargetId,
    },
    manifest: scan.manifest || { present: false },
    stats: {
      filesScanned: filesScanned.count,
      markdownFiles: documents.length,
      totalBytes: scan.totalBytes,
      maxFiles: MAX_PREFLIGHT_FILES,
    },
    isolation: {
      readyForIngestion: isolation.readyForIngestion,
      redChecks,
      yellowChecks,
    },
    checks,
    documents: documents.sort((left, right) => left.path.localeCompare(right.path)),
  };
}
