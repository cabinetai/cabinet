import type { OptaleBrainKind, OptaleBrainSource } from "@/lib/optale/context-registry";
import type { OptaleBrainContext, OptaleBrainSubjectType } from "@/lib/optale/brain-context";
import type { OptaleMcpPermission } from "@/lib/optale/mcp-policy";

export type OptaleBrainActorType = "user" | "service" | "system";
export type OptaleBrainActorSource =
  | "observatory-session"
  | "command-jwt"
  | "service-claims"
  | "system";
export type OptaleBrainActorRole = "owner" | "admin" | "reviewer" | "operator" | "reader";
export type OptaleBrainCapability =
  | "read"
  | "search"
  | "review-dream"
  | "draft-promotion"
  | "submit-promotion"
  | "review-promotion"
  | "approve-promotion"
  | "write-company"
  | "verify-write";
export type OptaleBrainAdapterSource = "native" | "bridge" | "planned";
export type OptaleBrainAdapterStatus =
  | "healthy"
  | "blocked"
  | "unconfigured"
  | "error";
export type OptaleBrainAuditOutcome = "ok" | "denied" | "error";

export interface OptaleBrainActorClaims {
  actorType: OptaleBrainActorType;
  source: OptaleBrainActorSource;
  actorId: string;
  userId?: string;
  role?: OptaleBrainActorRole;
  tenantId?: string;
  subjectType?: OptaleBrainSubjectType;
  allowedScopes: OptaleBrainSubjectType[];
  allowedTargetIds: string[];
  requestId: string;
}

export interface OptaleBrainRequestContext {
  generatedAt: string;
  actor: OptaleBrainActorClaims;
  brain: OptaleBrainContext;
}

export interface OptaleBrainAdapterBinding {
  id: string;
  name: string;
  kind: OptaleBrainKind | "company_brain" | "dreams" | "promotions";
  source: OptaleBrainAdapterSource;
  status: OptaleBrainAdapterStatus;
  statusReason?: string;
  readOnly: boolean;
  scopes: OptaleBrainSubjectType[];
  mcpServerId?: string;
  permissions: OptaleMcpPermission[];
  rawPolicyPermissions?: OptaleMcpPermission[];
  capabilities: OptaleBrainCapability[];
  namespace?: string;
  profile?: string;
  description?: string;
}

export interface OptaleBrainPromotionBoundary {
  privateToCompanyAutomaticWrite: false;
  browserDirectSourceWrites: false;
  companyWritesRequirePromotion: true;
  companyWritesRequireAgentReview: true;
  companyWritesRequireHumanApproval: true;
  companyWritesRequireReadBackVerification: true;
  enabledWriteCapabilities: OptaleBrainCapability[];
}

export interface OptaleBrainProvisioningProfile {
  version: 1;
  tenantId?: string;
  subjectType: OptaleBrainSubjectType;
  companyId?: string;
  personId?: string;
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
  copyPersonalVault: false;
  copyPersonalMemory: false;
}

export interface OptaleBrainAuditEvent {
  timestamp?: string;
  requestId: string;
  actorId: string;
  actorType: OptaleBrainActorType;
  tenantId?: string;
  subjectType?: OptaleBrainSubjectType;
  action: string;
  targetId?: string;
  outcome: OptaleBrainAuditOutcome;
  reason?: string;
}

export interface OptaleBrainCoreStatus {
  version: 1;
  generatedAt: string;
  request: OptaleBrainRequestContext;
  provisioning: OptaleBrainProvisioningProfile;
  boundary: OptaleBrainPromotionBoundary;
  sources: OptaleBrainAdapterBinding[];
  migration: {
    commandBridgeEnabled: boolean;
    commandBridgeConfigured: boolean;
    commandBridgeReadOnly: true;
    commandBridgeReason?: string;
    canonicalOwner: "observatory";
  };
}

export type OptaleBrainPublicCoreStatus = OptaleBrainCoreStatus;

function randomId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}_${id}`;
}

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
        .map((entry) => entry.trim())
    )
  );
}

export function buildSystemBrainActor(
  context: OptaleBrainContext,
  requestId = randomId("brain")
): OptaleBrainActorClaims {
  const allowedScopes: OptaleBrainSubjectType[] = [context.subjectType];
  return {
    actorType: "system",
    source: "observatory-session",
    actorId: "optale-observatory",
    tenantId: context.tenantId,
    subjectType: context.subjectType,
    allowedScopes,
    allowedTargetIds:
      context.subjectType === "company" && context.companyBrainTargetId
        ? [context.companyBrainTargetId]
        : [],
    requestId,
  };
}

export function normalizeBrainActorClaims(
  value: unknown,
  context: OptaleBrainContext,
  fallbackRequestId?: string
): OptaleBrainActorClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return buildSystemBrainActor(context, fallbackRequestId);
  }

  const record = value as Record<string, unknown>;
  const actorType =
    record.actorType === "user" ||
    record.actorType === "service" ||
    record.actorType === "system"
      ? record.actorType
      : "system";
  const source =
    record.source === "command-jwt" ||
    record.source === "service-claims" ||
    record.source === "system" ||
    record.source === "observatory-session"
      ? record.source
      : "observatory-session";
  const role =
    record.role === "owner" ||
    record.role === "admin" ||
    record.role === "reviewer" ||
    record.role === "operator" ||
    record.role === "reader"
      ? record.role
      : undefined;
  const subjectType =
    record.subjectType === "company" ||
    record.subjectType === "personal" ||
    record.subjectType === "system"
      ? record.subjectType
      : context.subjectType;
  const allowedScopes = stringArray(record.allowedScopes)
    .filter((entry): entry is OptaleBrainSubjectType =>
      entry === "company" || entry === "personal" || entry === "system"
    )
    .filter((scope) => context.allowedScopes.includes(scope));
  const allowedTargetIds = stringArray(record.allowedTargetIds).filter(
    (targetId) => Boolean(context.companyBrainTargetId && targetId === context.companyBrainTargetId)
  );

  return {
    actorType,
    source,
    actorId: trimString(record.actorId) || trimString(record.userId) || "optale-observatory",
    userId: trimString(record.userId),
    role,
    tenantId: trimString(record.tenantId) || context.tenantId,
    subjectType,
    allowedScopes: allowedScopes.length > 0 ? allowedScopes : [context.subjectType],
    allowedTargetIds,
    requestId:
      trimString(record.requestId) || fallbackRequestId || randomId("brain"),
  };
}

export function buildBrainRequestContext(input: {
  context: OptaleBrainContext;
  actor?: unknown;
  requestId?: string;
  generatedAt?: string;
}): OptaleBrainRequestContext {
  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    actor: normalizeBrainActorClaims(input.actor, input.context, input.requestId),
    brain: input.context,
  };
}

export function buildPromotionBoundary(): OptaleBrainPromotionBoundary {
  return {
    privateToCompanyAutomaticWrite: false,
    browserDirectSourceWrites: false,
    companyWritesRequirePromotion: true,
    companyWritesRequireAgentReview: true,
    companyWritesRequireHumanApproval: true,
    companyWritesRequireReadBackVerification: true,
    enabledWriteCapabilities: [],
  };
}

export function buildProvisioningProfile(
  context: OptaleBrainContext
): OptaleBrainProvisioningProfile {
  return {
    version: 1,
    tenantId: context.tenantId,
    subjectType: context.subjectType,
    companyId: context.companyId,
    personId: context.personId,
    cabinetPath: context.cabinetPath,
    dataRoot: context.dataRoot,
    vaultNamespace: context.vaultNamespace,
    memoryNamespace: context.memoryNamespace,
    graphNamespace: context.graphNamespace,
    entityNamespace: context.entityNamespace,
    qmdProfile: context.qmdProfile,
    graphProfile: context.graphProfile,
    entityProfile: context.entityProfile,
    companyBrainTargetId: context.companyBrainTargetId,
    mcpPolicyId: context.mcpPolicyId,
    mcpClientProfile: context.mcpClientProfile,
    secretsRef: context.secretsRef,
    copyPersonalVault: false,
    copyPersonalMemory: false,
  };
}

export function capabilitiesForBrainSource(
  source: Pick<OptaleBrainSource, "kind">
): OptaleBrainCapability[] {
  if (source.kind === "vault") return ["read", "search", "draft-promotion"];
  if (source.kind === "memory") return ["read", "search", "draft-promotion"];
  if (source.kind === "dreams") return ["read", "search", "review-dream"];
  if (source.kind === "graph" || source.kind === "action_graph") {
    return ["read", "search", "draft-promotion"];
  }
  return ["read", "search"];
}

export function namespaceForBrainSource(
  source: Pick<OptaleBrainSource, "kind">,
  context: OptaleBrainContext
): { namespace?: string; profile?: string } {
  if (source.kind === "vault") {
    return { namespace: context.vaultNamespace, profile: context.qmdProfile };
  }
  if (source.kind === "memory") {
    return { namespace: context.memoryNamespace, profile: context.mcpClientProfile };
  }
  if (source.kind === "dreams") {
    return { namespace: context.memoryNamespace, profile: context.qmdProfile };
  }
  if (source.kind === "graph" || source.kind === "action_graph") {
    return { namespace: context.graphNamespace, profile: context.graphProfile };
  }
  if (source.kind === "crm" || source.kind === "project") {
    return { namespace: context.entityNamespace, profile: context.entityProfile };
  }
  if (source.kind === "communications") {
    return { namespace: context.memoryNamespace, profile: context.mcpClientProfile };
  }
  return { namespace: context.graphNamespace, profile: context.graphProfile };
}

export function redactBrainCoreStatusForClient(
  status: OptaleBrainCoreStatus
): OptaleBrainPublicCoreStatus {
  return {
    ...status,
    request: {
      ...status.request,
      brain: {
        ...status.request.brain,
        dataRoot: "[server-side]",
        secretsRef: status.request.brain.secretsRef ? "[configured]" : "",
      },
    },
    provisioning: {
      ...status.provisioning,
      dataRoot: "[server-side]",
      secretsRef: status.provisioning.secretsRef ? "[configured]" : "",
    },
    sources: status.sources.map(({ mcpServerId, ...source }) => source),
  };
}
