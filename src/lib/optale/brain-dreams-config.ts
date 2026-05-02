import type { OptaleBrainContext } from "@/lib/optale/brain-context";
import type { OptaleBrainAdapterBinding } from "@/lib/optale/brain-contracts";

export interface OptaleBrainDreamsConfig {
  enabled: boolean;
  baseUrl: string;
  profile: string;
  actorId: string;
  timeoutMs: number;
}

function envName(base: string, profile: string): string {
  return `${base}_${profile.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

function envFirst(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function booleanEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveOptaleBrainDreamsConfig(
  context: OptaleBrainContext,
  overrideBaseUrl?: string | null
): OptaleBrainDreamsConfig {
  const profile = context.qmdProfile || context.mcpClientProfile;
  const explicit = overrideBaseUrl?.trim();
  const configured =
    explicit ||
    envFirst([
      envName("OPTALE_DREAMS_API_URL", profile),
      envName("OPTALE_VAULT_APP_URL", profile),
      envName("DOCS_API_BASE", profile),
      envName("BRAIN_DOCS_API_BASE", profile),
      envName("VAULT_API_BASE", profile),
      "OPTALE_DREAMS_API_URL",
      "OPTALE_VAULT_APP_URL",
      "DOCS_API_BASE",
      "BRAIN_DOCS_API_BASE",
      "VAULT_API_BASE",
    ]) ||
    "http://127.0.0.1:3601";
  const timeoutMs = Number(process.env.OPTALE_DREAMS_TIMEOUT_MS || 15_000);

  return {
    enabled: !booleanEnv("OPTALE_DREAMS_DISABLED") && Boolean(configured),
    baseUrl: normalizeBaseUrl(configured),
    profile,
    actorId:
      context.personId ||
      context.ownerId ||
      context.companyId ||
      context.tenantId ||
      "optale-observatory",
    timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1000, timeoutMs) : 15_000,
  };
}

export function buildOptaleBrainDreamsSourceBinding(
  context: OptaleBrainContext
): OptaleBrainAdapterBinding {
  const config = resolveOptaleBrainDreamsConfig(context);
  return {
    id: "dreams",
    name: "Dreams",
    kind: "dreams",
    source: "native",
    status: config.enabled ? "healthy" : "unconfigured",
    statusReason: config.enabled
      ? undefined
      : "Dreams/vault app API is not configured for this Brain context.",
    readOnly: false,
    scopes: ["company", "personal", "system"],
    permissions: config.enabled ? ["read", "write"] : [],
    rawPolicyPermissions: config.enabled ? ["read", "write"] : [],
    capabilities: config.enabled ? ["read", "search", "review-dream"] : [],
    namespace: context.memoryNamespace,
    profile: config.profile,
    description:
      "Private Dream proposal review over the scoped Honcho/vault pipeline. Company Brain writes still require promotion.",
  };
}
