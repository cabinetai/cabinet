import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { expectedToken, KB_AUTH_COOKIE } from "@/lib/auth/kb-auth";
import { GET } from "./route";

const originalFetch = globalThis.fetch;
const managedEnv = [
  "KB_PASSWORD",
  "CABINET_LOGIN_PBKDF2_ITERS",
  "CABINET_RUNTIME_MODE",
  "CABINET_HERMES_API_URL",
  "CABINET_HERMES_API_KEY",
  "CABINET_HERMES_MANAGEMENT_URL",
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
  process.env.CABINET_HERMES_API_URL = "http://hermes.test:8642";
  process.env.CABINET_HERMES_API_KEY = "route-secret";
  process.env.CABINET_HERMES_MANAGEMENT_URL = "http://hermes.test:56314";
  process.env.CABINET_HERMES_GATEWAY_URL = "http://hermes.test:8645";
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
      "profile",
      "status",
      "version",
    ].sort()
  );
  assert.equal(body.status, "online");
  assert.equal(body.profile, "operator-os");
  assert.ok(!JSON.stringify(body).includes(secret));
  assert.ok(!JSON.stringify(body).toLowerCase().includes("authorization"));
});

test("Hermes health bridge reports clear missing configuration without values", async () => {
  delete process.env.KB_PASSWORD;
  process.env.CABINET_RUNTIME_MODE = "hermes";
  delete process.env.CABINET_HERMES_API_KEY;
  process.env.CABINET_HERMES_PROFILE = "operator-os";

  const result = await GET(request());
  const body = await result.json();
  assert.equal(result.status, 503);
  assert.equal(body.status, "misconfigured");
  assert.match(body.message, /CABINET_HERMES_API_URL/);
  assert.ok(!JSON.stringify(body).includes("route-secret"));
});
