import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/optale/observatory/[...path]/route";

function makeRequest() {
  return new NextRequest(
    "http://localhost:4001/api/optale/observatory/dashboard?hours=24",
    {
      headers: {
        accept: "application/json",
        authorization: "Bearer browser-token",
      },
    },
  );
}

function routeParams(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function withEnv<T>(
  patch: Partial<Record<string, string | undefined>>,
  callback: () => Promise<T>,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    previous[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return callback().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("observatory proxy forwards server-side harness key as bearer auth", async () => {
  const previousFetch = globalThis.fetch;
  let upstreamHeaders: Headers | undefined;

  globalThis.fetch = async (_url, init) => {
    upstreamHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withEnv(
      {
        OPTALE_AGENT_HARNESS_URL: "http://harness.internal",
        OPTALE_AGENT_HARNESS_API_KEY: "server-token",
        OPTALE_AGENT_HARNESS_AUTH_HEADER: "authorization",
      },
      async () => {
        const response = await GET(makeRequest(), routeParams(["dashboard"]));
        assert.equal(response.status, 200);
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(upstreamHeaders?.get("authorization"), "Bearer server-token");
  assert.equal(upstreamHeaders?.get("x-harness-api-key"), null);
});

test("observatory proxy can forward server-side harness key as x-harness-api-key", async () => {
  const previousFetch = globalThis.fetch;
  let upstreamHeaders: Headers | undefined;

  globalThis.fetch = async (_url, init) => {
    upstreamHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withEnv(
      {
        OPTALE_AGENT_HARNESS_URL: "http://harness.internal",
        OPTALE_AGENT_HARNESS_API_KEY: "server-token",
        OPTALE_AGENT_HARNESS_AUTH_HEADER: "x-harness-api-key",
      },
      async () => {
        const response = await GET(makeRequest(), routeParams(["dashboard"]));
        assert.equal(response.status, 200);
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(upstreamHeaders?.get("authorization"), null);
  assert.equal(upstreamHeaders?.get("x-harness-api-key"), "server-token");
});

test("observatory proxy omits harness auth when no server-side key is configured", async () => {
  const previousFetch = globalThis.fetch;
  let upstreamHeaders: Headers | undefined;

  globalThis.fetch = async (_url, init) => {
    upstreamHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withEnv(
      {
        OPTALE_AGENT_HARNESS_URL: "http://harness.internal",
        OPTALE_AGENT_HARNESS_API_KEY: undefined,
        OPTALE_AGENT_HARNESS_AUTH_HEADER: undefined,
      },
      async () => {
        const response = await GET(makeRequest(), routeParams(["dashboard"]));
        assert.equal(response.status, 200);
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(upstreamHeaders?.get("authorization"), null);
  assert.equal(upstreamHeaders?.get("x-harness-api-key"), null);
});
