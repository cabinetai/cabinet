import test from "node:test";
import assert from "node:assert/strict";
import type { LanguageModelUsage } from "ai";
import {
  createGeminiApiAdapter,
  type GeminiApiClient,
  type GeminiApiStream,
} from "./gemini-api";

const usage: LanguageModelUsage = {
  inputTokens: 11,
  inputTokenDetails: {
    noCacheTokens: 9,
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
  },
  outputTokens: 7,
  outputTokenDetails: {
    textTokens: 7,
    reasoningTokens: 0,
  },
  totalTokens: 18,
};

function fakeStream(chunks: string[]): GeminiApiStream {
  return {
    textStream: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    text: Promise.resolve(chunks.join("")),
    usage: Promise.resolve(usage),
  };
}

function restoreApiKey(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.GOOGLE_AI_API_KEY;
  } else {
    process.env.GOOGLE_AI_API_KEY = previous;
  }
}

test("Gemini API adapter streams output and normalizes usage", async (t) => {
  const previousKey = process.env.GOOGLE_AI_API_KEY;
  process.env.GOOGLE_AI_API_KEY = "test-google-key";
  t.after(() => restoreApiKey(previousKey));

  let receivedModel = "";
  const client: GeminiApiClient = {
    stream(input) {
      receivedModel = input.model;
      assert.equal(input.prompt, "Write a short answer");
      assert.equal(input.timeoutMs, 4_000);
      return fakeStream(["Hello", " world"]);
    },
  };
  const adapter = createGeminiApiAdapter({ createClient: () => client });
  const logged: string[] = [];

  const result = await adapter.execute!({
    runId: "run-1",
    adapterType: adapter.type,
    config: { model: "gemini-3.7-flash" },
    prompt: "Write a short answer",
    cwd: process.cwd(),
    timeoutMs: 4_000,
    onLog: async (stream, chunk) => {
      if (stream === "stdout") logged.push(chunk);
    },
  });

  assert.equal(receivedModel, "gemini-3.7-flash");
  assert.deepEqual(logged, ["Hello", " world"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, "Hello world");
  assert.deepEqual(result.usage, {
    inputTokens: 11,
    outputTokens: 7,
    cachedInputTokens: 2,
  });
  assert.equal(result.billingType, "metered_api");
  assert.equal(result.provider, "gemini-api");
});

test("Gemini API adapter reports missing credentials without calling the provider", async (t) => {
  const previousKey = process.env.GOOGLE_AI_API_KEY;
  delete process.env.GOOGLE_AI_API_KEY;
  t.after(() => restoreApiKey(previousKey));

  let called = false;
  const adapter = createGeminiApiAdapter({
    createClient: () => ({
      stream() {
        called = true;
        return fakeStream(["unexpected"]);
      },
    }),
  });

  const result = await adapter.execute!({
    runId: "run-2",
    adapterType: adapter.type,
    config: {},
    prompt: "Hello",
    cwd: process.cwd(),
    onLog: async () => {},
  });

  assert.equal(called, false);
  assert.equal(result.exitCode, 1);
  assert.match(result.errorMessage || "", /GOOGLE_AI_API_KEY/);
  assert.equal(result.errorCode, "gemini_api_error");
});

test("Gemini API adapter environment test uses injected client and context key", async () => {
  let receivedPrompt = "";
  const adapter = createGeminiApiAdapter({
    createClient: () => ({
      stream(input) {
        receivedPrompt = input.prompt;
        return fakeStream(["OK"]);
      },
    }),
  });

  const result = await adapter.testEnvironment!({
    adapterType: adapter.type,
    env: { GOOGLE_AI_API_KEY: "context-key" },
  });

  assert.equal(result.status, "pass");
  assert.equal(receivedPrompt, "Reply with exactly OK.");
  assert.match(result.checks[0]?.detail || "", /Model response: OK/);
});

test("Gemini API adapter normalizes provider errors and redacts credentials", async (t) => {
  const previousKey = process.env.GOOGLE_AI_API_KEY;
  process.env.GOOGLE_AI_API_KEY = "secret-google-key";
  t.after(() => restoreApiKey(previousKey));

  const adapter = createGeminiApiAdapter({
    createClient: () => ({
      stream() {
        throw new Error("401 invalid key secret-google-key");
      },
    }),
  });

  const result = await adapter.execute!({
    runId: "run-3",
    adapterType: adapter.type,
    config: {},
    prompt: "Hello",
    cwd: process.cwd(),
    onLog: async () => {},
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.errorMessage || "", /401 invalid key/);
  assert.doesNotMatch(result.errorMessage || "", /secret-google-key/);
});

test("Gemini API environment failures distinguish auth from request errors", async (t) => {
  const previousKey = process.env.GOOGLE_AI_API_KEY;
  process.env.GOOGLE_AI_API_KEY = "test-google-key";
  t.after(() => restoreApiKey(previousKey));

  const requestFailureAdapter = createGeminiApiAdapter({
    createClient: () => ({
      stream() {
        throw new Error("Gemini is temporarily unavailable");
      },
    }),
  });

  const requestFailure = await requestFailureAdapter.testEnvironment!({
    adapterType: requestFailureAdapter.type,
  });

  assert.equal(requestFailure.status, "fail");
  assert.equal(requestFailure.checks[0]?.code, "provider_request");

  const authFailureAdapter = createGeminiApiAdapter({
    createClient: () => ({
      stream() {
        throw new Error("401 invalid API key");
      },
    }),
  });
  const authFailure = await authFailureAdapter.testEnvironment!({
    adapterType: authFailureAdapter.type,
  });

  assert.equal(authFailure.status, "fail");
  assert.equal(authFailure.checks[0]?.code, "provider_authentication");
});
