import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { expectedToken, KB_AUTH_COOKIE } from "@/lib/auth/kb-auth";
import { buildHermesRuntimeInterventionFixtureProjection } from "@/lib/hermes/control-center-intervention-fixture";
import { handleRuntimeInterventionPost, POST } from "./route";

const managedEnv = ["KB_PASSWORD", "CABINET_LOGIN_PBKDF2_ITERS", "CABINET_RUNTIME_MODE", "CABINET_APP_ORIGIN"] as const;
const original = Object.fromEntries(managedEnv.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of managedEnv) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function request(origin: string, cookie?: string) {
  return new NextRequest("http://127.0.0.1:4000/api/hermes/runtime-interventions", {
    method: "POST",
    headers: {
      origin,
      host: "127.0.0.1:4000",
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: "{this is deliberately invalid json",
  });
}

test("intervention route rejects unauthenticated requests before parsing or acting", async () => {
  process.env.KB_PASSWORD = "route-password";
  process.env.CABINET_LOGIN_PBKDF2_ITERS = "1";
  process.env.CABINET_RUNTIME_MODE = "hermes";
  const response = await POST(request("http://127.0.0.1:4000"));
  assert.equal(response.status, 401);
});

test("intervention route rejects cross-origin requests before parsing or acting", async () => {
  process.env.KB_PASSWORD = "route-password";
  process.env.CABINET_LOGIN_PBKDF2_ITERS = "1";
  process.env.CABINET_RUNTIME_MODE = "hermes";
  const token = await expectedToken();
  const response = await POST(request("https://foreign.example", `${KB_AUTH_COOKIE}=${token}`));
  assert.equal(response.status, 403);
  assert.match(JSON.stringify(await response.json()), /Cross-origin/);
});

test("same-origin authenticated request passes both boundary gates", async () => {
  process.env.KB_PASSWORD = "route-password";
  process.env.CABINET_LOGIN_PBKDF2_ITERS = "1";
  process.env.CABINET_RUNTIME_MODE = "hermes";
  process.env.CABINET_APP_ORIGIN = "http://127.0.0.1:4000";
  const token = await expectedToken();
  const response = await POST(request("http://127.0.0.1:4000", `${KB_AUTH_COOKIE}=${token}`));
  assert.equal(response.status, 502);
  assert.doesNotMatch(JSON.stringify(await response.json()), /Unauthorized|Cross-origin/);
});

test("browser-authored live provenance cannot authorize a fixture mutation", async () => {
  let prepares = 0;
  const fixture = buildHermesRuntimeInterventionFixtureProjection({ implementationRevision: "route-test", artifactGeneratedAt: "2026-07-20T03:30:00.000Z" });
  const req = new NextRequest("http://127.0.0.1:4000/api/hermes/runtime-interventions", {
    method: "POST",
    headers: { origin: "http://127.0.0.1:4000", host: "127.0.0.1:4000", "content-type": "application/json" },
    body: JSON.stringify({ stage: "prepare", targetRunId: "17", reason: "Fabricated browser authority", provenanceKind: "live_runtime", confirmed: true }),
  });
  const response = await handleRuntimeInterventionPost(req, {
    requireAuth: async () => null,
    sameOrigin: () => null,
    runtimeMode: () => "hermes",
    actorIdentity: async () => "opaque-test-actor",
    snapshot: async () => fixture,
    service: {
      prepare: async () => { prepares += 1; throw new Error("must not be reached"); },
      commit: async () => { throw new Error("must not be reached"); },
      recheck: async () => { throw new Error("must not be reached"); },
    },
  });
  assert.equal(response.status, 403);
  assert.equal(prepares, 0);
});

test("same-origin authenticated live authority reaches the intervention service", async () => {
  let prepares = 0;
  const fixture = buildHermesRuntimeInterventionFixtureProjection({ implementationRevision: "route-test", artifactGeneratedAt: new Date().toISOString() });
  const live = structuredClone(fixture);
  const observedAt = new Date().toISOString();
  live.provenance = { kind: "live_runtime", label: "Live runtime projection", capturedAt: observedAt, fixtureId: null };
  live.runtimeExecution.observedAt = observedAt;
  const req = new NextRequest("http://127.0.0.1:4000/api/hermes/runtime-interventions", {
    method: "POST",
    headers: { origin: "http://127.0.0.1:4000", host: "127.0.0.1:4000", "content-type": "application/json" },
    body: JSON.stringify({ stage: "prepare", targetRunId: "17", reason: "Stop the duplicate worker safely" }),
  });
  const response = await handleRuntimeInterventionPost(req, {
    requireAuth: async () => null,
    sameOrigin: () => null,
    runtimeMode: () => "hermes",
    actorIdentity: async () => "opaque-test-actor",
    snapshot: async () => live,
    service: {
      prepare: async () => { prepares += 1; throw new Error("service reached"); },
      commit: async () => { throw new Error("must not be reached"); },
      recheck: async () => { throw new Error("must not be reached"); },
    },
  });
  assert.equal(response.status, 502);
  assert.equal(prepares, 1);
});
