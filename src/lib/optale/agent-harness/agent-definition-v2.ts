import type { OptaleAgentScope } from "@/lib/optale/product";
import type { AgentDefinitionApprovalMode } from "./agent-definition";

export const AGENT_DEFINITION_V2_SCHEMA_VERSION = 2 as const;

export const AGENT_DEFINITION_V2_SCHEMA = {
  kind: "optale.agent-definition-v2-preview",
  version: AGENT_DEFINITION_V2_SCHEMA_VERSION,
  requiredFields: [
    "id",
    "sourceDefinition",
    "identity",
    "scopeProfile",
    "senseMemory",
    "runtime",
    "toolPolicy",
    "actionPolicy",
    "observability",
    "orchestration",
    "projection",
  ],
} as const;

export type AgentDefinitionV2SchemaVersion =
  typeof AGENT_DEFINITION_V2_SCHEMA_VERSION;

export type AgentDefinitionV2MemoryBindingStatus =
  | "planned"
  | "active"
  | "bridge-only"
  | "internal-only"
  | "disabled";

export type AgentDefinitionV2PrivacyBoundary =
  | "private"
  | "company"
  | "system";

export type AgentDefinitionV2TraceLevel = "standard" | "verbose";

export interface AgentDefinitionV2SourceDefinition {
  manifestId: string;
  manifestSchemaVersion: number;
  definitionId: string;
  definitionSchemaVersion: number;
}

export interface AgentDefinitionV2Identity {
  publicName: string;
  internalName: string;
  role: string;
  description: string;
  customerFacing: boolean;
  infoBarrier: {
    hideRawToolNames: boolean;
    hideBridgeDependencies: boolean;
    exposeSourceReferences: boolean;
  };
}

export interface AgentDefinitionV2ScopeProfile {
  scope: OptaleAgentScope;
  subjectType: OptaleAgentScope;
  privacyBoundary: AgentDefinitionV2PrivacyBoundary;
  tenantId?: string;
  companyId?: string;
  userId?: string;
  memoryNamespace: string;
  vaultNamespace: string;
  graphNamespace: string;
  entityNamespace: string;
  companyBrainTargetId?: string;
  mcpPolicyId: string;
  mcpClientProfile: string;
  promotionBoundary: {
    privateToCompanyAutomaticWrite: false;
    requiresPromotionPacket: true;
    requiresHumanApproval: true;
    requiresReadBackVerification: true;
  };
}

export interface AgentDefinitionV2SenseMemory {
  ingestion: {
    provider: "cognee";
    status: AgentDefinitionV2MemoryBindingStatus;
    namespace: string;
    notes?: string;
  };
  ontology: {
    provider: "open-foundry-oag";
    status: AgentDefinitionV2MemoryBindingStatus;
    namespace: string;
    serverId?: string;
    notes?: string;
  };
  temporalFacts: {
    provider: "graphiti";
    status: AgentDefinitionV2MemoryBindingStatus;
    namespace: string;
    serverId?: string;
    notes?: string;
  };
  personalMemory: {
    provider: "proprietary-personal-memory";
    status: AgentDefinitionV2MemoryBindingStatus;
    namespace: string;
    replaces?: "honcho";
    notes?: string;
  };
  internalLegacyMemory?: {
    provider: "honcho";
    status: "internal-only";
    namespace?: string;
    serverId?: string;
    internalOnly: true;
    bridgeOnly: true;
    notes?: string;
  };
}

export interface AgentDefinitionV2Runtime {
  providerId: string;
  providerName: string;
  adapterType?: string;
  model: string;
  modelAlias?: string;
  capabilities: {
    nativeToolCalls: boolean;
    governedMcp: boolean;
    sourceArtifacts: boolean;
    manualRuns: boolean;
    schedulesEnabledByDefault: boolean;
  };
}

export interface AgentDefinitionV2ToolPolicy {
  defaultDecision: "deny";
  governedMcp: boolean;
  allowedServerIds: string[];
  allowedTools: string[];
  bridgeServerNames: string[];
  restrictions: string[];
}

export interface AgentDefinitionV2ActionPolicy {
  mode: AgentDefinitionApprovalMode;
  requiredFor: string[];
  externalActionsRequireApproval: boolean;
  memoryWritesRequireApproval: boolean;
  companyWritesRequirePromotion: true;
}

export interface AgentDefinitionV2Observability {
  traceLevel: AgentDefinitionV2TraceLevel;
  auditMcp: boolean;
  sourceArtifacts: boolean;
  citationRows: boolean;
  runtimeArtifactsCommitted: false;
}

export interface AgentDefinitionV2Orchestration {
  role: "lead" | "specialist";
  maxFanout: number;
  handoffTargets: Array<{
    to: string;
    edgeType: "handoff";
    description: string;
    bridgeOnly: boolean;
    legacyToolName?: string;
  }>;
}

export interface AgentDefinitionV2Projection {
  nativeOptaleCommand: {
    status: "planned" | "active";
    agentSlug: string;
    personaSlug: string;
    projectionStrategy: "generate-from-manifest" | "import-from-manifest";
    readOnlyPreview: true;
  };
  legacyLibreChatBridge?: {
    status: "temporary-bridge" | "disabled";
    bridgeOnly: true;
    agentId: string;
    sourceScript: string;
    providerName: string;
    model: string;
  };
}

export interface AgentDefinitionV2Preview {
  schemaVersion: AgentDefinitionV2SchemaVersion;
  id: string;
  sourceDefinition: AgentDefinitionV2SourceDefinition;
  identity: AgentDefinitionV2Identity;
  scopeProfile: AgentDefinitionV2ScopeProfile;
  senseMemory: AgentDefinitionV2SenseMemory;
  runtime: AgentDefinitionV2Runtime;
  toolPolicy: AgentDefinitionV2ToolPolicy;
  actionPolicy: AgentDefinitionV2ActionPolicy;
  observability: AgentDefinitionV2Observability;
  orchestration: AgentDefinitionV2Orchestration;
  projection: AgentDefinitionV2Projection;
}

export interface AgentDefinitionV2PreviewManifest {
  schemaVersion: AgentDefinitionV2SchemaVersion;
  id: string;
  sourceManifestId: string;
  sourceManifestSchemaVersion: number;
  name: string;
  description: string;
  agents: AgentDefinitionV2Preview[];
}

export interface AgentDefinitionV2ValidationIssue {
  path: string;
  message: string;
}

export interface AgentDefinitionV2ValidationResult<T> {
  ok: boolean;
  value?: T;
  issues: AgentDefinitionV2ValidationIssue[];
}

const VALID_SCOPES = new Set<OptaleAgentScope>([
  "personal",
  "company",
  "system",
]);
const VALID_PRIVACY_BOUNDARIES = new Set<AgentDefinitionV2PrivacyBoundary>([
  "private",
  "company",
  "system",
]);
const VALID_MEMORY_STATUSES = new Set<AgentDefinitionV2MemoryBindingStatus>([
  "planned",
  "active",
  "bridge-only",
  "internal-only",
  "disabled",
]);
const VALID_APPROVAL_MODES = new Set<AgentDefinitionApprovalMode>([
  "never",
  "on-request",
  "always",
]);
const VALID_TRACE_LEVELS = new Set<AgentDefinitionV2TraceLevel>([
  "standard",
  "verbose",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addIssue(
  issues: AgentDefinitionV2ValidationIssue[],
  path: string,
  message: string
): void {
  issues.push({ path, message });
}

function requireSchemaVersion(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (value !== AGENT_DEFINITION_V2_SCHEMA_VERSION) {
    addIssue(issues, path, `must be ${AGENT_DEFINITION_V2_SCHEMA_VERSION}`);
  }
}

function requireNonEmptyString(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (typeof value !== "string" || value.trim() === "") {
    addIssue(issues, path, "must be a non-empty string");
  }
}

function requireBoolean(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (typeof value !== "boolean") {
    addIssue(issues, path, "must be a boolean");
  }
}

function requireExactBoolean(
  value: unknown,
  expected: boolean,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (value !== expected) {
    addIssue(issues, path, `must be ${expected}`);
  }
}

function requireNumber(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addIssue(issues, path, "must be a finite number");
  }
}

function requireStringArray(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!Array.isArray(value)) {
    addIssue(issues, path, "must be an array");
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      addIssue(issues, `${path}[${index}]`, "must be a non-empty string");
    }
  });
}

function validateScope(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (typeof value !== "string" || !VALID_SCOPES.has(value as OptaleAgentScope)) {
    addIssue(issues, path, "must be personal, company, or system");
  }
}

function validatePrivacyBoundary(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (
    typeof value !== "string" ||
    !VALID_PRIVACY_BOUNDARIES.has(value as AgentDefinitionV2PrivacyBoundary)
  ) {
    addIssue(issues, path, "must be private, company, or system");
  }
}

function validateMemoryStatus(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (
    typeof value !== "string" ||
    !VALID_MEMORY_STATUSES.has(value as AgentDefinitionV2MemoryBindingStatus)
  ) {
    addIssue(
      issues,
      path,
      "must be planned, active, bridge-only, internal-only, or disabled"
    );
  }
}

function validateSourceDefinition(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  requireNonEmptyString(value.manifestId, `${path}.manifestId`, issues);
  requireNumber(
    value.manifestSchemaVersion,
    `${path}.manifestSchemaVersion`,
    issues
  );
  requireNonEmptyString(value.definitionId, `${path}.definitionId`, issues);
  requireNumber(
    value.definitionSchemaVersion,
    `${path}.definitionSchemaVersion`,
    issues
  );
}

function validateIdentity(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  requireNonEmptyString(value.publicName, `${path}.publicName`, issues);
  requireNonEmptyString(value.internalName, `${path}.internalName`, issues);
  requireNonEmptyString(value.role, `${path}.role`, issues);
  requireNonEmptyString(value.description, `${path}.description`, issues);
  requireBoolean(value.customerFacing, `${path}.customerFacing`, issues);
  if (!isRecord(value.infoBarrier)) {
    addIssue(issues, `${path}.infoBarrier`, "must be an object");
  } else {
    requireBoolean(
      value.infoBarrier.hideRawToolNames,
      `${path}.infoBarrier.hideRawToolNames`,
      issues
    );
    requireBoolean(
      value.infoBarrier.hideBridgeDependencies,
      `${path}.infoBarrier.hideBridgeDependencies`,
      issues
    );
    requireBoolean(
      value.infoBarrier.exposeSourceReferences,
      `${path}.infoBarrier.exposeSourceReferences`,
      issues
    );
  }
}

function validateScopeProfile(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  validateScope(value.scope, `${path}.scope`, issues);
  validateScope(value.subjectType, `${path}.subjectType`, issues);
  validatePrivacyBoundary(
    value.privacyBoundary,
    `${path}.privacyBoundary`,
    issues
  );
  if (value.scope !== value.subjectType) {
    addIssue(issues, `${path}.subjectType`, "must match scope");
  }
  if (typeof value.scope === "string") {
    const expectedBoundary =
      value.scope === "personal" ? "private" : value.scope;
    if (value.privacyBoundary !== expectedBoundary) {
      addIssue(
        issues,
        `${path}.privacyBoundary`,
        "must map personal to private and otherwise match scope"
      );
    }
  }
  for (const optional of ["tenantId", "companyId", "userId", "companyBrainTargetId"]) {
    if (value[optional] !== undefined) {
      requireNonEmptyString(value[optional], `${path}.${optional}`, issues);
    }
  }
  requireNonEmptyString(value.memoryNamespace, `${path}.memoryNamespace`, issues);
  requireNonEmptyString(value.vaultNamespace, `${path}.vaultNamespace`, issues);
  requireNonEmptyString(value.graphNamespace, `${path}.graphNamespace`, issues);
  requireNonEmptyString(value.entityNamespace, `${path}.entityNamespace`, issues);
  requireNonEmptyString(value.mcpPolicyId, `${path}.mcpPolicyId`, issues);
  requireNonEmptyString(value.mcpClientProfile, `${path}.mcpClientProfile`, issues);
  if (!isRecord(value.promotionBoundary)) {
    addIssue(issues, `${path}.promotionBoundary`, "must be an object");
  } else {
    requireExactBoolean(
      value.promotionBoundary.privateToCompanyAutomaticWrite,
      false,
      `${path}.promotionBoundary.privateToCompanyAutomaticWrite`,
      issues
    );
    requireExactBoolean(
      value.promotionBoundary.requiresPromotionPacket,
      true,
      `${path}.promotionBoundary.requiresPromotionPacket`,
      issues
    );
    requireExactBoolean(
      value.promotionBoundary.requiresHumanApproval,
      true,
      `${path}.promotionBoundary.requiresHumanApproval`,
      issues
    );
    requireExactBoolean(
      value.promotionBoundary.requiresReadBackVerification,
      true,
      `${path}.promotionBoundary.requiresReadBackVerification`,
      issues
    );
  }
}

function validateSenseBinding(
  value: unknown,
  path: string,
  provider: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  if (value.provider !== provider) {
    addIssue(issues, `${path}.provider`, `must be ${provider}`);
  }
  validateMemoryStatus(value.status, `${path}.status`, issues);
  requireNonEmptyString(value.namespace, `${path}.namespace`, issues);
  if (value.serverId !== undefined) {
    requireNonEmptyString(value.serverId, `${path}.serverId`, issues);
  }
  if (value.notes !== undefined) {
    requireNonEmptyString(value.notes, `${path}.notes`, issues);
  }
}

function validateSenseMemory(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  validateSenseBinding(value.ingestion, `${path}.ingestion`, "cognee", issues);
  validateSenseBinding(
    value.ontology,
    `${path}.ontology`,
    "open-foundry-oag",
    issues
  );
  validateSenseBinding(
    value.temporalFacts,
    `${path}.temporalFacts`,
    "graphiti",
    issues
  );
  validateSenseBinding(
    value.personalMemory,
    `${path}.personalMemory`,
    "proprietary-personal-memory",
    issues
  );

  const personalMemory = isRecord(value.personalMemory) ? value.personalMemory : null;
  if (
    personalMemory?.replaces !== undefined &&
    personalMemory.replaces !== "honcho"
  ) {
    addIssue(issues, `${path}.personalMemory.replaces`, "must be honcho");
  }

  if (value.internalLegacyMemory === undefined) return;
  const legacyPath = `${path}.internalLegacyMemory`;
  if (!isRecord(value.internalLegacyMemory)) {
    addIssue(issues, legacyPath, "must be an object");
    return;
  }
  const legacy = value.internalLegacyMemory;
  if (legacy.provider !== "honcho") {
    addIssue(issues, `${legacyPath}.provider`, "must be honcho");
  }
  if (legacy.status !== "internal-only") {
    addIssue(issues, `${legacyPath}.status`, "must be internal-only");
  }
  requireExactBoolean(legacy.internalOnly, true, `${legacyPath}.internalOnly`, issues);
  requireExactBoolean(legacy.bridgeOnly, true, `${legacyPath}.bridgeOnly`, issues);
  if (legacy.namespace !== undefined) {
    requireNonEmptyString(legacy.namespace, `${legacyPath}.namespace`, issues);
  }
  if (legacy.serverId !== undefined) {
    requireNonEmptyString(legacy.serverId, `${legacyPath}.serverId`, issues);
  }
  if (legacy.notes !== undefined) {
    requireNonEmptyString(legacy.notes, `${legacyPath}.notes`, issues);
  }
}

function validateRuntime(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  requireNonEmptyString(value.providerId, `${path}.providerId`, issues);
  requireNonEmptyString(value.providerName, `${path}.providerName`, issues);
  if (value.adapterType !== undefined) {
    requireNonEmptyString(value.adapterType, `${path}.adapterType`, issues);
  }
  requireNonEmptyString(value.model, `${path}.model`, issues);
  if (value.modelAlias !== undefined) {
    requireNonEmptyString(value.modelAlias, `${path}.modelAlias`, issues);
  }
  if (!isRecord(value.capabilities)) {
    addIssue(issues, `${path}.capabilities`, "must be an object");
    return;
  }
  for (const key of [
    "nativeToolCalls",
    "governedMcp",
    "sourceArtifacts",
    "manualRuns",
    "schedulesEnabledByDefault",
  ]) {
    requireBoolean(value.capabilities[key], `${path}.capabilities.${key}`, issues);
  }
}

function validateToolPolicy(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  if (value.defaultDecision !== "deny") {
    addIssue(issues, `${path}.defaultDecision`, "must be deny");
  }
  requireBoolean(value.governedMcp, `${path}.governedMcp`, issues);
  requireStringArray(value.allowedServerIds, `${path}.allowedServerIds`, issues);
  requireStringArray(value.allowedTools, `${path}.allowedTools`, issues);
  requireStringArray(value.bridgeServerNames, `${path}.bridgeServerNames`, issues);
  requireStringArray(value.restrictions, `${path}.restrictions`, issues);
}

function validateActionPolicy(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  if (
    typeof value.mode !== "string" ||
    !VALID_APPROVAL_MODES.has(value.mode as AgentDefinitionApprovalMode)
  ) {
    addIssue(issues, `${path}.mode`, "must be never, on-request, or always");
  }
  requireStringArray(value.requiredFor, `${path}.requiredFor`, issues);
  requireBoolean(
    value.externalActionsRequireApproval,
    `${path}.externalActionsRequireApproval`,
    issues
  );
  requireBoolean(
    value.memoryWritesRequireApproval,
    `${path}.memoryWritesRequireApproval`,
    issues
  );
  requireExactBoolean(
    value.companyWritesRequirePromotion,
    true,
    `${path}.companyWritesRequirePromotion`,
    issues
  );
}

function validateObservability(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  if (
    typeof value.traceLevel !== "string" ||
    !VALID_TRACE_LEVELS.has(value.traceLevel as AgentDefinitionV2TraceLevel)
  ) {
    addIssue(issues, `${path}.traceLevel`, "must be standard or verbose");
  }
  requireBoolean(value.auditMcp, `${path}.auditMcp`, issues);
  requireBoolean(value.sourceArtifacts, `${path}.sourceArtifacts`, issues);
  requireBoolean(value.citationRows, `${path}.citationRows`, issues);
  requireExactBoolean(
    value.runtimeArtifactsCommitted,
    false,
    `${path}.runtimeArtifactsCommitted`,
    issues
  );
}

function validateOrchestration(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  if (value.role !== "lead" && value.role !== "specialist") {
    addIssue(issues, `${path}.role`, "must be lead or specialist");
  }
  requireNumber(value.maxFanout, `${path}.maxFanout`, issues);
  if (!Array.isArray(value.handoffTargets)) {
    addIssue(issues, `${path}.handoffTargets`, "must be an array");
    return;
  }
  value.handoffTargets.forEach((target, index) => {
    const targetPath = `${path}.handoffTargets[${index}]`;
    if (!isRecord(target)) {
      addIssue(issues, targetPath, "must be an object");
      return;
    }
    requireNonEmptyString(target.to, `${targetPath}.to`, issues);
    if (target.edgeType !== "handoff") {
      addIssue(issues, `${targetPath}.edgeType`, "must be handoff");
    }
    requireNonEmptyString(target.description, `${targetPath}.description`, issues);
    requireBoolean(target.bridgeOnly, `${targetPath}.bridgeOnly`, issues);
    if (target.legacyToolName !== undefined) {
      requireNonEmptyString(
        target.legacyToolName,
        `${targetPath}.legacyToolName`,
        issues
      );
    }
  });
}

function validateProjection(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  const nativePath = `${path}.nativeOptaleCommand`;
  if (!isRecord(value.nativeOptaleCommand)) {
    addIssue(issues, nativePath, "must be an object");
  } else {
    const native = value.nativeOptaleCommand;
    if (native.status !== "planned" && native.status !== "active") {
      addIssue(issues, `${nativePath}.status`, "must be planned or active");
    }
    requireNonEmptyString(native.agentSlug, `${nativePath}.agentSlug`, issues);
    requireNonEmptyString(native.personaSlug, `${nativePath}.personaSlug`, issues);
    if (
      native.projectionStrategy !== "generate-from-manifest" &&
      native.projectionStrategy !== "import-from-manifest"
    ) {
      addIssue(
        issues,
        `${nativePath}.projectionStrategy`,
        "must be generate-from-manifest or import-from-manifest"
      );
    }
    requireExactBoolean(
      native.readOnlyPreview,
      true,
      `${nativePath}.readOnlyPreview`,
      issues
    );
  }

  if (value.legacyLibreChatBridge === undefined) return;
  const legacyPath = `${path}.legacyLibreChatBridge`;
  if (!isRecord(value.legacyLibreChatBridge)) {
    addIssue(issues, legacyPath, "must be an object");
    return;
  }
  const legacy = value.legacyLibreChatBridge;
  if (legacy.status !== "temporary-bridge" && legacy.status !== "disabled") {
    addIssue(
      issues,
      `${legacyPath}.status`,
      "must be temporary-bridge or disabled"
    );
  }
  requireExactBoolean(legacy.bridgeOnly, true, `${legacyPath}.bridgeOnly`, issues);
  requireNonEmptyString(legacy.agentId, `${legacyPath}.agentId`, issues);
  requireNonEmptyString(legacy.sourceScript, `${legacyPath}.sourceScript`, issues);
  requireNonEmptyString(legacy.providerName, `${legacyPath}.providerName`, issues);
  requireNonEmptyString(legacy.model, `${legacyPath}.model`, issues);
}

function validateAgentDefinitionV2PreviewObject(
  value: unknown,
  path: string,
  issues: AgentDefinitionV2ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  requireSchemaVersion(value.schemaVersion, `${path}.schemaVersion`, issues);
  requireNonEmptyString(value.id, `${path}.id`, issues);
  validateSourceDefinition(value.sourceDefinition, `${path}.sourceDefinition`, issues);
  validateIdentity(value.identity, `${path}.identity`, issues);
  validateScopeProfile(value.scopeProfile, `${path}.scopeProfile`, issues);
  validateSenseMemory(value.senseMemory, `${path}.senseMemory`, issues);
  validateRuntime(value.runtime, `${path}.runtime`, issues);
  validateToolPolicy(value.toolPolicy, `${path}.toolPolicy`, issues);
  validateActionPolicy(value.actionPolicy, `${path}.actionPolicy`, issues);
  validateObservability(value.observability, `${path}.observability`, issues);
  validateOrchestration(value.orchestration, `${path}.orchestration`, issues);
  validateProjection(value.projection, `${path}.projection`, issues);
}

export function validateAgentDefinitionV2Preview(
  value: unknown
): AgentDefinitionV2ValidationResult<AgentDefinitionV2Preview> {
  const issues: AgentDefinitionV2ValidationIssue[] = [];
  validateAgentDefinitionV2PreviewObject(value, "agent", issues);
  return {
    ok: issues.length === 0,
    value: issues.length === 0 ? (value as AgentDefinitionV2Preview) : undefined,
    issues,
  };
}

export function validateAgentDefinitionV2PreviewManifest(
  value: unknown
): AgentDefinitionV2ValidationResult<AgentDefinitionV2PreviewManifest> {
  const issues: AgentDefinitionV2ValidationIssue[] = [];
  if (!isRecord(value)) {
    addIssue(issues, "manifest", "must be an object");
    return { ok: false, issues };
  }
  requireSchemaVersion(value.schemaVersion, "manifest.schemaVersion", issues);
  requireNonEmptyString(value.id, "manifest.id", issues);
  requireNonEmptyString(value.sourceManifestId, "manifest.sourceManifestId", issues);
  requireNumber(
    value.sourceManifestSchemaVersion,
    "manifest.sourceManifestSchemaVersion",
    issues
  );
  requireNonEmptyString(value.name, "manifest.name", issues);
  requireNonEmptyString(value.description, "manifest.description", issues);

  if (!Array.isArray(value.agents) || value.agents.length === 0) {
    addIssue(issues, "manifest.agents", "must contain at least one agent");
  } else {
    const ids = new Map<string, number>();
    value.agents.forEach((agent, index) => {
      validateAgentDefinitionV2PreviewObject(
        agent,
        `manifest.agents[${index}]`,
        issues
      );
      if (!isRecord(agent) || typeof agent.id !== "string" || !agent.id.trim()) {
        return;
      }
      const previous = ids.get(agent.id);
      if (previous !== undefined) {
        addIssue(
          issues,
          `manifest.agents[${index}].id`,
          `duplicates manifest.agents[${previous}].id`
        );
      } else {
        ids.set(agent.id, index);
      }
    });
  }

  return {
    ok: issues.length === 0,
    value:
      issues.length === 0
        ? (value as unknown as AgentDefinitionV2PreviewManifest)
        : undefined,
    issues,
  };
}
