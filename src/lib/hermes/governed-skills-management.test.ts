import assert from "node:assert/strict";
import test from "node:test";
import { HermesSkillsManagementService } from "./governed-skills-management";
import { FakeHermesSkillsAdapter } from "./skills-management-fixture";
import type { HermesSkillAction } from "./skills-management-types";

const actor = "cabinet-test-actor";
const reason = "Required for the governed acceptance test.";

async function prepare(service: HermesSkillsManagementService, action: HermesSkillAction, targetIdentity: string, query = "") {
  return service.prepare({ action, targetIdentity, reason, actorIdentity: actor, query });
}

async function commit(service: HermesSkillsManagementService, preview: Awaited<ReturnType<typeof prepare>>) {
  return service.commit({ previewId: preview.previewId, targetIdentity: preview.targetIdentity, confirmationPhrase: preview.confirmationPhrase, actorIdentity: actor });
}

test("prepare reads Hermes and performs zero mutations", async () => {
  const adapter = new FakeHermesSkillsAdapter();
  const service = new HermesSkillsManagementService(adapter);
  const preview = await prepare(service, "disable", "operator-os:enabled-skill");
  assert.equal(adapter.mutationCalls, 0);
  assert.equal(preview.confirmationPhrase, "DISABLE SKILL enabled-skill IN operator-os");
  assert.match(preview.requestIdentity, /^hermes-skills-[a-f0-9]{32}$/);
});

test("commit requires exact phrase, actor, and target binding", async () => {
  const adapter = new FakeHermesSkillsAdapter();
  const service = new HermesSkillsManagementService(adapter);
  const preview = await prepare(service, "disable", "operator-os:enabled-skill");
  await assert.rejects(() => service.commit({ previewId: preview.previewId, targetIdentity: preview.targetIdentity, confirmationPhrase: "confirmed", actorIdentity: actor }), /exact server-issued/i);
  await assert.rejects(() => service.commit({ previewId: preview.previewId, targetIdentity: "operator-os:other", confirmationPhrase: preview.confirmationPhrase, actorIdentity: actor }), /does not match/i);
  await assert.rejects(() => service.commit({ previewId: preview.previewId, targetIdentity: preview.targetIdentity, confirmationPhrase: preview.confirmationPhrase, actorIdentity: "different-actor" }), /different authenticated/i);
  assert.equal(adapter.mutationCalls, 0);
});

test("unsupported action and stale state block before dispatch", async () => {
  const adapter = new FakeHermesSkillsAdapter();
  const service = new HermesSkillsManagementService(adapter);
  await assert.rejects(() => prepare(service, "remove", "operator-os:unsupported-bundled"), /does not support/i);
  const preview = await prepare(service, "disable", "operator-os:enabled-skill");
  adapter.staleOnNextRead = true;
  const result = await commit(service, preview);
  assert.equal(result.status, "blocked_no_action");
  assert.equal(adapter.mutationCalls, 0);
});

test("concurrent duplicates dispatch exactly once and return one receipt", async () => {
  const adapter = new FakeHermesSkillsAdapter();
  const service = new HermesSkillsManagementService(adapter);
  const preview = await prepare(service, "disable", "operator-os:enabled-skill");
  const [first, second] = await Promise.all([commit(service, preview), commit(service, preview)]);
  assert.deepEqual(first, second);
  assert.equal(first.status, "verified_success");
  assert.equal(adapter.mutationCalls, 1);
  assert.deepEqual(await commit(service, preview), first);
  assert.equal(adapter.mutationCalls, 1);
});

test("Hermes readback is required for verified install, enable, disable, update, and removal", async () => {
  const cases: Array<[HermesSkillAction, string, string]> = [
    ["install", "official/productivity/installable-skill", "installable-skill"],
    ["enable", "operator-os:disabled-skill", "disabled-skill"],
    ["disable", "operator-os:enabled-skill", "enabled-skill"],
    ["update", "operator-os:update-ready", "update-ready"],
    ["remove", "operator-os:removable-skill", "removable-skill"],
  ];
  for (const [action, identity, name] of cases) {
    const adapter = new FakeHermesSkillsAdapter();
    const service = new HermesSkillsManagementService(adapter);
    const result = await commit(service, await prepare(service, action, identity));
    assert.equal(result.status, "verified_success", action);
    assert.equal(result.targetName, name);
    assert.equal(result.mutationAttempted, true);
    assert.equal(adapter.mutationCalls, 1);
  }
});

test("failure before dispatch and timeout after dispatch are reported honestly", async () => {
  const beforeAdapter = new FakeHermesSkillsAdapter();
  beforeAdapter.failBeforeDispatch = true;
  const beforeService = new HermesSkillsManagementService(beforeAdapter);
  const before = await commit(beforeService, await prepare(beforeService, "disable", "operator-os:enabled-skill"));
  assert.equal(before.status, "failed_before_dispatch");
  assert.equal(before.mutationAttempted, false);

  const unknownAdapter = new FakeHermesSkillsAdapter();
  unknownAdapter.unknownAfterDispatch = true;
  const unknownService = new HermesSkillsManagementService(unknownAdapter);
  const preview = await prepare(unknownService, "disable", "operator-os:enabled-skill");
  const unknown = await commit(unknownService, preview);
  assert.equal(unknown.status, "outcome_unknown");
  assert.equal(unknown.mutationAttempted, true);
  const calls = unknownAdapter.mutationCalls;
  await unknownService.recheck({ previewId: preview.previewId, targetIdentity: preview.targetIdentity, actorIdentity: actor });
  assert.equal(unknownAdapter.mutationCalls, calls, "read-only reconciliation must never repeat a mutation");
});

test("a process-restart replay cannot repeat an operation canonical Hermes already proves", async () => {
  const adapter = new FakeHermesSkillsAdapter();
  const firstProcess = new HermesSkillsManagementService(adapter);
  const restartedProcess = new HermesSkillsManagementService(adapter);
  const firstPreview = await prepare(firstProcess, "enable", "operator-os:disabled-skill");
  const restartPreview = await prepare(restartedProcess, "enable", "operator-os:disabled-skill");
  assert.equal((await commit(firstProcess, firstPreview)).status, "verified_success");
  assert.equal(adapter.mutationCalls, 1);
  const replay = await commit(restartedProcess, restartPreview);
  assert.equal(replay.status, "verified_success");
  assert.equal(replay.mutationAttempted, false);
  assert.equal(adapter.mutationCalls, 1);
});
