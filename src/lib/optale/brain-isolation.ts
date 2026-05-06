import { resolveOptaleBrainContext } from "@/lib/optale/brain-context";
import { readOptaleBrainCoreStatus } from "@/lib/optale/brain-core";
import type {
  OptaleBrainActorClaims,
  OptaleBrainCoreStatus,
  OptaleBrainPromotionBoundary,
  OptaleBrainProvisioningProfile,
} from "@/lib/optale/brain-contracts";
import {
  readCabinetOptaleScope,
  type OptaleCabinetScopeMetadata,
} from "@/lib/optale/scope-registry";

export type OptaleBrainIsolationStatus = "green" | "yellow" | "red";

export interface OptaleBrainIsolationCheck {
  id: string;
  label: string;
  status: OptaleBrainIsolationStatus;
  message: string;
}

export interface OptaleBrainIsolationSubject {
  cabinetPath: string;
  scope: OptaleCabinetScopeMetadata["scope"];
  scopeSource: OptaleCabinetScopeMetadata["source"];
  ownerId?: string;
  companyId?: string;
  userId?: string;
  labels: string[];
  subjectType: string;
  tenantId?: string;
  vaultNamespace: string;
  memoryNamespace: string;
  graphNamespace: string;
  entityNamespace: string;
  qmdProfile: string;
  graphProfile: string;
  entityProfile: string;
  companyBrainTargetId?: string;
  allowedScopes: string[];
  actorAllowedScopes: string[];
  actorAllowedTargetIds: string[];
}

export interface OptaleBrainIsolationPayload {
  version: 1;
  generatedAt: string;
  readyForIngestion: boolean;
  companyCabinetPath: string;
  personalCabinetPath: string;
  sharedCompanyBrainTargetId?: string;
  company: OptaleBrainIsolationSubject;
  personal: OptaleBrainIsolationSubject;
  checks: OptaleBrainIsolationCheck[];
}

const DEFAULT_COMPANY_CABINET_PATH = ".";
const DEFAULT_PERSONAL_CABINET_PATH = "personal/thor";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sorted(value: string[]): string[] {
  return [...value].sort((left, right) => left.localeCompare(right));
}

function sameMembers(value: string[], expected: string[]): boolean {
  const left = sorted(value);
  const right = sorted(expected);
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function check(
  id: string,
  label: string,
  passed: boolean,
  passMessage: string,
  failMessage: string,
  failStatus: OptaleBrainIsolationStatus = "red",
): OptaleBrainIsolationCheck {
  return {
    id,
    label,
    status: passed ? "green" : failStatus,
    message: passed ? passMessage : failMessage,
  };
}

function nonEmptyDistinct(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left !== right);
}

function promotionBoundaryLocked(boundary: OptaleBrainPromotionBoundary): boolean {
  return (
    boundary.privateToCompanyAutomaticWrite === false &&
    boundary.browserDirectSourceWrites === false &&
    boundary.companyWritesRequirePromotion === true &&
    boundary.companyWritesRequireAgentReview === true &&
    boundary.companyWritesRequireHumanApproval === true &&
    boundary.companyWritesRequireReadBackVerification === true &&
    boundary.enabledWriteCapabilities.length === 0
  );
}

function provisioningCopiesDisabled(profile: OptaleBrainProvisioningProfile): boolean {
  return profile.copyPersonalVault === false && profile.copyPersonalMemory === false;
}

function actorScopesOnly(actor: OptaleBrainActorClaims, expected: "company" | "personal"): boolean {
  return (
    sameMembers(actor.allowedScopes, [expected]) &&
    actor.subjectType === expected
  );
}

function readonlySources(status: OptaleBrainCoreStatus): boolean {
  return status.sources.every(
    (source) =>
      source.readOnly &&
      !source.capabilities.includes("write-company") &&
      !source.rawPolicyPermissions?.some((permission) => permission !== "read"),
  );
}

function subjectFrom(
  scope: OptaleCabinetScopeMetadata,
  core: OptaleBrainCoreStatus,
): OptaleBrainIsolationSubject {
  const brain = core.request.brain;

  return {
    cabinetPath: scope.cabinetPath,
    scope: scope.scope,
    scopeSource: scope.source,
    ownerId: scope.ownerId,
    companyId: scope.companyId,
    userId: scope.userId,
    labels: scope.labels || [],
    subjectType: brain.subjectType,
    tenantId: brain.tenantId,
    vaultNamespace: brain.vaultNamespace,
    memoryNamespace: brain.memoryNamespace,
    graphNamespace: brain.graphNamespace,
    entityNamespace: brain.entityNamespace,
    qmdProfile: brain.qmdProfile,
    graphProfile: brain.graphProfile,
    entityProfile: brain.entityProfile,
    companyBrainTargetId: brain.companyBrainTargetId,
    allowedScopes: brain.allowedScopes,
    actorAllowedScopes: core.request.actor.allowedScopes,
    actorAllowedTargetIds: core.request.actor.allowedTargetIds,
  };
}

export async function readOptaleBrainIsolationStatus(input: {
  companyCabinetPath?: string | null;
  personalCabinetPath?: string | null;
} = {}): Promise<OptaleBrainIsolationPayload> {
  const companyCabinetPath =
    trimString(input.companyCabinetPath) || DEFAULT_COMPANY_CABINET_PATH;
  const personalCabinetPath =
    trimString(input.personalCabinetPath) || DEFAULT_PERSONAL_CABINET_PATH;

  const [companyScope, personalScope] = await Promise.all([
    readCabinetOptaleScope(companyCabinetPath),
    readCabinetOptaleScope(personalCabinetPath),
  ]);

  const [companyContext, personalContext, companyCore, personalCore] = await Promise.all([
    resolveOptaleBrainContext(companyCabinetPath, companyScope),
    resolveOptaleBrainContext(personalCabinetPath, personalScope),
    readOptaleBrainCoreStatus({ cabinetPath: companyCabinetPath }),
    readOptaleBrainCoreStatus({ cabinetPath: personalCabinetPath }),
  ]);

  const sharedCompanyBrainTargetId =
    companyContext.companyBrainTargetId &&
    personalContext.companyBrainTargetId &&
    companyContext.companyBrainTargetId === personalContext.companyBrainTargetId
      ? companyContext.companyBrainTargetId
      : undefined;

  const checks: OptaleBrainIsolationCheck[] = [
    check(
      "company-scope-explicit",
      "Company scope",
      companyScope.source === "explicit" && companyScope.scope === "company",
      "Company Brain uses an explicit company scope.",
      "Company Brain must be explicitly scoped as company before ingestion.",
    ),
    check(
      "personal-scope-explicit",
      "Personal scope",
      personalScope.source === "explicit" && personalScope.scope === "personal",
      "Personal Brain uses an explicit personal scope.",
      "Personal Brain must be explicitly scoped as personal before ingestion.",
    ),
    check(
      "cabinet-paths-distinct",
      "Cabinet paths",
      companyScope.cabinetPath !== personalScope.cabinetPath,
      "Company and personal Brain paths are distinct.",
      "Company and personal Brain paths must not point at the same cabinet.",
    ),
    check(
      "memory-namespaces-distinct",
      "Memory namespaces",
      nonEmptyDistinct(companyContext.memoryNamespace, personalContext.memoryNamespace),
      "Company and personal Brain memory namespaces are distinct.",
      "Company and personal Brain memory namespaces must be non-empty and distinct.",
    ),
    check(
      "graph-namespaces-distinct",
      "Graph namespaces",
      nonEmptyDistinct(companyContext.graphNamespace, personalContext.graphNamespace),
      "Company and personal Brain graph namespaces are distinct.",
      "Company and personal Brain graph namespaces must be non-empty and distinct.",
    ),
    check(
      "entity-namespaces-distinct",
      "Entity namespaces",
      nonEmptyDistinct(companyContext.entityNamespace, personalContext.entityNamespace),
      "Company and personal Brain entity namespaces are distinct.",
      "Company and personal Brain entity namespaces must be non-empty and distinct.",
    ),
    check(
      "vault-namespaces-distinct",
      "Vault namespaces",
      nonEmptyDistinct(companyContext.vaultNamespace, personalContext.vaultNamespace),
      "Company and personal Brain vault namespaces are distinct.",
      "Company and personal Brain vault namespaces must be non-empty and distinct.",
    ),
    check(
      "knowledge-profiles-distinct",
      "Knowledge profiles",
      nonEmptyDistinct(companyContext.qmdProfile, personalContext.qmdProfile),
      "Company and personal Brain knowledge profiles are distinct.",
      "Company and personal Brain knowledge profiles must be non-empty and distinct.",
    ),
    check(
      "company-target-shared",
      "Company Brain target",
      Boolean(sharedCompanyBrainTargetId),
      "Company and personal Brain contexts point at the same shared company target.",
      "Company and personal Brain contexts must share one company Brain target id.",
    ),
    check(
      "context-scopes-contained",
      "Context scopes",
      sameMembers(companyContext.allowedScopes, ["company"]) &&
        sameMembers(personalContext.allowedScopes, ["personal"]),
      "Resolved Brain contexts do not cross allowed scope boundaries.",
      "Resolved Brain contexts must stay company-only and personal-only.",
    ),
    check(
      "actor-scopes-contained",
      "Actor scopes",
      actorScopesOnly(companyCore.request.actor, "company") &&
        actorScopesOnly(personalCore.request.actor, "personal") &&
        sameMembers(personalCore.request.actor.allowedTargetIds, []),
      "System actors stay inside their resolved Brain scopes.",
      "System actors must not carry cross-scope access for ingestion readiness.",
    ),
    check(
      "promotion-boundary-locked",
      "Promotion boundary",
      promotionBoundaryLocked(companyCore.boundary) &&
        promotionBoundaryLocked(personalCore.boundary),
      "Promotion boundaries require review, approval, and read-back verification.",
      "Promotion boundaries must block private automatic company writes.",
    ),
    check(
      "provisioning-copy-disabled",
      "Provisioning copy",
      provisioningCopiesDisabled(companyCore.provisioning) &&
        provisioningCopiesDisabled(personalCore.provisioning),
      "Provisioning profiles will not copy personal vault or memory content.",
      "Provisioning profiles must disable personal vault and memory copying.",
    ),
    check(
      "source-bindings-readonly",
      "Source bindings",
      readonlySources(companyCore) && readonlySources(personalCore),
      "Brain source bindings are read-only for both scopes.",
      "Brain source bindings must stay read-only before ingestion.",
    ),
    check(
      "command-bridge-readonly",
      "Command bridge",
      companyCore.migration.commandBridgeReadOnly === true &&
        personalCore.migration.commandBridgeReadOnly === true,
      "Command bridge is exposed as read-only in both scopes.",
      "Command bridge must remain read-only for isolation readiness.",
    ),
  ];

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    readyForIngestion: checks.every((entry) => entry.status === "green"),
    companyCabinetPath: companyScope.cabinetPath,
    personalCabinetPath: personalScope.cabinetPath,
    sharedCompanyBrainTargetId,
    company: subjectFrom(companyScope, companyCore),
    personal: subjectFrom(personalScope, personalCore),
    checks,
  };
}
