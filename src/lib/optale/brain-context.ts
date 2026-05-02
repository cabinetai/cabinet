import path from "path";
import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import {
  readCabinetOptaleScope,
  type OptaleCabinetScopeMetadata,
} from "@/lib/optale/scope-registry";
import type { OptaleAgentScope } from "@/lib/optale/product";

export type OptaleBrainSubjectType = OptaleAgentScope;

export interface OptaleBrainContext {
  subjectType: OptaleBrainSubjectType;
  tenantId?: string;
  companyId?: string;
  personId?: string;
  ownerId?: string;
  cabinetPath: string;
  dataRoot: string;
  vaultNamespace: string;
  memoryNamespace: string;
  graphNamespace: string;
  entityNamespace: string;
  qmdProfile: string;
  graphProfile: string;
  entityProfile: string;
  companyBrainTargetId?: string;
  mcpPolicyId?: string;
  mcpClientProfile: string;
  secretsRef: string;
  allowedScopes: OptaleBrainSubjectType[];
  source: OptaleCabinetScopeMetadata["source"];
}

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function slugSegment(value: string | undefined, fallback: string): string {
  const source = value || fallback;
  const slug = source
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function envName(base: string, segment: string): string {
  return `${base}_${segment.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

function envFirst(names: string[], fallback?: string): string | undefined {
  for (const name of names) {
    const value = trimString(process.env[name]);
    if (value) return value;
  }
  return fallback;
}

function defaultTargetId(scope: OptaleCabinetScopeMetadata, segment: string): string | undefined {
  if (scope.scope !== "company") return undefined;
  return `optale-${slugSegment(scope.companyId, segment)}`;
}

function allowedScopesFor(subjectType: OptaleBrainSubjectType): OptaleBrainSubjectType[] {
  if (subjectType === "system") return ["system", "company", "personal"];
  return [subjectType];
}

export async function resolveOptaleBrainContext(
  cabinetPath?: string | null,
  preloadedScope?: OptaleCabinetScopeMetadata
): Promise<OptaleBrainContext> {
  const normalized = normalizeCabinetPath(cabinetPath, true) || ROOT_CABINET_PATH;
  const scope = preloadedScope || (await readCabinetOptaleScope(normalized));
  const dataRoot = resolveCabinetDir(normalized);
  const pathSegment = normalized === ROOT_CABINET_PATH ? "root" : slugSegment(normalized, "space");
  const ownerSegment =
    scope.scope === "personal"
      ? slugSegment(scope.userId || scope.ownerId, pathSegment)
      : scope.scope === "company"
        ? slugSegment(scope.companyId || scope.ownerId, pathSegment)
        : slugSegment(scope.ownerId, pathSegment);
  const namespaceBase = `${scope.scope}:${ownerSegment}`;
  const tenantId = envFirst(
    [
      envName("OPTALE_TENANT_ID", ownerSegment),
      envName("OPTALE_TENANT", ownerSegment),
      "OPTALE_TENANT_ID",
    ],
    scope.companyId || scope.userId || scope.ownerId
  );
  const memoryNamespace = scope.memoryNamespace || namespaceBase;
  const graphNamespace = envFirst(
    [
      envName("OPTALE_GRAPH_NAMESPACE", ownerSegment),
      envName("GRAPH_GROUP_ID", ownerSegment),
      "OPTALE_GRAPH_NAMESPACE",
      "GRAPH_GROUP_ID",
    ],
    memoryNamespace
  )!;
  const entityNamespace = envFirst(
    [envName("OPTALE_ENTITY_NAMESPACE", ownerSegment), "OPTALE_ENTITY_NAMESPACE"],
    namespaceBase
  )!;
  const companyBrainTargetId = envFirst(
    [
      envName("OPTALE_COMPANY_BRAIN_TARGET", ownerSegment),
      "OPTALE_COMPANY_BRAIN_TARGET",
    ],
    scope.companyBrainTargetId || defaultTargetId(scope, ownerSegment)
  );

  return {
    subjectType: scope.scope,
    tenantId,
    companyId: scope.companyId,
    personId: scope.userId,
    ownerId: scope.ownerId,
    cabinetPath: normalized,
    dataRoot: path.resolve(dataRoot),
    vaultNamespace: `vault:${pathSegment}`,
    memoryNamespace,
    graphNamespace,
    entityNamespace,
    qmdProfile: envFirst([envName("OPTALE_QMD_PROFILE", ownerSegment), "OPTALE_QMD_PROFILE"], ownerSegment)!,
    graphProfile: envFirst(
      [envName("OPTALE_GRAPH_PROFILE", ownerSegment), "OPTALE_GRAPH_PROFILE"],
      ownerSegment
    )!,
    entityProfile: envFirst(
      [envName("OPTALE_ENTITY_PROFILE", ownerSegment), "OPTALE_ENTITY_PROFILE"],
      ownerSegment
    )!,
    companyBrainTargetId,
    mcpPolicyId: scope.policyId,
    mcpClientProfile: envFirst(
      [envName("OPTALE_MCP_CLIENT_PROFILE", ownerSegment), "OPTALE_MCP_CLIENT_PROFILE"],
      ownerSegment
    )!,
    secretsRef: envFirst(
      [envName("OPTALE_SECRETS_REF", ownerSegment), "OPTALE_SECRETS_REF"],
      ownerSegment
    )!,
    allowedScopes: allowedScopesFor(scope.scope),
    source: scope.source,
  };
}
