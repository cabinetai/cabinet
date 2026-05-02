import { openRouterProvider } from "../providers/openrouter";
import { providerStatusToEnvironmentTest } from "./environment";
import {
  classifyChain,
  classifyCommonError,
} from "./error-classification";
import type {
  AdapterBillingType,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterUsageSummary,
  AgentExecutionAdapter,
} from "./types";
import { readEffortConfig, readStringConfig } from "./_shared/cli-args";
import {
  buildGovernedMcpCommandNote,
  readGovernedMcpConfig,
} from "./_shared/governed-mcp";
import {
  buildInternalOptaleMcpGatewayContext,
  type OptaleMcpGatewayContext,
} from "@/lib/optale/mcp-gateway";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: OpenRouterToolCall[];
};

type OpenRouterTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type OpenRouterToolCall = {
  id: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
};

type OpenRouterResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      role?: string;
      content?: unknown;
      tool_calls?: OpenRouterToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    cached_tokens?: number;
  };
};

type OptaleMcpToolCallResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const DEFAULT_MODEL = "openrouter/auto";
const DEFAULT_MAX_TOOL_ITERATIONS = 4;

function firstNonEmptyLine(text: string): string | null {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || null
  );
}

function openRouterApiKey(config: Record<string, unknown>): string | null {
  return (
    readStringConfig(config, "apiKey") ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    null
  );
}

function openRouterBaseUrl(config: Record<string, unknown>): string {
  return (
    readStringConfig(config, "baseUrl") ||
    process.env.OPENROUTER_BASE_URL?.trim() ||
    "https://openrouter.ai/api/v1"
  ).replace(/\/+$/, "");
}

function numberConfig(
  config: Record<string, unknown>,
  key: string
): number | undefined {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanConfig(
  config: Record<string, unknown>,
  key: string
): boolean | undefined {
  return typeof config[key] === "boolean" ? config[key] : undefined;
}

function shouldExposeOptaleMcpTools(config: Record<string, unknown>): boolean {
  if (booleanConfig(config, "enableMcpTools") === false) return false;
  const governedMcp = readGovernedMcpConfig(config);
  if (!governedMcp) return true;
  return governedMcp.allowedServerIds.some((id) =>
    id === "optale-agents" || id === "qmd" || id === "graphiti"
  );
}

function shouldExposeDownstreamMcpTools(config: Record<string, unknown>): boolean {
  const governedMcp = readGovernedMcpConfig(config);
  if (!governedMcp) return false;
  return governedMcp.allowedServerIds.some((id) => id === "qmd" || id === "graphiti");
}

function buildOpenRouterMcpGatewayContext(
  ctx: AdapterExecutionContext
): OptaleMcpGatewayContext {
  const governedMcp = readGovernedMcpConfig(ctx.config);
  return buildInternalOptaleMcpGatewayContext({
    requestId: ctx.runId,
    clientId: "openrouter-api",
    defaultCabinetPath: governedMcp?.cabinetPath,
    agentScope: governedMcp?.agentScope,
    allowedTools: governedMcp?.allowedTools,
  });
}

async function buildOpenRouterTools(input: {
  ctx: AdapterExecutionContext;
  gatewayContext: OptaleMcpGatewayContext;
}): Promise<OpenRouterTool[]> {
  if (!shouldExposeOptaleMcpTools(input.ctx.config)) return [];
  const governedMcp = readGovernedMcpConfig(input.ctx.config);
  const { listOptaleMcpTools } = await import("@/lib/optale/mcp-server");
  const tools = await listOptaleMcpTools({
    gatewayContext: input.gatewayContext,
    includeDownstream: shouldExposeDownstreamMcpTools(input.ctx.config),
    allowedServerIds: governedMcp?.allowedServerIds,
  });
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const record = item as Record<string, unknown>;
        return typeof record.text === "string" ? record.text : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function usageFromResponse(response: OpenRouterResponse): AdapterUsageSummary | undefined {
  const usage = response.usage;
  if (!usage) return undefined;
  const inputTokens = usage.prompt_tokens ?? usage.input_tokens;
  const outputTokens = usage.completion_tokens ?? usage.output_tokens;
  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") {
    return undefined;
  }
  const summary: AdapterUsageSummary = {
    inputTokens,
    outputTokens,
  };
  if (typeof usage.cached_tokens === "number") {
    summary.cachedInputTokens = usage.cached_tokens;
  }
  return summary;
}

function toolResultText(result: OptaleMcpToolCallResult): string {
  const text = result.content.map((entry) => entry.text).join("\n").trim();
  if (!result.isError) return text || "{}";
  return JSON.stringify({ error: text || "Tool failed." });
}

function buildRequestBody(input: {
  ctx: AdapterExecutionContext;
  messages: OpenRouterMessage[];
  tools: OpenRouterTool[];
}): Record<string, unknown> {
  const { ctx, messages, tools } = input;
  const model =
    readStringConfig(ctx.config, "model") ||
    process.env.OPENROUTER_MODEL?.trim() ||
    DEFAULT_MODEL;
  const effort = readEffortConfig(ctx.config);
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    session_id: ctx.runId.slice(0, 256),
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
    body.parallel_tool_calls = false;
  }

  if (effort) {
    body.reasoning = { effort, exclude: true };
  }

  const maxTokens = numberConfig(ctx.config, "maxTokens");
  if (maxTokens) body.max_tokens = maxTokens;
  const temperature = numberConfig(ctx.config, "temperature");
  if (temperature !== undefined) body.temperature = temperature;

  return body;
}

async function postOpenRouterChat(input: {
  ctx: AdapterExecutionContext;
  apiKey: string;
  messages: OpenRouterMessage[];
  tools: OpenRouterTool[];
}): Promise<OpenRouterResponse> {
  const endpoint = `${openRouterBaseUrl(input.ctx.config)}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.OPENROUTER_SITE_URL?.trim() ||
        process.env.CABINET_APP_ORIGIN?.trim() ||
        "https://observatory.optale.com",
      "X-Title": process.env.OPENROUTER_APP_TITLE?.trim() || "Optale Agents",
    },
    body: JSON.stringify(
      buildRequestBody({
        ctx: input.ctx,
        messages: input.messages,
        tools: input.tools,
      })
    ),
  });

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const record =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    const error = record.error;
    const message =
      error && typeof error === "object" && !Array.isArray(error)
        ? typeof (error as Record<string, unknown>).message === "string"
          ? ((error as Record<string, unknown>).message as string)
          : raw
        : raw;
    throw new Error(message || `OpenRouter request failed (${response.status})`);
  }

  return (parsed || {}) as OpenRouterResponse;
}

async function executeToolCalls(input: {
  ctx: AdapterExecutionContext;
  messages: OpenRouterMessage[];
  toolCalls: OpenRouterToolCall[];
  gatewayContext: OptaleMcpGatewayContext;
}): Promise<void> {
  for (const toolCall of input.toolCalls) {
    const name = toolCall.function?.name;
    if (!name) continue;
    const args = parseToolArguments(toolCall.function?.arguments);
    await input.ctx.onLog("stdout", `[tool] ${name}\n`);
    const { callOptaleMcpTool } = await import("@/lib/optale/mcp-server");
    const governedMcp = readGovernedMcpConfig(input.ctx.config);
    const result = await callOptaleMcpTool(name, args, {
      gatewayContext: input.gatewayContext,
      includeDownstream: shouldExposeDownstreamMcpTools(input.ctx.config),
      allowedServerIds: governedMcp?.allowedServerIds,
    });
    input.messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: toolResultText(result),
    });
  }
}

export const openRouterApiAdapter: AgentExecutionAdapter = {
  type: "openrouter_api",
  name: "OpenRouter API",
  description:
    "Structured OpenRouter API execution with Optale MCP tools converted to OpenAI-style tool calls.",
  providerId: openRouterProvider.id,
  executionEngine: "api",
  supportsDetachedRuns: true,
  supportsSessionResume: false,
  models: openRouterProvider.models,
  effortLevels: openRouterProvider.effortLevels,
  classifyError(stderr, exitCode) {
    return classifyChain(stderr, exitCode, [
      (s, c) =>
        classifyCommonError(s, c, {
          providerDisplayName: "OpenRouter",
          cliCommand: "OpenRouter API",
        }),
    ]);
  },
  async testEnvironment() {
    return providerStatusToEnvironmentTest(
      "openrouter_api",
      await openRouterProvider.healthCheck(),
      openRouterProvider.installMessage
    );
  },
  async execute(ctx): Promise<AdapterExecutionResult> {
    const apiKey = openRouterApiKey(ctx.config);
    const gatewayContext = buildOpenRouterMcpGatewayContext(ctx);
    const tools = await buildOpenRouterTools({ ctx, gatewayContext });
    const governedMcp = readGovernedMcpConfig(ctx.config);
    const governedNote = buildGovernedMcpCommandNote(governedMcp);
    const model =
      readStringConfig(ctx.config, "model") ||
      process.env.OPENROUTER_MODEL?.trim() ||
      DEFAULT_MODEL;

    await ctx.onMeta?.({
      adapterType: ctx.adapterType,
      command: "openrouter.chat.completions",
      commandArgs: [model],
      commandNotes: [
        `OpenRouter API tool loop with ${tools.length} Optale MCP tools exposed.`,
        ...(governedNote ? [governedNote] : []),
      ],
      cwd: ctx.cwd,
    });

    if (!apiKey) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: "OPENROUTER_API_KEY is not set.",
        provider: openRouterProvider.id,
        model,
        billingType: "metered_api" satisfies AdapterBillingType,
      };
    }

    const messages: OpenRouterMessage[] = [{ role: "user", content: ctx.prompt }];
    const outputs: string[] = [];
    const maxToolIterations =
      numberConfig(ctx.config, "maxToolIterations") || DEFAULT_MAX_TOOL_ITERATIONS;
    let finalResponse: OpenRouterResponse | null = null;

    try {
      for (let iteration = 0; iteration <= maxToolIterations; iteration += 1) {
        const response = await postOpenRouterChat({
          ctx,
          apiKey,
          messages,
          tools,
        });
        finalResponse = response;
        const choice = response.choices?.[0];
        const message = choice?.message || {};
        const content = normalizeContent(message.content);
        const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

        messages.push({
          role: "assistant",
          content: content || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });

        if (content) {
          outputs.push(content);
          await ctx.onLog("stdout", `${content}\n`);
        }

        if (toolCalls.length === 0) {
          const output = outputs.join("\n\n").trim();
          return {
            exitCode: 0,
            signal: null,
            timedOut: false,
            usage: usageFromResponse(response),
            sessionId: response.id || null,
            provider: openRouterProvider.id,
            model: response.model || model,
            billingType: "metered_api",
            summary: firstNonEmptyLine(output || content || "")?.slice(0, 300) || null,
            output,
          };
        }

        if (iteration === maxToolIterations) {
          throw new Error(`OpenRouter exceeded ${maxToolIterations} tool-call iterations.`);
        }

        await executeToolCalls({ ctx, messages, toolCalls, gatewayContext });
      }

      throw new Error("OpenRouter tool loop exited unexpectedly.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: message,
        usage: finalResponse ? usageFromResponse(finalResponse) : undefined,
        provider: openRouterProvider.id,
        model: finalResponse?.model || model,
        billingType: "metered_api",
        output: outputs.join("\n\n").trim() || null,
      };
    }
  },
};
