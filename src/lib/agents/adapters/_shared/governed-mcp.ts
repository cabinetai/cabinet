import type { OptaleAgentScope } from "@/lib/optale/product";

export interface GovernedMcpAdapterConfig {
  enabled: boolean;
  enforcement?: string;
  policySource?: string;
  cabinetPath?: string;
  agentScope?: OptaleAgentScope;
  allowedServerIds: string[];
  allowedTools: string[];
  claudeConfigPath?: string;
  codexConfigArgs: string[];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function agentScopeValue(value: unknown): OptaleAgentScope | undefined {
  const scope = stringValue(value);
  return scope === "company" || scope === "personal" || scope === "system"
    ? scope
    : undefined;
}

export function readGovernedMcpConfig(
  config: Record<string, unknown> | undefined
): GovernedMcpAdapterConfig | null {
  if (!config) return null;
  const raw = config.governedMcp;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const enabled = record.enabled !== false;
  if (!enabled) return null;

  return {
    enabled,
    enforcement:
      typeof record.enforcement === "string" && record.enforcement.trim()
        ? record.enforcement.trim()
        : undefined,
    policySource:
      stringValue(record.policySource),
    cabinetPath: stringValue(record.cabinetPath),
    agentScope: agentScopeValue(record.agentScope),
    allowedServerIds: stringArray(record.allowedServerIds),
    allowedTools: stringArray(record.allowedTools),
    claudeConfigPath: stringValue(record.claudeConfigPath),
    codexConfigArgs: stringArray(record.codexConfigArgs),
  };
}

export function buildGovernedMcpCommandNote(
  governedMcp: GovernedMcpAdapterConfig | null
): string | undefined {
  if (!governedMcp) return undefined;
  const serverCount = governedMcp.allowedServerIds.length;
  const noun = serverCount === 1 ? "server" : "servers";
  return `Optale governed MCP: strict per-run config with ${serverCount} allowed ${noun}.`;
}
