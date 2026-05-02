import { readCabinetOverview } from "@/lib/cabinets/overview";
import { parseCabinetVisibilityMode } from "@/lib/cabinets/visibility";
import { readOptaleBrainSummary } from "@/lib/optale/brain-summary";
import {
  readOptaleMcpPolicy,
  resolveMcpPolicyServersForScope,
} from "@/lib/optale/mcp-policy";
import { readOptaleContextRegistry } from "@/lib/optale/context-registry";
import { normalizeOptaleScope } from "@/lib/optale/scope-registry";
import {
  appendOptaleMcpAuditEvent,
  countOptaleMcpToolCallsToday,
  type OptaleMcpAuditOutcome,
} from "@/lib/optale/mcp-audit-log";
import type { OptaleMcpGatewayContext } from "@/lib/optale/mcp-gateway";
import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import {
  callDownstreamOptaleMcpTool,
  listDownstreamOptaleMcpTools,
} from "@/lib/optale/mcp-downstream";

type JsonRpcId = string | number | null;
type JsonObject = Record<string, unknown>;

export interface OptaleMcpTool {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

export interface OptaleMcpToolCallResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

const PROTOCOL_VERSION = "2024-11-05";

class OptaleMcpAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptaleMcpAccessDeniedError";
  }
}

export interface OptaleMcpServerOptions {
  includeActions?: boolean;
  includeDownstream?: boolean;
  allowedServerIds?: string[];
  gatewayContext?: OptaleMcpGatewayContext;
}

function objectSchema(
  properties: JsonObject = {},
  required: string[] = []
): JsonObject {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

const BASE_TOOLS: OptaleMcpTool[] = [
  {
    name: "optale_context_registry",
    description:
      "Return Optale Observatory product, scope, brain, MCP, and Command Center integration metadata.",
    inputSchema: objectSchema(),
  },
  {
    name: "optale_list_cabinets",
    description:
      "List the current cabinet, parent, children, visible cabinets, agents, and jobs for a cabinet path.",
    inputSchema: objectSchema({
      cabinetPath: {
        type: "string",
        description: "Space path. Defaults to the root space.",
      },
      visibilityMode: {
        type: "string",
        enum: ["own", "children-1", "children-2", "all"],
        description: "How many descendant cabinet levels to include.",
      },
    }),
  },
  {
    name: "optale_brain_summary",
    description:
      "Return the Vault, Memory, Graph, MCP policy, and source status summary for a cabinet.",
    inputSchema: objectSchema({
      cabinetPath: {
        type: "string",
        description: "Space path. Defaults to the root space.",
      },
    }),
  },
  {
    name: "optale_mcp_policy",
    description:
      "Return the effective MCP policy and scope-filtered allowed servers for a cabinet or agent scope.",
    inputSchema: objectSchema({
      cabinetPath: {
        type: "string",
        description: "Space path. Defaults to the root space.",
      },
      agentScope: {
        type: "string",
        enum: ["company", "personal", "system"],
        description: "Optional agent scope override.",
      },
    }),
  },
  {
    name: "optale_command_center_snapshot",
    description:
      "Return Command Center state for a cabinet: agents, jobs, tasks, conversations, counts, controls, and MCP policy.",
    inputSchema: objectSchema({
      cabinetPath: {
        type: "string",
        description: "Space path. Defaults to the root space.",
      },
      visibilityMode: {
        type: "string",
        enum: ["own", "children-1", "children-2", "all"],
        description: "How many descendant cabinet levels to include.",
      },
      limit: {
        type: "number",
        minimum: 1,
        maximum: 500,
        description: "Maximum conversations/tasks to include.",
      },
    }),
  },
];

const ACTION_TOOL: OptaleMcpTool = {
  name: "optale_command_center_action",
  description:
    "Execute a Command Center action such as launch_conversation, create_task, update_task, set_agent_active, run_job, toggle_job, stop_conversation, or review_actions. Disabled unless OPTALE_MCP_ENABLE_ACTIONS=true.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "launch_conversation",
          "create_task",
          "update_task",
          "set_agent_active",
          "run_job",
          "toggle_job",
          "stop_conversation",
          "review_actions",
        ],
      },
      cabinetPath: { type: "string" },
    },
    required: ["action"],
    additionalProperties: true,
  },
};

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function paramsObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function isActionsEnabled(): boolean {
  return process.env.OPTALE_MCP_ENABLE_ACTIONS === "true";
}

function canExposeActions(options: OptaleMcpServerOptions = {}): boolean {
  const globallyEnabled = options.includeActions ?? isActionsEnabled();
  if (!globallyEnabled) return false;
  return options.gatewayContext?.canUseActions ?? true;
}

function withGatewayDefaults(
  args: unknown,
  context?: OptaleMcpGatewayContext
): JsonObject {
  const input = { ...paramsObject(args) };
  if (!trimString(input.cabinetPath) && context?.defaultCabinetPath) {
    input.cabinetPath = context.defaultCabinetPath;
  }
  if (!trimString(input.agentScope) && context?.agentScope) {
    input.agentScope = context.agentScope;
  }
  return input;
}

function isSameOrDescendantCabinet(
  requestedPath: string | undefined,
  basePath: string | undefined
): boolean {
  const requested =
    normalizeCabinetPath(requestedPath, true) || ROOT_CABINET_PATH;
  const base = normalizeCabinetPath(basePath, true) || ROOT_CABINET_PATH;
  if (base === ROOT_CABINET_PATH) return true;
  return requested === base || requested.startsWith(`${base}/`);
}

function assertGatewayCabinetAccess(
  input: JsonObject,
  context?: OptaleMcpGatewayContext
): void {
  if (!context?.cabinetPathLocked || !context.defaultCabinetPath) return;
  const requestedCabinetPath =
    trimString(input.cabinetPath) || context.defaultCabinetPath;
  if (isSameOrDescendantCabinet(requestedCabinetPath, context.defaultCabinetPath)) {
    return;
  }
  throw new Error(
    `MCP client ${context.clientId} is scoped to cabinet ${context.defaultCabinetPath} and cannot access ${requestedCabinetPath}.`
  );
}

function requiredToolPermission(toolName: string): "read" | "write" | "execute" {
  return toolName === "optale_command_center_action" ? "write" : "read";
}

function hasToolPermission(
  context: OptaleMcpGatewayContext | undefined,
  toolName: string
): boolean {
  if (!context) return true;
  const permissions = context.permissions || [];
  const required = requiredToolPermission(toolName);
  if (required === "read") return permissions.includes("read");
  return permissions.includes("write") || permissions.includes("execute");
}

function isToolVisibleToGateway(
  toolName: string,
  context?: OptaleMcpGatewayContext
): boolean {
  if (!context) return true;
  if (!context.authorized) return false;
  if (context.deniedTools?.includes(toolName)) return false;
  if (context.allowedTools && context.allowedTools.length > 0 && !context.allowedTools.includes(toolName)) {
    return false;
  }
  return hasToolPermission(context, toolName);
}

function serverIdForToolName(toolName: string): string {
  const separator = toolName.indexOf("__");
  return separator > 0 ? toolName.slice(0, separator) : "optale-agents";
}

function isToolVisibleToServerAllowlist(
  toolName: string,
  allowedServerIds?: string[]
): boolean {
  if (!allowedServerIds) return true;
  return allowedServerIds.includes(serverIdForToolName(toolName));
}

async function assertGatewayToolAccess(
  toolName: string,
  context?: OptaleMcpGatewayContext,
  allowedServerIds?: string[]
): Promise<void> {
  if (!isToolVisibleToServerAllowlist(toolName, allowedServerIds)) {
    throw new OptaleMcpAccessDeniedError(
      `MCP server ${serverIdForToolName(toolName)} is not allowed for this run.`
    );
  }
  if (!context) return;
  if (!context.authorized) {
    throw new OptaleMcpAccessDeniedError(
      context.authorizationError || "MCP client is not authorized."
    );
  }
  if (context.deniedTools?.includes(toolName)) {
    throw new OptaleMcpAccessDeniedError(
      `MCP client ${context.clientId} is denied tool ${toolName}.`
    );
  }
  if (context.allowedTools && context.allowedTools.length > 0 && !context.allowedTools.includes(toolName)) {
    throw new OptaleMcpAccessDeniedError(
      `MCP client ${context.clientId} is not allowed to call tool ${toolName}.`
    );
  }
  if (!hasToolPermission(context, toolName)) {
    throw new OptaleMcpAccessDeniedError(
      `MCP client ${context.clientId} does not have ${requiredToolPermission(toolName)} permission for ${toolName}.`
    );
  }

  const dailyToolCalls = context.budget?.dailyToolCalls;
  if (dailyToolCalls) {
    const used = await countOptaleMcpToolCallsToday({ clientId: context.clientId });
    if (used >= dailyToolCalls) {
      throw new OptaleMcpAccessDeniedError(
        `MCP client ${context.clientId} exceeded daily tool-call budget (${dailyToolCalls}).`
      );
    }
  }
}

function argumentKeys(input: JsonObject): string[] {
  return Object.keys(input)
    .filter((key) => key !== "apiKey" && key !== "token" && key !== "password")
    .sort();
}

function errorText(result: OptaleMcpToolCallResult): string | undefined {
  if (!result.isError) return undefined;
  return result.content.map((entry) => entry.text).join("\n").trim() || "Tool failed";
}

async function auditMcpToolCall(input: {
  context?: OptaleMcpGatewayContext;
  startedAt: number;
  toolName: string;
  args: JsonObject;
  result: OptaleMcpToolCallResult;
  outcome?: OptaleMcpAuditOutcome;
}): Promise<void> {
  const { context } = input;
  if (!context?.auditEnabled) return;
  await appendOptaleMcpAuditEvent({
    requestId: context.requestId,
    clientId: context.clientId,
    authType: context.authType,
    method: "tools/call",
    toolName: input.toolName,
    cabinetPath: trimString(input.args.cabinetPath) || context.defaultCabinetPath,
    agentScope: trimString(input.args.agentScope) || context.agentScope,
    outcome:
      input.outcome ||
      (input.result.isError ? "error" : "ok"),
    durationMs: Date.now() - input.startedAt,
    argumentKeys: argumentKeys(input.args),
    error: errorText(input.result),
  });
}

async function auditMcpRpc(input: {
  context?: OptaleMcpGatewayContext;
  startedAt: number;
  method: string;
  outcome: OptaleMcpAuditOutcome;
  error?: string;
}): Promise<void> {
  const { context } = input;
  if (!context?.auditEnabled) return;
  await appendOptaleMcpAuditEvent({
    requestId: context.requestId,
    clientId: context.clientId,
    authType: context.authType,
    method: input.method,
    outcome: input.outcome,
    durationMs: Date.now() - input.startedAt,
    error: input.error,
  });
}

function textResult(value: unknown): OptaleMcpToolCallResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown): OptaleMcpToolCallResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

export async function listOptaleMcpTools(
  options: OptaleMcpServerOptions = {}
): Promise<OptaleMcpTool[]> {
  const tools = canExposeActions(options) ? [...BASE_TOOLS, ACTION_TOOL] : BASE_TOOLS;
  const builtInTools = tools.filter((tool) =>
    isToolVisibleToServerAllowlist(tool.name, options.allowedServerIds) &&
    isToolVisibleToGateway(tool.name, options.gatewayContext)
  );
  const downstreamTools = await listDownstreamOptaleMcpTools(options);
  return [...builtInTools, ...downstreamTools].filter((tool) =>
    isToolVisibleToGateway(tool.name, options.gatewayContext)
  );
}

export async function callOptaleMcpTool(
  name: string,
  args: unknown,
  options: OptaleMcpServerOptions = {}
): Promise<OptaleMcpToolCallResult> {
  const startedAt = Date.now();
  const input = withGatewayDefaults(args, options.gatewayContext);
  const cabinetPath = trimString(input.cabinetPath);
  const finish = async (
    result: OptaleMcpToolCallResult,
    outcome?: OptaleMcpAuditOutcome
  ): Promise<OptaleMcpToolCallResult> => {
    await auditMcpToolCall({
      context: options.gatewayContext,
      startedAt,
      toolName: name,
      args: input,
      result,
      outcome,
    });
    return result;
  };

  try {
    await assertGatewayToolAccess(
      name,
      options.gatewayContext,
      options.allowedServerIds
    );
    assertGatewayCabinetAccess(input, options.gatewayContext);

    switch (name) {
      case "optale_context_registry":
        return finish(textResult(readOptaleContextRegistry()));

      case "optale_list_cabinets": {
        const overview = await readCabinetOverview(cabinetPath || ".", {
          visibilityMode: parseCabinetVisibilityMode(trimString(input.visibilityMode)),
        });
        return finish(textResult({
          cabinet: overview.cabinet,
          parent: overview.parent,
          children: overview.children,
          visibleCabinets: overview.visibleCabinets,
          agents: overview.agents,
          jobs: overview.jobs,
        }));
      }

      case "optale_brain_summary":
        return finish(textResult(await readOptaleBrainSummary(cabinetPath)));

      case "optale_mcp_policy": {
        const policy = await readOptaleMcpPolicy(cabinetPath);
        const agentScope = normalizeOptaleScope(input.agentScope) || policy.scope;
        return finish(textResult({
          policy,
          effectiveAgentScope: agentScope,
          allowedServers: resolveMcpPolicyServersForScope(policy, agentScope),
        }));
      }

      case "optale_command_center_snapshot":
        return finish(textResult(
          await (
            await import("@/lib/optale/command-center-control")
          ).readOptaleCommandCenterSnapshot({
            cabinetPath,
            visibilityMode: parseCabinetVisibilityMode(trimString(input.visibilityMode)),
            limit:
              typeof input.limit === "number" && Number.isFinite(input.limit)
                ? input.limit
                : undefined,
          })
        ));

      case "optale_command_center_action":
        if (!canExposeActions(options)) {
          throw new Error(
            "optale_command_center_action is disabled. Set OPTALE_MCP_ENABLE_ACTIONS=true to expose write/control actions."
          );
        }
        return finish(textResult(
          await (
            await import("@/lib/optale/command-center-control")
          ).executeOptaleCommandCenterAction(input)
        ));

      default: {
        const downstreamResult = await callDownstreamOptaleMcpTool(
          name,
          input,
          options
        );
        if (downstreamResult) return finish(downstreamResult);
        throw new Error(`Unknown Optale MCP tool: ${name}`);
      }
    }
  } catch (error) {
    const result = errorResult(error);
    return finish(
      result,
      error instanceof OptaleMcpAccessDeniedError ||
        (name === "optale_command_center_action" && !canExposeActions(options))
        ? "denied"
        : "error"
    );
  }
}

function rpcResult(id: JsonRpcId, result: unknown): JsonObject {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonObject {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function parseRpcRequest(value: unknown): JsonRpcRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.jsonrpc !== "2.0" || typeof record.method !== "string") return null;
  const id =
    typeof record.id === "string" || typeof record.id === "number" || record.id === null
      ? record.id
      : undefined;
  return {
    jsonrpc: "2.0",
    id,
    method: record.method,
    params: record.params,
  };
}

async function handleSingleRpc(
  value: unknown,
  options: OptaleMcpServerOptions = {}
): Promise<JsonObject | undefined> {
  const startedAt = Date.now();
  const request = parseRpcRequest(value);
  const id = request?.id ?? null;
  if (!request) {
    await auditMcpRpc({
      context: options.gatewayContext,
      startedAt,
      method: "invalid",
      outcome: "error",
      error: "Invalid Request",
    });
    return rpcError(null, -32600, "Invalid Request");
  }

  if (request.id === undefined && request.method.startsWith("notifications/")) {
    await auditMcpRpc({
      context: options.gatewayContext,
      startedAt,
      method: request.method,
      outcome: "notification",
    });
    return undefined;
  }

  switch (request.method) {
    case "initialize": {
      const response = rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: "optale-agents",
          title: "Optale Observatory",
          version: "0.1.0",
        },
      });
      await auditMcpRpc({
        context: options.gatewayContext,
        startedAt,
        method: request.method,
        outcome: "ok",
      });
      return response;
    }

    case "ping": {
      const response = rpcResult(id, {});
      await auditMcpRpc({
        context: options.gatewayContext,
        startedAt,
        method: request.method,
        outcome: "ok",
      });
      return response;
    }

    case "tools/list": {
      const response = rpcResult(id, {
        tools: await listOptaleMcpTools(options),
      });
      await auditMcpRpc({
        context: options.gatewayContext,
        startedAt,
        method: request.method,
        outcome: "ok",
      });
      return response;
    }

    case "tools/call": {
      const params = paramsObject(request.params);
      const name = trimString(params.name);
      if (!name) {
        await auditMcpRpc({
          context: options.gatewayContext,
          startedAt,
          method: request.method,
          outcome: "error",
          error: "tools/call requires params.name",
        });
        return rpcError(id, -32602, "tools/call requires params.name");
      }
      return rpcResult(
        id,
        await callOptaleMcpTool(name, params.arguments, options)
      );
    }

    default:
      await auditMcpRpc({
        context: options.gatewayContext,
        startedAt,
        method: request.method,
        outcome: "error",
        error: `Method not found: ${request.method}`,
      });
      return rpcError(id, -32601, `Method not found: ${request.method}`);
  }
}

export async function handleOptaleMcpJsonRpc(
  body: unknown,
  options: OptaleMcpServerOptions = {}
): Promise<JsonObject | JsonObject[] | undefined> {
  if (Array.isArray(body)) {
    const results = (
      await Promise.all(body.map((entry) => handleSingleRpc(entry, options)))
    ).filter((entry): entry is JsonObject => Boolean(entry));
    return results.length > 0 ? results : undefined;
  }

  return handleSingleRpc(body, options);
}
