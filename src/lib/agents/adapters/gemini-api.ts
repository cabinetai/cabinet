import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { APICallError, streamText, type LanguageModelUsage } from "ai";
import { geminiApiProvider } from "@/lib/agents/providers/gemini-api";
import {
  GEMINI_API_KEY_ENV_VAR,
  getGeminiApiKey,
} from "@/lib/agents/providers/gemini-api-auth";
import {
  classifyChain,
  classifyCommonError,
} from "./error-classification";
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AgentExecutionAdapter,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterUsageSummary,
} from "./types";
import { readStringConfig } from "./_shared/cli-args";

const DEFAULT_MODEL = "gemini-2.5-flash";

export interface GeminiApiStream {
  textStream: AsyncIterable<string>;
  text: PromiseLike<string>;
  usage: PromiseLike<LanguageModelUsage>;
}

export interface GeminiApiClient {
  stream(input: {
    model: string;
    prompt: string;
    timeoutMs?: number;
    abortSignal?: AbortSignal;
  }): GeminiApiStream;
}

export interface GeminiApiAdapterDependencies {
  createClient?: (apiKey: string) => GeminiApiClient;
}

function createClient(apiKey: string): GeminiApiClient {
  const google = createGoogleGenerativeAI({ apiKey });
  return {
    stream(input) {
      const result = streamText({
        model: google(input.model),
        prompt: input.prompt,
        abortSignal: input.abortSignal,
        maxRetries: 0,
        timeout: input.timeoutMs,
      });
      return {
        textStream: result.textStream,
        text: result.text,
        usage: result.usage,
      };
    },
  };
}

function sanitizeError(error: unknown, apiKey: string | null): string {
  const message = error instanceof Error ? error.message : String(error);
  return apiKey ? message.split(apiKey).join("[redacted]") : message;
}

function toUsage(usage: LanguageModelUsage): AdapterUsageSummary {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails.cacheReadTokens ?? undefined,
  };
}

function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /abort|timed? ?out|deadline exceeded/i.test(message);
}

function isAuthenticationError(error: unknown): boolean {
  const message = [
    error instanceof Error ? error.message : String(error),
    APICallError.isInstance(error) ? error.responseBody || "" : "",
  ].join(" ");
  if (APICallError.isInstance(error) && error.statusCode === 401) return true;
  return /unauthori[sz]ed|invalid api key|api key.{0,20}(invalid|not valid|expired)/i.test(
    message
  );
}

function failureResult(
  error: unknown,
  apiKey: string | null,
  model: string,
  output: string
): AdapterExecutionResult {
  const errorMessage = sanitizeError(error, apiKey);
  return {
    exitCode: 1,
    signal: null,
    timedOut: isTimeoutError(error),
    errorMessage,
    errorCode: "gemini_api_error",
    provider: geminiApiProvider.id,
    model,
    billingType: "metered_api",
    output: output.trim() || null,
  };
}

async function executeGeminiRequest(
  ctx: AdapterExecutionContext,
  clientFactory: (apiKey: string) => GeminiApiClient
): Promise<AdapterExecutionResult> {
  const apiKey = getGeminiApiKey();
  const model = readStringConfig(ctx.config, "model") || DEFAULT_MODEL;
  if (!apiKey) {
    return failureResult(
      new Error(`Missing ${GEMINI_API_KEY_ENV_VAR}. Add it in Settings → API Keys.`),
      apiKey,
      model,
      ""
    );
  }

  const client = clientFactory(apiKey);
  const chunks: string[] = [];
  await ctx.onMeta?.({
    adapterType: ctx.adapterType,
    command: "Vercel AI SDK / Google Gemini API",
    commandNotes: ["API credentials are redacted."],
    prompt: ctx.prompt,
  });

  try {
    const generation = client.stream({
      model,
      prompt: ctx.prompt,
      timeoutMs: ctx.timeoutMs,
      abortSignal: ctx.abortSignal,
    });
    for await (const chunk of generation.textStream) {
      if (!chunk) continue;
      chunks.push(chunk);
      await ctx.onLog("stdout", chunk);
    }

    const [text, usage] = await Promise.all([generation.text, generation.usage]);
    const output = text.trim() || chunks.join("").trim() || null;
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      usage: toUsage(usage),
      provider: geminiApiProvider.id,
      model,
      billingType: "metered_api",
      summary: output ? output.split("\n").find(Boolean)?.slice(0, 300) || null : null,
      output,
    };
  } catch (error) {
    return failureResult(error, apiKey, model, chunks.join(""));
  }
}

function buildEnvironmentResult(
  adapterType: string,
  status: "pass" | "fail",
  message: string,
  code: "provider_authentication" | "provider_request",
  detail?: string
): AdapterEnvironmentTestResult {
  return {
    adapterType,
    status,
    checks: [
      {
        code,
        level: status === "pass" ? "info" : "error",
        message,
        ...(detail ? { detail } : {}),
      },
    ],
    testedAt: new Date().toISOString(),
  };
}

async function testGeminiEnvironment(
  ctx: AdapterEnvironmentTestContext | undefined,
  clientFactory: (apiKey: string) => GeminiApiClient
): Promise<AdapterEnvironmentTestResult> {
  const apiKey = getGeminiApiKey(ctx?.env);
  if (!apiKey) {
    return buildEnvironmentResult(
      ctx?.adapterType || "gemini_api",
      "fail",
      `Missing ${GEMINI_API_KEY_ENV_VAR}. Add it in Settings → API Keys.`,
      "provider_authentication"
    );
  }

  try {
    const generation = clientFactory(apiKey).stream({
      model: DEFAULT_MODEL,
      prompt: "Reply with exactly OK.",
      timeoutMs: 15_000,
    });
    const text = (await generation.text).trim();
    return buildEnvironmentResult(
      ctx?.adapterType || "gemini_api",
      "pass",
      "Gemini API responded successfully.",
      "provider_request",
      text ? `Model response: ${text.slice(0, 120)}` : undefined
    );
  } catch (error) {
    return buildEnvironmentResult(
      ctx?.adapterType || "gemini_api",
      "fail",
      "Gemini API request failed.",
      isAuthenticationError(error) ? "provider_authentication" : "provider_request",
      sanitizeError(error, apiKey)
    );
  }
}

export function createGeminiApiAdapter(
  dependencies: GeminiApiAdapterDependencies = {}
): AgentExecutionAdapter {
  const clientFactory = dependencies.createClient || createClient;
  return {
    type: "gemini_api",
    name: "Gemini API",
    description:
      "Gemini API execution through the Vercel AI SDK with streamed output and normalized usage.",
    providerId: geminiApiProvider.id,
    executionEngine: "api",
    supportsDetachedRuns: true,
    supportsSessionResume: false,
    capabilities: {
      streaming: true,
      sessions: false,
      detachedRuns: true,
    },
    models: geminiApiProvider.models,
    classifyError(stderr, exitCode) {
      return classifyChain(stderr, exitCode, [
        (text, code) =>
          classifyCommonError(text, code, {
            providerDisplayName: "Gemini API",
            cliCommand: "Gemini API",
          }),
      ]);
    },
    async testEnvironment(ctx) {
      return testGeminiEnvironment(ctx, clientFactory);
    },
    async execute(ctx) {
      return executeGeminiRequest(ctx, clientFactory);
    },
  };
}

export const geminiApiAdapter = createGeminiApiAdapter();
