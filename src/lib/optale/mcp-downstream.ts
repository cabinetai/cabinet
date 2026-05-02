import {
  readOptaleMcpServers,
  type OptaleMcpServerConfig,
} from "@/lib/optale/context-registry";
import {
  readOptaleMcpPolicy,
  resolveMcpPolicyServersForScope,
  type OptaleMcpPolicyServer,
} from "@/lib/optale/mcp-policy";
import type {
  OptaleMcpTool,
  OptaleMcpToolCallResult,
} from "@/lib/optale/mcp-server";
import type { OptaleMcpGatewayContext } from "@/lib/optale/mcp-gateway";

type JsonObject = Record<string, unknown>;

interface DownstreamTool extends OptaleMcpTool {
  downstreamServerId: string;
  downstreamToolName: string;
}

interface DownstreamRpcResult {
  body?: JsonObject;
  sessionId?: string;
}

const DOWNSTREAM_SERVER_IDS = new Set(["qmd", "graphiti"]);
const GRAPHITI_READ_TOOLS = new Set([
  "search_nodes",
  "search_memory_facts",
  "get_entity_edge",
  "get_episodes",
  "get_status",
]);
const QMD_READ_TOOLS = new Set(["query", "get", "multi_get", "status"]);
const HTTP_TIMEOUT_MS = 4_000;
const PROTOCOL_VERSION = "2024-11-05";

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}

function isDownstreamEnabled(options: { includeDownstream?: boolean }): boolean {
  if (options.includeDownstream !== true) return false;
  return envBool("OPTALE_MCP_ENABLE_DOWNSTREAM", true);
}

function toolName(serverId: string, downstreamName: string): string {
  return `${serverId}__${downstreamName}`;
}

function parseToolName(name: string): { serverId: string; downstreamName: string } | null {
  const index = name.indexOf("__");
  if (index <= 0 || index === name.length - 2) return null;
  return {
    serverId: name.slice(0, index),
    downstreamName: name.slice(index + 2),
  };
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function isReadOnlyTool(serverId: string, tool: JsonObject): boolean {
  const name = typeof tool.name === "string" ? tool.name : "";
  const annotations = asObject(tool.annotations);
  if (annotations.readOnlyHint === false) return false;

  if (serverId === "qmd") return QMD_READ_TOOLS.has(name);
  if (serverId === "graphiti") return GRAPHITI_READ_TOOLS.has(name);
  return false;
}

function toolAllowedByServerRule(
  serverRule: OptaleMcpPolicyServer,
  downstreamName: string
): boolean {
  const prefixed = toolName(serverRule.serverId, downstreamName);
  if (
    serverRule.deniedTools.includes(downstreamName) ||
    serverRule.deniedTools.includes(prefixed)
  ) {
    return false;
  }
  if (serverRule.allowedTools.length === 0) return true;
  return (
    serverRule.allowedTools.includes(downstreamName) ||
    serverRule.allowedTools.includes(prefixed)
  );
}

async function allowedDownstreamServers(
  context?: OptaleMcpGatewayContext,
  allowedServerIds?: string[]
): Promise<Array<{ server: OptaleMcpServerConfig; rule: OptaleMcpPolicyServer }>> {
  if (!context?.authorized) return [];
  const serverAllowlist = allowedServerIds ? new Set(allowedServerIds) : null;
  const policy = await readOptaleMcpPolicy(context.defaultCabinetPath);
  const rules = resolveMcpPolicyServersForScope(policy, context.agentScope || policy.scope)
    .filter((rule) => DOWNSTREAM_SERVER_IDS.has(rule.serverId))
    .filter((rule) => !serverAllowlist || serverAllowlist.has(rule.serverId))
    .filter((rule) => rule.permissions.includes("read"));
  const rulesById = new Map(rules.map((rule) => [rule.serverId, rule]));

  return readOptaleMcpServers()
    .filter((server) => server.transport === "http" && server.status === "configured")
    .filter((server) => DOWNSTREAM_SERVER_IDS.has(server.id))
    .map((server) => ({ server, rule: rulesById.get(server.id) }))
    .filter(
      (entry): entry is { server: OptaleMcpServerConfig; rule: OptaleMcpPolicyServer } =>
        Boolean(entry.rule && entry.server.url)
    );
}

export function parseEventStream(text: string): JsonObject | undefined {
  let latest: JsonObject | undefined;
  for (const chunk of text.split(/\n\n+/)) {
    const data = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        latest = parsed as JsonObject;
      }
    } catch {
      // Continue scanning later events.
    }
  }
  return latest;
}

async function postJsonRpc(
  server: OptaleMcpServerConfig,
  body: JsonObject,
  sessionId?: string
): Promise<DownstreamRpcResult> {
  if (!server.url) throw new Error(`Downstream MCP server ${server.id} has no URL.`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Downstream MCP server ${server.id} returned ${response.status}: ${text.slice(0, 300)}`
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const parsed = contentType.includes("text/event-stream")
      ? parseEventStream(text)
      : text.trim()
        ? (JSON.parse(text) as JsonObject)
        : undefined;
    return {
      body: parsed,
      sessionId: response.headers.get("mcp-session-id") || sessionId,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function initializeSession(server: OptaleMcpServerConfig): Promise<string | undefined> {
  const initialized = await postJsonRpc(server, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "optale-agents-gateway",
        version: "0.1.0",
      },
    },
  });
  const sessionId = initialized.sessionId;
  if (sessionId) {
    await postJsonRpc(
      server,
      {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      },
      sessionId
    ).catch(() => {});
  }
  return sessionId;
}

async function downstreamRequest(
  server: OptaleMcpServerConfig,
  method: string,
  params?: unknown
): Promise<JsonObject> {
  const sessionId = await initializeSession(server);
  const response = await postJsonRpc(
    server,
    {
      jsonrpc: "2.0",
      id: 2,
      method,
      ...(params === undefined ? {} : { params }),
    },
    sessionId
  );
  const body = response.body || {};
  const error = asObject(body.error);
  if (error.message) {
    throw new Error(String(error.message));
  }
  return body;
}

function toDownstreamTool(serverId: string, raw: JsonObject): DownstreamTool | null {
  const name = typeof raw.name === "string" ? raw.name : "";
  if (!name) return null;
  return {
    name: toolName(serverId, name),
    description:
      typeof raw.description === "string"
        ? `[${serverId}] ${raw.description}`
        : `Read-only downstream MCP tool from ${serverId}.`,
    inputSchema: asObject(raw.inputSchema),
    downstreamServerId: serverId,
    downstreamToolName: name,
  };
}

function downstreamArguments(args: unknown, tool: DownstreamTool): JsonObject {
  const input = { ...asObject(args) };
  const properties = asObject(asObject(tool.inputSchema).properties);
  for (const key of ["cabinetPath", "agentScope"]) {
    if (!(key in properties)) delete input[key];
  }
  return input;
}

async function listServerTools(input: {
  server: OptaleMcpServerConfig;
  rule: OptaleMcpPolicyServer;
}): Promise<DownstreamTool[]> {
  try {
    const response = await downstreamRequest(input.server, "tools/list");
    const tools = Array.isArray(asObject(response.result).tools)
      ? (asObject(response.result).tools as unknown[])
      : [];
    return tools
      .map((tool) => asObject(tool))
      .filter((tool) => isReadOnlyTool(input.server.id, tool))
      .filter((tool) =>
        toolAllowedByServerRule(input.rule, typeof tool.name === "string" ? tool.name : "")
      )
      .map((tool) => toDownstreamTool(input.server.id, tool))
      .filter((tool): tool is DownstreamTool => tool !== null);
  } catch (error) {
    console.warn(
      `[optale-mcp] failed to list downstream ${input.server.id} tools`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

export async function listDownstreamOptaleMcpTools(options: {
  includeDownstream?: boolean;
  gatewayContext?: OptaleMcpGatewayContext;
  allowedServerIds?: string[];
}): Promise<OptaleMcpTool[]> {
  if (!isDownstreamEnabled(options)) return [];
  const servers = await allowedDownstreamServers(
    options.gatewayContext,
    options.allowedServerIds
  );
  const nested = await Promise.all(servers.map((entry) => listServerTools(entry)));
  return nested.flat();
}

export async function callDownstreamOptaleMcpTool(
  name: string,
  args: unknown,
  options: {
    includeDownstream?: boolean;
    gatewayContext?: OptaleMcpGatewayContext;
    allowedServerIds?: string[];
  }
): Promise<OptaleMcpToolCallResult | null> {
  if (!isDownstreamEnabled(options)) return null;
  const parsed = parseToolName(name);
  if (!parsed || !DOWNSTREAM_SERVER_IDS.has(parsed.serverId)) return null;

  const servers = await allowedDownstreamServers(
    options.gatewayContext,
    options.allowedServerIds
  );
  const entry = servers.find(({ server }) => server.id === parsed.serverId);
  if (!entry) {
    throw new Error(`Downstream MCP server is not enabled for this scope: ${parsed.serverId}`);
  }
  if (!toolAllowedByServerRule(entry.rule, parsed.downstreamName)) {
    throw new Error(
      `Downstream MCP tool ${name} is not allowed by the cabinet MCP policy.`
    );
  }

  const tools = await listServerTools(entry);
  const tool = tools.find(
    (entry) => entry.downstreamToolName === parsed.downstreamName
  );
  if (!tool) {
    throw new Error(`Downstream MCP tool is not exposed as read-only: ${name}`);
  }

  const response = await downstreamRequest(entry.server, "tools/call", {
    name: parsed.downstreamName,
    arguments: downstreamArguments(args, tool),
  });
  const result = asObject(response.result);
  if (Array.isArray(result.content)) {
    return {
      content: result.content as OptaleMcpToolCallResult["content"],
      isError: result.isError === true ? true : undefined,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result || response, null, 2),
      },
    ],
  };
}
