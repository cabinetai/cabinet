import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { HermesSkillsManagementService } from "@/lib/hermes/governed-skills-management";
import { FakeHermesSkillsAdapter } from "@/lib/hermes/skills-management-fixture";
import {
  handleHermesSkillsGet,
  handleHermesSkillsPost,
  resolveHermesSkillsRouteMode,
} from "./route";

const allowAuth = async () => null;
const allowOrigin = () => null;

function request(body: unknown, origin = "http://127.0.0.1:4000") {
  return new NextRequest("http://127.0.0.1:4000/api/hermes/skills-management", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

test("route rejects unauthenticated and cross-origin requests before acting", async () => {
  const adapter = new FakeHermesSkillsAdapter();
  const service = new HermesSkillsManagementService(adapter);
  const unauthorized = await handleHermesSkillsPost(request({ stage: "prepare" }), {
    requireAuth: async () => NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    service,
  });
  assert.equal(unauthorized.status, 401);
  const crossOrigin = await handleHermesSkillsPost(request({ stage: "prepare" }, "https://evil.example"), {
    requireAuth: allowAuth,
    sameOrigin: () => NextResponse.json({ error: "Cross-origin" }, { status: 403 }),
    runtimeMode: () => "hermes",
    service,
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal(adapter.mutationCalls, 0);
});

test("client booleans cannot bypass the prepare and typed-confirmation stages", async () => {
  const service = new HermesSkillsManagementService(new FakeHermesSkillsAdapter());
  const response = await handleHermesSkillsPost(request({ confirmed: true, action: "disable", targetIdentity: "operator-os:bundled:enabled-skill" }), {
    requireAuth: allowAuth,
    sameOrigin: allowOrigin,
    runtimeMode: () => "hermes",
    actorIdentity: async () => "actor-one",
    service,
  });
  assert.equal(response.status, 400);
  assert.match(String((await response.json()).error), /prepare, commit, or recheck/i);
});

test("authenticated same-origin prepare and commit bind to the server actor", async () => {
  const adapter = new FakeHermesSkillsAdapter();
  const service = new HermesSkillsManagementService(adapter);
  const deps = { requireAuth: allowAuth, sameOrigin: allowOrigin, runtimeMode: () => "hermes" as const, actorIdentity: async () => "actor-one", service };
  const preparedResponse = await handleHermesSkillsPost(request({ stage: "prepare", action: "install", targetIdentity: "official/productivity/installable-skill", reason: "Required for route acceptance." }), deps);
  assert.equal(preparedResponse.status, 200);
  const prepared = await preparedResponse.json();
  const preview = prepared.preview;
  const committedResponse = await handleHermesSkillsPost(request({ stage: "commit", previewId: preview.previewId, targetIdentity: preview.targetIdentity, confirmationPhrase: preview.confirmationPhrase }), deps);
  assert.equal(committedResponse.status, 200);
  assert.equal((await committedResponse.json()).result.status, "verified_success");
  assert.equal(adapter.mutationCalls, 1);
});

test("live read-only route uses the production service without mutation", async () => {
  const adapter = new FakeHermesSkillsAdapter();
  const discover = adapter.discoverCatalog.bind(adapter);
  adapter.discoverCatalog = async (query) => ({
    ...(await discover(query)),
    fixture: false,
    fixtureLabel: null,
  });
  const service = new HermesSkillsManagementService(adapter);
  const get = new NextRequest("http://127.0.0.1:4000/api/hermes/skills-management");
  const response = await handleHermesSkillsGet(get, {
    requireAuth: allowAuth,
    runtimeMode: () => "hermes",
    routeMode: () => ({ mode: "production" }),
    service,
  });
  const snapshot = await response.json();
  assert.equal(response.status, 200);
  assert.equal(snapshot.fixture, false);
  assert.equal(adapter.catalogCalls, 1);
  assert.equal(adapter.mutationCalls, 0);
});

test("acceptance fixture mode is process-selected and read-only", async () => {
  const adapter = new FakeHermesSkillsAdapter();
  const fixtureService = new HermesSkillsManagementService(adapter);
  const deps = {
    requireAuth: allowAuth,
    sameOrigin: allowOrigin,
    runtimeMode: () => "hermes" as const,
    routeMode: () => ({ mode: "fixture" as const }),
    fixtureService,
  };
  const get = new NextRequest("http://127.0.0.1:4000/api/hermes/skills-management");
  const getResponse = await handleHermesSkillsGet(get, deps);
  const snapshot = await getResponse.json();
  assert.equal(snapshot.fixtureLabel, "Acceptance fixture — no live Hermes mutation performed");
  const postResponse = await handleHermesSkillsPost(request({
    stage: "prepare",
    action: "install",
    targetIdentity: "official/productivity/installable-skill",
    reason: "Fixture must remain read-only.",
  }), deps);
  assert.equal(postResponse.status, 403);
  assert.equal((await postResponse.json()).code, "fixture_read_only");
  assert.equal(adapter.mutationCalls, 0);
});

test("browser-authored fixture selectors cannot change server mode", async () => {
  const adapter = new FakeHermesSkillsAdapter();
  const service = new HermesSkillsManagementService(adapter);
  const get = new NextRequest("http://127.0.0.1:4000/api/hermes/skills-management?fixture=acceptance");
  const getResponse = await handleHermesSkillsGet(get, {
    requireAuth: allowAuth,
    runtimeMode: () => "hermes",
    routeMode: () => ({ mode: "production" }),
    service,
  });
  assert.equal(getResponse.status, 400);
  assert.equal((await getResponse.json()).code, "browser_mode_selection_forbidden");
  const postResponse = await handleHermesSkillsPost(request({
    fixture: true,
    stage: "prepare",
    action: "install",
  }), {
    requireAuth: allowAuth,
    sameOrigin: allowOrigin,
    runtimeMode: () => "hermes",
    routeMode: () => ({ mode: "production" }),
    service,
  });
  assert.equal(postResponse.status, 400);
  assert.equal((await postResponse.json()).code, "browser_mode_selection_forbidden");
  assert.equal(adapter.catalogCalls, 0);
  assert.equal(adapter.mutationCalls, 0);
});

test("fixture mode defaults off and fails closed outside isolation", () => {
  assert.deepEqual(resolveHermesSkillsRouteMode({}), { mode: "production" });
  assert.deepEqual(
    resolveHermesSkillsRouteMode({
      CABINET_ACCEPTANCE_SKILLS_MODE: "fixture",
      CABINET_ACCEPTANCE_ISOLATED: "1",
    }),
    { mode: "fixture" },
  );
  assert.deepEqual(
    resolveHermesSkillsRouteMode({
      CABINET_ACCEPTANCE_SKILLS_MODE: "fixture",
    }),
    { mode: "unavailable", code: "fixture_requires_isolation" },
  );
  assert.deepEqual(
    resolveHermesSkillsRouteMode({
      CABINET_ACCEPTANCE_SKILLS_MODE: "unexpected",
      CABINET_ACCEPTANCE_ISOLATED: "1",
    }),
    { mode: "unavailable", code: "invalid_mode" },
  );
});

test("invalid process mode returns a bounded typed state", async () => {
  const response = await handleHermesSkillsGet(
    new NextRequest("http://127.0.0.1:4000/api/hermes/skills-management"),
    {
      requireAuth: allowAuth,
      runtimeMode: () => "hermes",
      routeMode: () => ({ mode: "unavailable", code: "invalid_mode" }),
    },
  );
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.deepEqual(
    { state: body.state, code: body.code },
    { state: "unavailable", code: "invalid_mode" },
  );
  assert.doesNotMatch(body.error, /CABINET_|environment/i);
});
