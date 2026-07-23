import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { expectedToken, KB_AUTH_COOKIE } from "@/lib/auth/kb-auth";
import { GET, projectHermesHealth } from "./route";

const originalFetch = globalThis.fetch;
const managedEnv = [
  "KB_PASSWORD",
  "CABINET_LOGIN_PBKDF2_ITERS",
  "CABINET_RUNTIME_MODE",
  "CABINET_HERMES_API_URL",
  "CABINET_HERMES_API_KEY",
  "CABINET_HERMES_MANAGEMENT_URL",
  "CABINET_HERMES_MANAGEMENT_TOKEN",
  "CABINET_HERMES_GATEWAY_URL",
  "CABINET_HERMES_GATEWAY_TOKEN",
  "CABINET_HERMES_PROFILE",
] as const;
const originalEnv = Object.fromEntries(
  managedEnv.map((name) => [name, process.env[name]])
);

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const name of managedEnv) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function request(cookie?: string): NextRequest {
  return new NextRequest("http://127.0.0.1:4000/api/hermes/health", {
    headers: cookie ? { cookie } : undefined,
  });
}

function configureHermes() {
  process.env.CABINET_RUNTIME_MODE = "hermes";
  process.env.CABINET_HERMES_API_URL = "http://127.0.0.1:8642";
  process.env.CABINET_HERMES_API_KEY = "route-secret";
  process.env.CABINET_HERMES_MANAGEMENT_URL = "http://127.0.0.1:56314";
  process.env.CABINET_HERMES_GATEWAY_URL = "http://127.0.0.1:8645";
  process.env.CABINET_HERMES_GATEWAY_TOKEN = "gateway-secret";
  process.env.CABINET_HERMES_PROFILE = "operator-os";
}

test("Hermes health bridge rejects an unauthenticated Cabinet request", async () => {
  process.env.KB_PASSWORD = "test-password";
  process.env.CABINET_LOGIN_PBKDF2_ITERS = "1";
  configureHermes();
  const result = await GET(request());
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { error: "Unauthorized" });
});

test("Hermes health bridge returns only the normalized server-side snapshot", async () => {
  process.env.KB_PASSWORD = "test-password";
  process.env.CABINET_LOGIN_PBKDF2_ITERS = "1";
  configureHermes();
  const secret = process.env.CABINET_HERMES_API_KEY!;
  globalThis.fetch = async (input) =>
    String(input).endsWith("/health/detailed")
      ? new Response(
          JSON.stringify({
            status: "ok",
            version: "0.18.2",
            gateway_state: "running",
            secret,
          })
        )
      : new Response(JSON.stringify({ profiles: ["operator-os"], secret }));

  const token = await expectedToken();
  const result = await GET(request(`${KB_AUTH_COOKIE}=${token}`));
  const body = await result.json();

  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(
    Object.keys(body).sort(),
    [
      "checkedAt",
      "enabled",
      "gatewayState",
      "message",
      "observationSource",
      "profile",
      "profileSource",
      "status",
      "version",
    ].sort()
  );
  assert.equal(body.status, "online");
  assert.equal(body.profile, null);
  assert.equal(body.profileSource, null);
  assert.equal(body.observationSource, "GET /health/detailed");
  assert.ok(!JSON.stringify(body).includes(secret));
  assert.ok(!JSON.stringify(body).toLowerCase().includes("authorization"));
});

test("Hermes health bridge projects expected unavailable, timeout, and authentication states over HTTP 200", async () => {
  delete process.env.KB_PASSWORD;
  configureHermes();
  const cases = [
    [503, "probe_unavailable"],
    [401, "authentication_failure"],
  ] as const;
  for (const [upstreamStatus, expectedStatus] of cases) {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({}), { status: upstreamStatus });
    const result = await GET(request());
    const body = await result.json();
    assert.equal(result.status, 200);
    assert.equal(body.status, expectedStatus);
    assert.equal(body.observationSource, "GET /health/detailed");
    assert.ok(Number.isFinite(Date.parse(body.checkedAt)));
  }

  globalThis.fetch = async () => {
    throw new DOMException("bounded fixture timeout", "AbortError");
  };
  const timedOut = await GET(request());
  const timeoutBody = await timedOut.json();
  assert.equal(timedOut.status, 200);
  assert.equal(timeoutBody.status, "probe_timeout");
  assert.doesNotMatch(timeoutBody.message, /offline/i);
});

test("Hermes health bridge projects missing configuration over HTTP 200 without values", async () => {
  delete process.env.KB_PASSWORD;
  process.env.CABINET_RUNTIME_MODE = "hermes";
  delete process.env.CABINET_HERMES_API_KEY;
  process.env.CABINET_HERMES_PROFILE = "operator-os";

  const result = await GET(request());
  const body = await result.json();
  assert.equal(result.status, 200);
  assert.equal(body.status, "misconfigured");
  assert.match(body.message, /CABINET_HERMES_API_URL/);
  assert.ok(!JSON.stringify(body).includes("route-secret"));
});

test("Hermes health bridge projects rejected public configuration over HTTP 200 before any credential-bearing request", async () => {
  delete process.env.KB_PASSWORD;
  configureHermes();
  process.env.CABINET_HERMES_API_URL = "https://public.example:8642";
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(JSON.stringify({ status: "ok" }));
  };
  const result = await GET(request());
  const body = await result.json();
  assert.equal(result.status, 200);
  assert.equal(body.status, "misconfigured");
  assert.equal(requests, 0);
  assert.doesNotMatch(JSON.stringify(body), /public\.example|route-secret/);
});

test("Hermes health bridge reserves HTTP 500 for Cabinet projection failures", async () => {
  const result = await projectHermesHealth(() => {
    throw new Error("fixture internal failure");
  });
  assert.equal(result.status, 500);
  assert.deepEqual(await result.json(), {
    error: {
      code: "health_projection_failed",
      message: "Cabinet could not generate the Hermes health projection.",
    },
  });
});
