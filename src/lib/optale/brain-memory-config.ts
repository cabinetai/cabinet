import type { OptaleBrainContext } from "@/lib/optale/brain-context";
import type { OptaleBrainAdapterBinding } from "@/lib/optale/brain-contracts";

export interface OptaleBrainMemoryConfig {
  enabled: boolean;
  baseUrl: string;
  workspace: string;
  defaultPeer?: string;
  namespace: string;
  profile: string;
  authConfigured: boolean;
  timeoutMs: number;
  statusReason?: string;
}

const DEFAULT_MEMORY_BASE_URL = "http://127.0.0.1:8010";
const DEFAULT_TIMEOUT_MS = 8_000;

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "").replace(/\/v3$/, "");
}

function envSegment(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function scopedEnvNames(baseNames: string[], context: OptaleBrainContext): string[] {
  const segments = Array.from(
    new Set(
      [context.mcpClientProfile, context.memoryNamespace, context.tenantId]
        .map((entry) => (entry ? envSegment(entry) : ""))
        .filter(Boolean)
    )
  );
  return [
    ...segments.flatMap((segment) => baseNames.map((name) => `${name}_${segment}`)),
    ...baseNames,
  ];
}

function envFirst(names: string[], fallback?: string): string | undefined {
  for (const name of names) {
    const value = trimString(process.env[name]);
    if (value) return value;
  }
  return fallback;
}

function parseTimeout(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(parsed), 1_000), 30_000);
}

export function resolveOptaleBrainMemoryConfig(
  context: OptaleBrainContext
): OptaleBrainMemoryConfig {
  const baseUrl = stripTrailingSlash(
    envFirst(
      scopedEnvNames(
        [
          "OPTALE_MEMORY_BASE_URL",
          "OPTALE_HONCHO_BASE_URL",
          "MEMORY_BASE_URL",
          "BRAIN_MEMORY_BASE_URL",
          "HONCHO_BASE_URL",
          "HONCHO_ENDPOINT",
        ],
        context
      ),
      DEFAULT_MEMORY_BASE_URL
    )!
  );
  const workspace = envFirst(
    scopedEnvNames(
      [
        "OPTALE_MEMORY_WORKSPACE",
        "MEMORY_WORKSPACE",
        "BRAIN_MEMORY_WORKSPACE",
        "HONCHO_WORKSPACE",
      ],
      context
    ),
    context.memoryNamespace
  );
  const defaultPeer = envFirst(
    scopedEnvNames(
      ["OPTALE_MEMORY_PEER", "MEMORY_PEER", "BRAIN_MEMORY_PEER", "HONCHO_PEER"],
      context
    )
  );
  const authToken = envFirst(
    scopedEnvNames(
      ["OPTALE_MEMORY_API_KEY", "MEMORY_API_KEY", "BRAIN_MEMORY_API_KEY", "HONCHO_API_KEY"],
      context
    )
  );
  const timeoutMs = parseTimeout(
    envFirst(scopedEnvNames(["OPTALE_MEMORY_TIMEOUT_MS", "MEMORY_TIMEOUT_MS"], context))
  );
  const enabled = Boolean(baseUrl && workspace);

  return {
    enabled,
    baseUrl,
    workspace: workspace || "",
    defaultPeer,
    namespace: context.memoryNamespace,
    profile: context.mcpClientProfile,
    authConfigured: Boolean(authToken),
    timeoutMs,
    statusReason: enabled
      ? undefined
      : "Memory is missing a base URL or workspace for this Brain context.",
  };
}

export function resolveOptaleBrainMemoryAuthHeader(
  context: OptaleBrainContext
): Record<string, string> {
  const token = envFirst(
    scopedEnvNames(
      ["OPTALE_MEMORY_API_KEY", "MEMORY_API_KEY", "BRAIN_MEMORY_API_KEY", "HONCHO_API_KEY"],
      context
    )
  );
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function buildOptaleBrainMemorySourceBinding(
  context: OptaleBrainContext,
  config = resolveOptaleBrainMemoryConfig(context)
): OptaleBrainAdapterBinding {
  return {
    id: "memory",
    name: "Memory",
    kind: "memory",
    source: "native",
    status: config.enabled ? "healthy" : "unconfigured",
    statusReason: config.statusReason,
    readOnly: true,
    scopes: [context.subjectType],
    permissions: config.enabled ? ["read"] : [],
    rawPolicyPermissions: config.enabled ? ["read"] : [],
    capabilities: config.enabled ? ["read", "search", "draft-promotion"] : [],
    namespace: config.namespace,
    profile: config.profile,
    description: "Private and scoped agent memory from the configured Honcho workspace.",
  };
}
