import path from "path";
import type { OptaleAgentScope } from "./product";
import {
  readOptaleBrainSources,
  readOptaleMcpServers,
  type OptaleMcpServerConfig,
} from "./context-registry";
import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import {
  ensureDirectory,
  fileExists,
  readFileContent,
  writeFileContent,
} from "@/lib/storage/fs-operations";
import {
  normalizeOptaleScope,
  readCabinetOptaleScope,
} from "@/lib/optale/scope-registry";

export type OptaleMcpPermission = "read" | "write" | "execute";
export type OptaleMcpPolicySource = "derived" | "explicit";
export type OptaleMcpEnforcementMode = "prompt" | "proxy";
export type OptaleMcpDefaultDecision = "deny";

export interface OptaleMcpPolicyServer {
  serverId: string;
  name: string;
  enabled: boolean;
  permissions: OptaleMcpPermission[];
  toolGroups: string[];
  allowedTools: string[];
  deniedTools: string[];
  scopes: OptaleAgentScope[];
  brainSourceIds: string[];
  description?: string;
  notes?: string;
}

export interface OptaleMcpPolicy {
  version: 1;
  cabinetPath: string;
  scope: OptaleAgentScope;
  source: OptaleMcpPolicySource;
  enforcementMode: OptaleMcpEnforcementMode;
  defaultDecision: OptaleMcpDefaultDecision;
  commandCenterManaged: boolean;
  policyId?: string;
  ownerId?: string;
  companyId?: string;
  userId?: string;
  updatedAt?: string;
  servers: OptaleMcpPolicyServer[];
}

export interface OptaleMcpPolicyWriteInput {
  enforcementMode?: OptaleMcpEnforcementMode;
  commandCenterManaged?: boolean;
  policyId?: unknown;
  ownerId?: unknown;
  companyId?: unknown;
  userId?: unknown;
  updatedAt?: string;
  servers?: unknown[];
}

const POLICY_DIR = ".optale";
const POLICY_FILE = "mcp-policy.json";
const VALID_PERMISSIONS = new Set<OptaleMcpPermission>([
  "read",
  "write",
  "execute",
]);

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

function permissionArray(value: unknown): OptaleMcpPermission[] {
  return stringArray(value).filter((entry): entry is OptaleMcpPermission =>
    VALID_PERMISSIONS.has(entry as OptaleMcpPermission)
  );
}

function scopeArray(value: unknown, fallback: OptaleAgentScope[]): OptaleAgentScope[] {
  const scopes = stringArray(value)
    .map(normalizeOptaleScope)
    .filter((entry): entry is OptaleAgentScope => Boolean(entry));
  return scopes.length > 0 ? scopes : fallback;
}

function policyPath(cabinetPath?: string | null): string {
  return path.join(resolveCabinetDir(cabinetPath), POLICY_DIR, POLICY_FILE);
}

function defaultToolGroups(serverId: string): string[] {
  switch (serverId) {
    case "qmd":
      return ["vault-search", "document-read"];
    case "graphiti":
      return ["memory-read"];
    case "oag":
      return ["context-read", "action-graph-read"];
    case "gitnexus":
      return ["repo-search", "impact-analysis"];
    case "twenty":
      return ["crm-read"];
    case "plane":
      return ["project-read"];
    case "matrix":
      return ["communications-read"];
    default:
      return ["read"];
  }
}

function defaultPermissions(server: OptaleMcpServerConfig): OptaleMcpPermission[] {
  if (server.status !== "configured") return [];
  return ["read"];
}

function brainSourcesForServer(serverId: string): string[] {
  return readOptaleBrainSources()
    .filter((source) => source.mcpServerId === serverId)
    .map((source) => source.id);
}

function derivedRule(
  server: OptaleMcpServerConfig,
  scope: OptaleAgentScope
): OptaleMcpPolicyServer {
  const scopeAllowed = server.scopes.includes(scope);
  return {
    serverId: server.id,
    name: server.name,
    enabled: scopeAllowed && server.status === "configured",
    permissions: scopeAllowed ? defaultPermissions(server) : [],
    toolGroups: scopeAllowed ? defaultToolGroups(server.id) : [],
    allowedTools: [],
    deniedTools: [],
    scopes: server.scopes,
    brainSourceIds: brainSourcesForServer(server.id),
    description: server.description,
  };
}

function normalizePolicyServer(
  raw: unknown,
  fallback: OptaleMcpPolicyServer | undefined,
  scope: OptaleAgentScope
): OptaleMcpPolicyServer | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const serverId = trimString(record.serverId) || trimString(record.id) || fallback?.serverId;
  if (!serverId) return null;
  const enabled =
    typeof record.enabled === "boolean"
      ? record.enabled
      : fallback?.enabled ?? true;
  const permissions = permissionArray(record.permissions);
  const toolGroups = stringArray(record.toolGroups);

  return {
    serverId,
    name: trimString(record.name) || fallback?.name || serverId,
    enabled,
    permissions:
      permissions.length > 0
        ? permissions
        : enabled
          ? fallback?.permissions || ["read"]
          : [],
    toolGroups:
      toolGroups.length > 0
        ? toolGroups
        : enabled
          ? fallback?.toolGroups || defaultToolGroups(serverId)
          : [],
    allowedTools: stringArray(record.allowedTools),
    deniedTools: stringArray(record.deniedTools),
    scopes: scopeArray(record.scopes, fallback?.scopes || [scope]),
    brainSourceIds: stringArray(record.brainSourceIds || record.brainSources).length > 0
      ? stringArray(record.brainSourceIds || record.brainSources)
      : fallback?.brainSourceIds || [],
    description: trimString(record.description) || fallback?.description,
    notes: trimString(record.notes),
  };
}

function compactServer(rule: OptaleMcpPolicyServer): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      serverId: rule.serverId,
      enabled: rule.enabled,
      permissions: rule.permissions,
      toolGroups: rule.toolGroups,
      allowedTools: rule.allowedTools,
      deniedTools: rule.deniedTools,
      scopes: rule.scopes,
      brainSourceIds: rule.brainSourceIds,
      notes: rule.notes,
    }).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== undefined && value !== ""
    )
  );
}

function parsePolicyDocument(
  raw: unknown,
  base: OptaleMcpPolicy
): OptaleMcpPolicy {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const baseById = new Map(base.servers.map((server) => [server.serverId, server]));
  const overrides = Array.isArray(record.servers) ? record.servers : [];
  const mergedById = new Map(baseById);

  for (const override of overrides) {
    const id =
      override && typeof override === "object" && !Array.isArray(override)
        ? trimString((override as Record<string, unknown>).serverId) ||
          trimString((override as Record<string, unknown>).id)
        : undefined;
    const fallback = id ? baseById.get(id) : undefined;
    const normalized = normalizePolicyServer(override, fallback, base.scope);
    if (normalized) mergedById.set(normalized.serverId, normalized);
  }

  return {
    ...base,
    source: "explicit",
    enforcementMode:
      record.enforcementMode === "proxy" || record.enforcement === "proxy"
        ? "proxy"
        : "prompt",
    commandCenterManaged:
      typeof record.commandCenterManaged === "boolean"
        ? record.commandCenterManaged
        : base.commandCenterManaged,
    policyId: trimString(record.policyId) || base.policyId,
    ownerId: trimString(record.ownerId) || base.ownerId,
    companyId: trimString(record.companyId) || base.companyId,
    userId: trimString(record.userId) || base.userId,
    updatedAt: trimString(record.updatedAt) || base.updatedAt,
    servers: Array.from(mergedById.values()),
  };
}

async function buildDerivedMcpPolicy(
  cabinetPath?: string | null
): Promise<OptaleMcpPolicy> {
  const cabinet = await readCabinetOptaleScope(cabinetPath);
  const normalized = normalizeCabinetPath(cabinetPath, true) || ROOT_CABINET_PATH;
  return {
    version: 1,
    cabinetPath: normalized,
    scope: cabinet.scope,
    source: "derived",
    enforcementMode: "prompt",
    defaultDecision: "deny",
    commandCenterManaged: true,
    policyId: cabinet.policyId,
    ownerId: cabinet.ownerId,
    companyId: cabinet.companyId,
    userId: cabinet.userId,
    servers: readOptaleMcpServers().map((server) =>
      derivedRule(server, cabinet.scope)
    ),
  };
}

export async function readOptaleMcpPolicy(
  cabinetPath?: string | null
): Promise<OptaleMcpPolicy> {
  const base = await buildDerivedMcpPolicy(cabinetPath);
  const filePath = policyPath(base.cabinetPath);
  if (!(await fileExists(filePath))) return base;

  try {
    return parsePolicyDocument(JSON.parse(await readFileContent(filePath)), base);
  } catch {
    return base;
  }
}

export async function writeOptaleMcpPolicy(
  cabinetPath: string | undefined,
  policy: OptaleMcpPolicyWriteInput
): Promise<OptaleMcpPolicy> {
  const normalized = normalizeCabinetPath(cabinetPath, true) || ROOT_CABINET_PATH;
  const base = await buildDerivedMcpPolicy(normalized);
  const baseById = new Map(base.servers.map((server) => [server.serverId, server]));
  const servers = Array.isArray(policy.servers)
    ? policy.servers
        .map((server) => {
          const id =
            server && typeof server === "object" && !Array.isArray(server)
              ? trimString((server as Record<string, unknown>).serverId) ||
                trimString((server as Record<string, unknown>).id)
              : undefined;
          const normalizedServer = normalizePolicyServer(
            server,
            id ? baseById.get(id) : undefined,
            base.scope
          );
          return normalizedServer ? compactServer(normalizedServer) : null;
        })
        .filter((server): server is Record<string, unknown> => server !== null)
    : base.servers.map(compactServer);
  const filePath = policyPath(normalized);
  const body = Object.fromEntries(
    Object.entries({
      version: 1,
      enforcementMode:
        policy.enforcementMode === "proxy" ? "proxy" : "prompt",
      defaultDecision: "deny",
      commandCenterManaged:
        typeof policy.commandCenterManaged === "boolean"
          ? policy.commandCenterManaged
          : true,
      policyId: trimString(policy.policyId),
      ownerId: trimString(policy.ownerId),
      companyId: trimString(policy.companyId),
      userId: trimString(policy.userId),
      updatedAt: policy.updatedAt || new Date().toISOString(),
      servers,
    }).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== undefined && value !== ""
    )
  );

  await ensureDirectory(path.dirname(filePath));
  await writeFileContent(filePath, `${JSON.stringify(body, null, 2)}\n`);
  return readOptaleMcpPolicy(normalized);
}

export function resolveMcpPolicyServersForScope(
  policy: OptaleMcpPolicy,
  agentScope?: OptaleAgentScope
): OptaleMcpPolicyServer[] {
  const scope = agentScope || policy.scope;
  return policy.servers.filter(
    (server) => server.enabled && server.scopes.includes(scope)
  );
}

export async function buildOptaleMcpPolicyInstructions(input: {
  cabinetPath?: string;
  agentScope?: OptaleAgentScope;
}): Promise<string[]> {
  const policy = await readOptaleMcpPolicy(input.cabinetPath);
  const effectiveScope = input.agentScope || policy.scope;
  const allowed = resolveMcpPolicyServersForScope(policy, effectiveScope);

  const lines = [
    "Optale MCP policy for this run:",
    `- Space scope: ${policy.scope}. Agent scope: ${effectiveScope}. Default decision: deny.`,
    `- Enforcement mode: ${policy.enforcementMode}. Treat this as binding even when CLI configs expose more MCP servers.`,
    "- Use only the MCP servers and brain sources listed below. Do not use MCP servers outside this allowlist, and do not cross company/personal/system scopes without explicit policy.",
  ];

  if (allowed.length === 0) {
    lines.push("- No MCP servers are enabled for this scope.");
    return lines;
  }

  lines.push("- Enabled MCP servers:");
  for (const server of allowed) {
    const parts = [
      server.permissions.length > 0
        ? `permissions=${server.permissions.join(",")}`
        : "permissions=none",
      server.toolGroups.length > 0
        ? `groups=${server.toolGroups.join(",")}`
        : null,
      server.brainSourceIds.length > 0
        ? `brain=${server.brainSourceIds.join(",")}`
        : null,
      server.allowedTools.length > 0
        ? `tools=${server.allowedTools.join(",")}`
        : null,
      server.deniedTools.length > 0
        ? `denied=${server.deniedTools.join(",")}`
        : null,
    ].filter(Boolean);
    lines.push(`  - ${server.serverId}: ${parts.join("; ")}`);
  }

  return lines;
}
