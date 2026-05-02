import path from "path";
import type { OptaleAgentScope } from "./product";
import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import {
  ensureDirectory,
  fileExists,
  readFileContent,
  writeFileContent,
} from "@/lib/storage/fs-operations";

export type OptaleScopeSource = "explicit" | "inferred" | "inherited";

export interface OptaleScopeMetadata {
  scope: OptaleAgentScope;
  source: OptaleScopeSource;
  ownerId?: string;
  companyId?: string;
  userId?: string;
  policyId?: string;
  memoryNamespace?: string;
  companyBrainTargetId?: string;
  labels?: string[];
  updatedAt?: string;
}

export interface OptaleCabinetScopeMetadata extends OptaleScopeMetadata {
  cabinetPath: string;
}

export interface OptaleAgentScopeMetadata extends OptaleScopeMetadata {
  agentSlug: string;
  cabinetPath?: string;
  inheritedFromCabinet?: boolean;
}

const OPTALE_SCOPE_DIR = ".optale";
const OPTALE_SCOPE_FILE = "scope.json";
const VALID_SCOPES = new Set<OptaleAgentScope>(["company", "personal", "system"]);

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeLabels(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const labels = value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    .map((entry) => entry.trim());
  return labels.length > 0 ? Array.from(new Set(labels)) : undefined;
}

export function normalizeOptaleScope(value: unknown): OptaleAgentScope | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return VALID_SCOPES.has(trimmed as OptaleAgentScope)
    ? (trimmed as OptaleAgentScope)
    : undefined;
}

export function inferCabinetOptaleScope(cabinetPath?: string | null): OptaleAgentScope {
  const normalized = normalizeCabinetPath(cabinetPath, true) || ROOT_CABINET_PATH;
  if (normalized === ROOT_CABINET_PATH) return "system";
  if (/^(personal|people|users)\//i.test(normalized)) return "personal";
  if (/^system\//i.test(normalized) || /^\.?optale-system$/i.test(normalized)) {
    return "system";
  }
  return "company";
}

function parseScopeMetadata(
  raw: unknown,
  fallbackScope: OptaleAgentScope,
  source: OptaleScopeSource
): OptaleScopeMetadata {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scope = normalizeOptaleScope(record.scope) || fallbackScope;

  return {
    scope,
    source,
    ownerId: trimString(record.ownerId),
    companyId: trimString(record.companyId),
    userId: trimString(record.userId),
    policyId: trimString(record.policyId),
    memoryNamespace: trimString(record.memoryNamespace),
    companyBrainTargetId: trimString(record.companyBrainTargetId),
    labels: normalizeLabels(record.labels),
    updatedAt: trimString(record.updatedAt),
  };
}

function compactScopeMetadata(
  metadata: Omit<OptaleScopeMetadata, "source"> & { source?: OptaleScopeSource }
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      scope: metadata.scope,
      ownerId: metadata.ownerId,
      companyId: metadata.companyId,
      userId: metadata.userId,
      policyId: metadata.policyId,
      memoryNamespace: metadata.memoryNamespace,
      companyBrainTargetId: metadata.companyBrainTargetId,
      labels: metadata.labels,
      updatedAt: metadata.updatedAt,
    }).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== undefined && value !== ""
    )
  );
}

function cabinetScopePath(cabinetPath?: string | null): string {
  return path.join(resolveCabinetDir(cabinetPath), OPTALE_SCOPE_DIR, OPTALE_SCOPE_FILE);
}

export async function readCabinetOptaleScope(
  cabinetPath?: string | null
): Promise<OptaleCabinetScopeMetadata> {
  const normalized = normalizeCabinetPath(cabinetPath, true) || ROOT_CABINET_PATH;
  const fallbackScope = inferCabinetOptaleScope(normalized);
  const filePath = cabinetScopePath(normalized);

  if (!(await fileExists(filePath))) {
    return {
      cabinetPath: normalized,
      scope: fallbackScope,
      source: "inferred",
    };
  }

  try {
    const parsed = JSON.parse(await readFileContent(filePath));
    return {
      cabinetPath: normalized,
      ...parseScopeMetadata(parsed, fallbackScope, "explicit"),
    };
  } catch {
    return {
      cabinetPath: normalized,
      scope: fallbackScope,
      source: "inferred",
    };
  }
}

export async function writeCabinetOptaleScope(
  cabinetPath: string | undefined,
  metadata: Omit<OptaleScopeMetadata, "source"> & { source?: OptaleScopeSource }
): Promise<OptaleCabinetScopeMetadata> {
  const normalized = normalizeCabinetPath(cabinetPath, true) || ROOT_CABINET_PATH;
  const scope = normalizeOptaleScope(metadata.scope) || inferCabinetOptaleScope(normalized);
  const filePath = cabinetScopePath(normalized);
  const next = {
    ...compactScopeMetadata({
      ...metadata,
      scope,
      updatedAt: metadata.updatedAt || new Date().toISOString(),
    }),
  };

  await ensureDirectory(path.dirname(filePath));
  await writeFileContent(filePath, `${JSON.stringify(next, null, 2)}\n`);
  return readCabinetOptaleScope(normalized);
}

export async function resolveAgentOptaleScope(input: {
  agentSlug: string;
  cabinetPath?: string;
  frontmatter?: Record<string, unknown>;
}): Promise<OptaleAgentScopeMetadata> {
  const frontmatter = input.frontmatter || {};
  const nested =
    frontmatter.optale && typeof frontmatter.optale === "object" && !Array.isArray(frontmatter.optale)
      ? (frontmatter.optale as Record<string, unknown>)
      : undefined;

  const flatScope = normalizeOptaleScope(frontmatter.optaleScope);
  const nestedScope = normalizeOptaleScope(nested?.scope);
  const cabinet = await readCabinetOptaleScope(input.cabinetPath);

  if (flatScope || nestedScope) {
    const explicit = parseScopeMetadata(
      {
        scope: flatScope || nestedScope,
        ownerId: frontmatter.optaleOwnerId ?? nested?.ownerId,
        companyId: frontmatter.optaleCompanyId ?? nested?.companyId,
        userId: frontmatter.optaleUserId ?? nested?.userId,
        policyId: frontmatter.optalePolicyId ?? nested?.policyId,
        memoryNamespace: frontmatter.optaleMemoryNamespace ?? nested?.memoryNamespace,
        companyBrainTargetId:
          frontmatter.optaleCompanyBrainTargetId ?? nested?.companyBrainTargetId,
        labels: frontmatter.optaleLabels ?? nested?.labels,
      },
      cabinet.scope,
      "explicit"
    );
    return {
      agentSlug: input.agentSlug,
      cabinetPath: input.cabinetPath,
      ...explicit,
      inheritedFromCabinet: false,
    };
  }

  return {
    agentSlug: input.agentSlug,
    cabinetPath: input.cabinetPath,
    scope: cabinet.scope,
    source: "inherited",
    ownerId: cabinet.ownerId,
    companyId: cabinet.companyId,
    userId: cabinet.userId,
    policyId: cabinet.policyId,
    memoryNamespace: cabinet.memoryNamespace,
    companyBrainTargetId: cabinet.companyBrainTargetId,
    labels: cabinet.labels,
    inheritedFromCabinet: true,
  };
}
