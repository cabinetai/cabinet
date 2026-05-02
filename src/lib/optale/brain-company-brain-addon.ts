import {
  readCabinetOptaleScope,
  type OptaleCabinetScopeMetadata,
} from "@/lib/optale/scope-registry";
import {
  resolveOptaleBrainContext,
  type OptaleBrainContext,
} from "@/lib/optale/brain-context";

export interface OptaleCompanyBrainReviewerAddon {
  id: "company-brain-reviewer";
  enabled: boolean;
  reason?: string;
  source: "scope-label" | "env-allowlist" | "env-global" | "disabled";
  targetId?: string;
  labels: string[];
}

export interface OptaleCompanyBrainReviewerAddonInput {
  context: OptaleBrainContext;
  scope: OptaleCabinetScopeMetadata;
  env?: Record<string, string | undefined>;
}

const ADDON_LABELS = new Set([
  "company-brain",
  "company-brain-reviewer",
  "company-brain-admin",
]);

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanEnv(
  env: Record<string, string | undefined>,
  name: string
): boolean | undefined {
  const value = env[name]?.trim().toLowerCase();
  if (!value) return undefined;
  if (value === "1" || value === "true" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  return undefined;
}

function listEnv(
  env: Record<string, string | undefined>,
  name: string
): Set<string> {
  return new Set(
    (env[name] || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

function scopedIdentifiers(
  context: OptaleBrainContext,
  scope: OptaleCabinetScopeMetadata
): string[] {
  return [
    context.ownerId,
    context.personId,
    context.companyId,
    context.tenantId,
    context.mcpPolicyId,
    context.companyBrainTargetId,
    scope.ownerId,
    scope.userId,
    scope.companyId,
    scope.policyId,
    scope.companyBrainTargetId,
    `owner:${context.ownerId || scope.ownerId || ""}`,
    `user:${context.personId || scope.userId || ""}`,
    `company:${context.companyId || scope.companyId || ""}`,
    `tenant:${context.tenantId || ""}`,
    `policy:${context.mcpPolicyId || scope.policyId || ""}`,
    `target:${context.companyBrainTargetId || scope.companyBrainTargetId || ""}`,
    `cabinet:${context.cabinetPath}`,
  ]
    .filter((entry): entry is string => Boolean(entry && entry.trim()))
    .map((entry) => entry.toLowerCase());
}

export function hasOptaleCompanyBrainReviewerLabel(labels: string[]): boolean {
  return labels.some((label) => ADDON_LABELS.has(label.toLowerCase()));
}

export function evaluateOptaleCompanyBrainReviewerAddon({
  context,
  scope,
  env = process.env,
}: OptaleCompanyBrainReviewerAddonInput): OptaleCompanyBrainReviewerAddon {
  const labels = scope.labels || [];
  const globalEnabled = booleanEnv(env, "OPTALE_COMPANY_BRAIN_REVIEWER_ENABLED");
  const allowlist = listEnv(env, "OPTALE_COMPANY_BRAIN_REVIEWER_ALLOW");
  const identifiers = scopedIdentifiers(context, scope);
  const targetId =
    trimString(context.companyBrainTargetId) || trimString(scope.companyBrainTargetId);

  if (globalEnabled === false) {
    return {
      id: "company-brain-reviewer",
      enabled: false,
      source: "disabled",
      targetId,
      labels,
      reason: "Company Brain reviewer add-on is disabled by environment.",
    };
  }

  if (
    allowlist.size > 0 &&
    identifiers.some((identifier) => allowlist.has(identifier))
  ) {
    return {
      id: "company-brain-reviewer",
      enabled: true,
      source: "env-allowlist",
      targetId,
      labels,
    };
  }

  if (hasOptaleCompanyBrainReviewerLabel(labels)) {
    return {
      id: "company-brain-reviewer",
      enabled: true,
      source: "scope-label",
      targetId,
      labels,
    };
  }

  if (globalEnabled === true) {
    return {
      id: "company-brain-reviewer",
      enabled: true,
      source: "env-global",
      targetId,
      labels,
    };
  }

  return {
    id: "company-brain-reviewer",
    enabled: false,
    source: "disabled",
    targetId,
    labels,
    reason:
      "Company Brain reviewer is an add-on. Enable it with a scope label or an environment allowlist.",
  };
}

export async function resolveOptaleCompanyBrainReviewerAddon(
  cabinetPath?: string | null
): Promise<{
  addon: OptaleCompanyBrainReviewerAddon;
  context: OptaleBrainContext;
  scope: OptaleCabinetScopeMetadata;
}> {
  const scope = await readCabinetOptaleScope(cabinetPath);
  const context = await resolveOptaleBrainContext(scope.cabinetPath, scope);

  return {
    context,
    scope,
    addon: evaluateOptaleCompanyBrainReviewerAddon({ context, scope }),
  };
}
