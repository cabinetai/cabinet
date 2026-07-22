import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { HermesSkillsManagementService } from "@/lib/hermes/governed-skills-management";
import { FakeHermesSkillsAdapter } from "@/lib/hermes/skills-management-fixture";
import { handleHermesSkillsGet, handleHermesSkillsPost } from "./route";

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

test("acceptance fixture route uses only the fake adapter", async () => {
  const adapter = new FakeHermesSkillsAdapter();
  const fixtureService = new HermesSkillsManagementService(adapter);
  const deps = { requireAuth: allowAuth, sameOrigin: allowOrigin, runtimeMode: () => "hermes" as const, fixturesEnabled: () => true, fixtureService };
  const get = new NextRequest("http://127.0.0.1:4000/api/hermes/skills-management?fixture=acceptance");
  const getResponse = await handleHermesSkillsGet(get, deps);
  const snapshot = await getResponse.json();
  assert.equal(snapshot.fixtureLabel, "Acceptance fixture — no live Hermes mutation performed");
  const preparedResponse = await handleHermesSkillsPost(request({ fixture: true, stage: "prepare", action: "install", targetIdentity: "official/productivity/installable-skill", reason: "Fixture mutation acceptance only." }), deps);
  const preview = (await preparedResponse.json()).preview;
  const committedResponse = await handleHermesSkillsPost(request({ fixture: true, stage: "commit", previewId: preview.previewId, targetIdentity: preview.targetIdentity, confirmationPhrase: preview.confirmationPhrase }), deps);
  assert.equal((await committedResponse.json()).result.status, "verified_success");
  assert.equal(adapter.mutationCalls, 1);
});
