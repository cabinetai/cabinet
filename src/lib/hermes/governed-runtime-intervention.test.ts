import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildHermesRuntimeInterventionFixtureProjection } from "./control-center-intervention-fixture";
import { hermesProjectionMatrixRows } from "./control-center-projection";
import {
  establishHermesLiveInterventionAuthority,
  HermesRuntimeInterventionError,
  HermesRuntimeInterventionService,
  type HermesLiveInterventionAuthority,
  type HermesRuntimeInterventionClient,
  type HermesRuntimeInterventionPreview,
  hermesRuntimeInterventionConfigIdentity,
} from "./governed-runtime-intervention";
import { HermesManagementRequestError, type HermesKanbanRunState } from "./management-client";

const NOW = new Date("2026-07-20T03:30:00.000Z");
const ACTOR = "cabinet-local-test-actor";
const active = (overrides: Partial<HermesKanbanRunState> = {}): HermesKanbanRunState => ({
  runId: "17", taskId: "23", status: "running", startedAt: "2026-07-20T03:20:00.000Z",
  endedAt: null, outcome: null, claimIdentity: "private-claim-value", ...overrides,
});
const reclaimed = (): HermesKanbanRunState => active({ status: "reclaimed", endedAt: "2026-07-20T03:30:01.000Z", outcome: "reclaimed", claimIdentity: null });
const authority = (overrides: Partial<HermesLiveInterventionAuthority> = {}): HermesLiveInterventionAuthority => ({
  kind: "live_runtime", targetRunId: "17", source: "Hermes active workers", interface: "/api/plugins/kanban/workers/active",
  observedAt: NOW.toISOString(), authorityIdentity: "hermes-live-test-authority", ...overrides,
});

class FakeClient implements HermesRuntimeInterventionClient {
  reads = 0;
  mutations = 0;
  reasons: string[] = [];
  states: Array<HermesKanbanRunState | Error> = [active(), active(), reclaimed()];
  mutationError: Error | null = null;
  mutationGate: Promise<void> | null = null;
  async readKanbanRun() {
    const value = this.states[Math.min(this.reads++, this.states.length - 1)]!;
    if (value instanceof Error) throw value;
    return value;
  }
  async terminateKanbanRun(_runId: string, reason: string) {
    this.mutations += 1;
    this.reasons.push(reason);
    if (this.mutationGate) await this.mutationGate;
    if (this.mutationError) throw this.mutationError;
    return { runId: "17", taskId: "23" };
  }
}

function setup(clock = { value: NOW.getTime() }) {
  const client = new FakeClient();
  return { client, clock, service: new HermesRuntimeInterventionService(client, () => new Date(clock.value)) };
}
async function prepare(subject: ReturnType<typeof setup>, overrides: Partial<Parameters<HermesRuntimeInterventionService["prepare"]>[0]> = {}) {
  return subject.service.prepare({ targetRunId: "17", reason: "Stop the duplicate worker safely", authority: authority(), actorIdentity: ACTOR, ...overrides });
}
function commit(subject: ReturnType<typeof setup>, preview: HermesRuntimeInterventionPreview, overrides: Partial<Parameters<HermesRuntimeInterventionService["commit"]>[0]> = {}) {
  return subject.service.commit({ previewId: preview.previewId, targetRunId: "17", confirmationPhrase: preview.confirmationPhrase, actorIdentity: ACTOR, ...overrides });
}

test("preview is read-only, stable, server-authorized, and exposes no claim identity", async () => {
  const subject = setup();
  const first = await prepare(subject);
  const second = await prepare(subject);
  assert.equal(subject.client.mutations, 0);
  assert.equal(first.idempotencyIdentity, second.idempotencyIdentity);
  assert.equal(first.confirmationPhrase, "TERMINATE RUN 17");
  assert.equal(first.phase, "prepared");
  assert.doesNotMatch(JSON.stringify(first), /private-claim-value|authorityIdentity|actorIdentity/);
});

test("server authority rejects fixture, stale, unavailable, and mismatched projections", () => {
  const fixture = buildHermesRuntimeInterventionFixtureProjection({ implementationRevision: "test", artifactGeneratedAt: NOW.toISOString() });
  assert.throws(() => establishHermesLiveInterventionAuthority(fixture, "17", NOW), (error: unknown) => error instanceof HermesRuntimeInterventionError && error.code === "fixture_forbidden");
  const live = structuredClone(fixture);
  live.provenance = { kind: "live_runtime", label: "Live runtime projection", capturedAt: NOW.toISOString(), fixtureId: null };
  live.runtimeExecution.observedAt = new Date(NOW.getTime() - 31_000).toISOString();
  assert.throws(() => establishHermesLiveInterventionAuthority(live, "17", NOW), /fresh live Hermes/);
  live.runtimeExecution.observedAt = NOW.toISOString();
  live.runtimeExecution.runs[0]!.state = "failed";
  assert.throws(() => establishHermesLiveInterventionAuthority(live, "17", NOW), /fresh live Hermes/);
  assert.throws(() => establishHermesLiveInterventionAuthority(live, "18", NOW), /fresh live Hermes/);
});

test("exact typed phrase, target, and authenticated actor are mandatory", async () => {
  const subject = setup();
  const preview = await prepare(subject);
  await assert.rejects(commit(subject, preview, { confirmationPhrase: "terminate run 17" }), /exact server-issued/);
  await assert.rejects(commit(subject, preview, { targetRunId: "18" }), /does not match/);
  await assert.rejects(commit(subject, preview, { actorIdentity: "different-session" }), /different authenticated/);
  assert.equal(subject.client.mutations, 0);
});

test("stale target and precondition read failure block before dispatch", async () => {
  const stale = setup();
  const stalePreview = await prepare(stale);
  stale.client.states[1] = active({ claimIdentity: "replacement-claim" });
  const blocked = await commit(stale, stalePreview);
  assert.equal(blocked.status, "blocked_no_action");
  assert.equal(blocked.phase, "precondition_check");
  assert.equal(blocked.mutationAttempted, false);

  const failed = setup();
  const failedPreview = await prepare(failed);
  failed.client.states[1] = new Error("precondition unavailable");
  const result = await commit(failed, failedPreview);
  assert.equal(result.status, "failed_before_dispatch");
  assert.equal(result.mutationAttempted, false);
  assert.equal(failed.client.mutations, 0);
});

test("concurrent duplicate commits share one dispatch and verified run-only result", async () => {
  const subject = setup();
  let release!: () => void;
  subject.client.mutationGate = new Promise<void>((resolve) => { release = resolve; });
  const preview = await prepare(subject);
  const first = commit(subject, preview);
  const duplicate = commit(subject, preview);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(subject.client.mutations, 1);
  release();
  assert.deepEqual(await duplicate, await first);
  const result = await first;
  assert.equal(result.status, "verified_success");
  assert.equal(result.verificationScope, "run_reclaimed");
  assert.doesNotMatch(result.summary, /task returned|task.*ready/i);
  assert.equal(result.retryAttempted, false);
});

test("a begun commit retains its receipt after preview expiry", async () => {
  const subject = setup();
  const preview = await prepare(subject);
  const first = await commit(subject, preview);
  subject.clock.value += 121_000;
  const duplicate = await commit(subject, preview);
  assert.deepEqual(duplicate, first);
  assert.equal(subject.client.mutations, 1);
});

test("a never-begun expired preview cannot dispatch and fresh Hermes state prevents restart replay", async () => {
  const expired = setup();
  const preview = await prepare(expired);
  expired.clock.value += 121_000;
  await assert.rejects(commit(expired, preview), /unavailable/);
  assert.equal(expired.client.mutations, 0);

  const restarted = setup();
  restarted.client.states = [reclaimed()];
  await assert.rejects(prepare(restarted), /no longer reports.*actively claimed/);
  assert.equal(restarted.client.mutations, 0);
});

test("bounded receipt cleanup evicts its preview and cannot enable a second dispatch", async () => {
  const clock = { value: NOW.getTime() };
  const client = new FakeClient();
  client.states = [active(), active(), reclaimed(), active(), active(), reclaimed()];
  const service = new HermesRuntimeInterventionService(client, () => new Date(clock.value), { receiptTtlMs: 60_000, maxReceipts: 1, maxUncommittedPreviews: 4 });
  const first = await service.prepare({ targetRunId: "17", reason: "Stop the first duplicate worker", authority: authority(), actorIdentity: ACTOR });
  await service.commit({ previewId: first.previewId, targetRunId: "17", confirmationPhrase: first.confirmationPhrase, actorIdentity: ACTOR });
  const second = await service.prepare({ targetRunId: "17", reason: "Stop the second duplicate worker", authority: authority(), actorIdentity: ACTOR });
  await service.commit({ previewId: second.previewId, targetRunId: "17", confirmationPhrase: second.confirmationPhrase, actorIdentity: ACTOR });
  await assert.rejects(service.commit({ previewId: first.previewId, targetRunId: "17", confirmationPhrase: first.confirmationPhrase, actorIdentity: ACTOR }), /unavailable/);
  assert.equal(client.mutations, 2);
});

test("expired never-committed previews are removed without a Hermes call", async () => {
  const subject = setup();
  const preview = await prepare(subject);
  const readsBeforeCleanup = subject.client.reads;
  subject.clock.value += 121_000;
  await assert.rejects(commit(subject, preview), /unavailable/);
  assert.equal(subject.client.reads, readsBeforeCleanup);
  assert.equal(subject.client.mutations, 0);
});

test("uncommitted preview collection is capped deterministically without exposing server-only state", async () => {
  const clock = { value: NOW.getTime() };
  const client = new FakeClient();
  client.states = [active()];
  const service = new HermesRuntimeInterventionService(client, () => new Date(clock.value), { receiptTtlMs: 60_000, maxReceipts: 4, maxUncommittedPreviews: 2 });
  const previews: HermesRuntimeInterventionPreview[] = [];
  for (const reason of ["Stop the first duplicate worker", "Stop the second duplicate worker", "Stop the third duplicate worker"]) {
    previews.push(await service.prepare({ targetRunId: "17", reason, authority: authority({ observedAt: new Date(clock.value).toISOString() }), actorIdentity: "actor-secret-identity" }));
    clock.value += 1;
  }
  const readsBeforeCleanup = client.reads;
  await assert.rejects(service.commit({ previewId: previews[0]!.previewId, targetRunId: "17", confirmationPhrase: previews[0]!.confirmationPhrase, actorIdentity: "actor-secret-identity" }), (error: unknown) => {
    assert.doesNotMatch(JSON.stringify(error), /actor-secret-identity|private-claim-value|management-token/);
    return error instanceof HermesRuntimeInterventionError && error.code === "preview_expired";
  });
  for (const retained of previews.slice(1)) {
    await assert.rejects(service.commit({ previewId: retained.previewId, targetRunId: "17", confirmationPhrase: "wrong", actorIdentity: "actor-secret-identity" }), /exact server-issued/);
  }
  assert.equal(client.reads, readsBeforeCleanup);
  assert.equal(client.mutations, 0);
});

test("cleanup never evicts an in-flight receipt or causes a second dispatch", async () => {
  const clock = { value: NOW.getTime() };
  const client = new FakeClient();
  let release!: () => void;
  client.mutationGate = new Promise<void>((resolve) => { release = resolve; });
  client.states = [active(), active(), reclaimed()];
  const service = new HermesRuntimeInterventionService(client, () => new Date(clock.value), { receiptTtlMs: 1, maxReceipts: 0, maxUncommittedPreviews: 1 });
  const preview = await service.prepare({ targetRunId: "17", reason: "Stop the duplicate worker safely", authority: authority(), actorIdentity: ACTOR });
  const first = service.commit({ previewId: preview.previewId, targetRunId: "17", confirmationPhrase: preview.confirmationPhrase, actorIdentity: ACTOR });
  await new Promise((resolve) => setImmediate(resolve));
  clock.value += 10_000;
  const duplicate = service.commit({ previewId: preview.previewId, targetRunId: "17", confirmationPhrase: preview.confirmationPhrase, actorIdentity: ACTOR });
  assert.equal(client.mutations, 1);
  release();
  assert.deepEqual(await duplicate, await first);
  assert.equal(client.mutations, 1);
});

test("post-dispatch timeout, connection, 5xx, malformed response, and verification failure remain outcome unknown", async () => {
  const failures = [
    new HermesManagementRequestError(504, "Hermes management request timed out."),
    new Error("connection reset"),
    new HermesManagementRequestError(503, "upstream unavailable"),
    new HermesManagementRequestError(502, "Malformed Hermes termination response."),
  ];
  for (const [index, failure] of failures.entries()) {
    const subject = setup();
    subject.client.mutationError = failure;
    subject.client.states = [active(), active(), active()];
    const result = await commit(subject, await prepare(subject));
    assert.equal(result.status, "outcome_unknown");
    assert.equal(result.mutationAttempted, true);
    assert.equal(result.mutationResponseReceived, index >= 2);
    assert.equal(result.retryAttempted, false);
    assert.equal(subject.client.mutations, 1);
    assert.equal(subject.client.reads, 3);
  }
  const verification = setup();
  verification.client.states = [active(), active(), new Error("verification failed")];
  const result = await commit(verification, await prepare(verification));
  assert.equal(result.status, "outcome_unknown");
  assert.equal(result.mutationResponseReceived, true);
});

test("service cache identity rotates when the management credential changes without exposing it", () => {
  const base = {
    apiBaseUrl: "http://api.test", apiKey: "api-key", managementBaseUrl: "http://management.test",
    gatewayBaseUrl: "http://gateway.test", gatewayToken: "gateway-key", profile: "operator-os", timeoutMs: 3000,
  };
  const first = hermesRuntimeInterventionConfigIdentity({ ...base, managementToken: "credential-one" });
  const same = hermesRuntimeInterventionConfigIdentity({ ...base, managementToken: "credential-one" });
  const rotated = hermesRuntimeInterventionConfigIdentity({ ...base, managementToken: "credential-two" });
  assert.equal(first, same);
  assert.notEqual(first, rotated);
  assert.doesNotMatch(JSON.stringify(rotated), /credential-one|credential-two/);
});

test("explicit 409 blocks only when one reconciliation proves the exact run unchanged", async () => {
  const subject = setup();
  subject.client.mutationError = new HermesManagementRequestError(409, "Run already ended.");
  subject.client.states = [active(), active(), active()];
  const result = await commit(subject, await prepare(subject));
  assert.equal(result.status, "blocked_no_action");
  assert.equal(result.mutationAttempted, true);
  assert.equal(result.mutationResponseReceived, true);
  assert.equal(result.retryAttempted, false);
  assert.equal(subject.client.mutations, 1);
});

test("read-only recheck can verify an unknown receipt and never redispatches", async () => {
  const subject = setup();
  subject.client.mutationError = new Error("connection reset");
  subject.client.states = [active(), active(), active(), reclaimed()];
  const preview = await prepare(subject);
  const unknown = await commit(subject, preview);
  assert.equal(unknown.status, "outcome_unknown");
  const checked = await subject.service.recheck({ previewId: preview.previewId, targetRunId: "17", actorIdentity: ACTOR });
  assert.equal(checked.status, "verified_success");
  assert.equal(subject.client.mutations, 1);
  assert.ok(checked.lastReconciliationAt);
});

test("repeatable read-only rechecks never redispatch the mutation", async () => {
  const subject = setup();
  subject.client.mutationError = new Error("connection reset");
  subject.client.states = [active(), active(), active(), active(), active()];
  const preview = await prepare(subject);
  const unknown = await commit(subject, preview);
  assert.equal(unknown.status, "outcome_unknown");
  const first = await subject.service.recheck({ previewId: preview.previewId, targetRunId: "17", actorIdentity: ACTOR });
  const second = await subject.service.recheck({ previewId: preview.previewId, targetRunId: "17", actorIdentity: ACTOR });
  assert.equal(first.status, "outcome_unknown");
  assert.equal(second.status, "outcome_unknown");
  assert.equal(subject.client.mutations, 1);
  assert.equal(subject.client.reads, 5);
});

test("bounded ambiguous output redacts credentials and raw payloads", async () => {
  const subject = setup();
  subject.client.mutationError = new Error("Authorization: Bearer secret-value https://user:token@example.test/run?api_key=secret");
  subject.client.states = [active(), active(), active()];
  const result = await commit(subject, await prepare(subject));
  const serialized = JSON.stringify(result);
  assert.equal(result.status, "outcome_unknown");
  assert.doesNotMatch(serialized, /secret-value|user:token|api_key=secret/);
  assert.ok(serialized.length < 1800);
});

test("accepted Phase 3B machine evidence remains complete, fixture-only, and sanitized", () => {
  const machine = JSON.parse(fs.readFileSync("docs/evidence/hermes-governed-runtime-interventions/acceptance-fixture-projection.json", "utf8")) as ReturnType<typeof buildHermesRuntimeInterventionFixtureProjection>;
  assert.equal(hermesProjectionMatrixRows(machine).length, 48);
  assert.equal(machine.capabilities.length, 48);
  assert.equal(new Set(machine.capabilities.map((item) => item.id)).size, 48);
  assert.equal(machine.provenance.label, "Acceptance fixture — no live mutation performed");
  assert.equal(machine.parity.liveVisibility.covered, 0);
  const run = machine.runtimeExecution.runs.find((item) => item.id === "Run 17");
  assert.deepEqual(run?.intervention, { category: "terminate_kanban_run", targetRunId: "17" });
  assert.doesNotMatch(JSON.stringify(machine), /private-claim|fixture-secret|worker_pid|task_title|authorization:|api_key/i);
});
