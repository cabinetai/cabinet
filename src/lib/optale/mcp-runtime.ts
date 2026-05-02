import path from "path";
import type { OptaleAgentScope } from "./product";
import {
  readOptaleMcpServers,
  type OptaleMcpServerConfig,
} from "./context-registry";
import {
  readOptaleMcpPolicy,
  resolveMcpPolicyServersForScope,
  type OptaleMcpPolicySource,
} from "./mcp-policy";
import { CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";
import { ensureDirectory, writeFileContent } from "@/lib/storage/fs-operations";

type ClaudeMcpServerConfig =
  | {
      type: "http";
      url: string;
    }
  | {
      command: string;
      args?: string[];
    };

export interface OptaleGovernedMcpRuntimeConfig {
  enabled: true;
  enforcement: "strict-config";
  policySource: OptaleMcpPolicySource;
  policyId?: string;
  cabinetPath: string;
  cabinetScope: OptaleAgentScope;
  agentScope: OptaleAgentScope;
  allowedServerIds: string[];
  allowedTools: string[];
  claudeConfigPath: string;
  codexConfigArgs: string[];
}

export interface OptaleGovernedMcpRuntime {
  adapterConfigPatch: {
    governedMcp: OptaleGovernedMcpRuntimeConfig;
  };
  configDir: string;
  claudeConfigPath: string;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}

function isSafeConfigKeySegment(value: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

function codexConfigPair(key: string, value: unknown): string[] {
  return ["-c", `${key}=${JSON.stringify(value)}`];
}

function toClaudeMcpServer(server: OptaleMcpServerConfig): ClaudeMcpServerConfig | null {
  if (server.transport === "http") {
    return server.url ? { type: "http", url: server.url } : null;
  }

  if (server.transport === "stdio") {
    return server.command
      ? {
          command: server.command,
          ...(server.args && server.args.length > 0 ? { args: server.args } : {}),
        }
      : null;
  }

  return null;
}

function buildCodexMcpArgs(servers: OptaleMcpServerConfig[]): string[] {
  const args = ["--ignore-user-config"];

  for (const server of servers) {
    if (!isSafeConfigKeySegment(server.id)) continue;
    const prefix = `mcp_servers.${server.id}`;

    if (server.transport === "http" && server.url) {
      args.push(...codexConfigPair(`${prefix}.url`, server.url));
      continue;
    }

    if (server.transport === "stdio" && server.command) {
      args.push(...codexConfigPair(`${prefix}.command`, server.command));
      if (server.args && server.args.length > 0) {
        args.push(...codexConfigPair(`${prefix}.args`, server.args));
      }
    }
  }

  return args;
}

function mergeConfiguredServers(allowedServerIds: string[]): OptaleMcpServerConfig[] {
  const allowlist = new Set(allowedServerIds);
  return readOptaleMcpServers().filter(
    (server) => server.status === "configured" && allowlist.has(server.id)
  );
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

function applyServerAllowlist(
  policyAllowedServerIds: string[],
  overrideAllowedServerIds?: string[]
): string[] {
  if (!overrideAllowedServerIds) return policyAllowedServerIds;
  const allowlist = new Set(overrideAllowedServerIds);
  return policyAllowedServerIds.filter((serverId) => allowlist.has(serverId));
}

export async function prepareGovernedMcpRuntime(input: {
  sessionId: string;
  cabinetPath?: string | null;
  agentScope?: OptaleAgentScope;
  allowedServerIds?: string[];
  allowedTools?: string[];
}): Promise<OptaleGovernedMcpRuntime> {
  const policy = await readOptaleMcpPolicy(input.cabinetPath);
  const agentScope = input.agentScope || policy.scope;
  const allowedRules = resolveMcpPolicyServersForScope(policy, agentScope);
  const policyAllowedServerIds = allowedRules.map((server) => server.serverId);
  const overrideAllowedServerIds = input.allowedServerIds
    ? stringArray(input.allowedServerIds)
    : undefined;
  const allowedServerIds = applyServerAllowlist(
    policyAllowedServerIds,
    overrideAllowedServerIds
  );
  const allowedTools = stringArray(input.allowedTools);
  const configuredServers = mergeConfiguredServers(allowedServerIds);
  const allowedConfiguredIds = configuredServers.map((server) => server.id);

  const mcpServers = Object.fromEntries(
    configuredServers
      .map((server) => [server.id, toClaudeMcpServer(server)] as const)
      .filter((entry): entry is readonly [string, ClaudeMcpServerConfig] => entry[1] !== null)
  );
  const configDir = path.join(
    CABINET_INTERNAL_DIR,
    "optale-mcp",
    sanitizePathSegment(input.sessionId)
  );
  const claudeConfigPath = path.join(configDir, "claude-mcp.json");

  await ensureDirectory(configDir);
  await writeFileContent(
    claudeConfigPath,
    `${JSON.stringify({ mcpServers }, null, 2)}\n`
  );

  return {
    adapterConfigPatch: {
      governedMcp: {
        enabled: true,
        enforcement: "strict-config",
        policySource: policy.source,
        policyId: policy.policyId,
        cabinetPath: policy.cabinetPath,
        cabinetScope: policy.scope,
        agentScope,
        allowedServerIds: allowedConfiguredIds,
        allowedTools,
        claudeConfigPath,
        codexConfigArgs: buildCodexMcpArgs(configuredServers),
      },
    },
    configDir,
    claudeConfigPath,
  };
}
