import assert from "node:assert/strict";
import test from "node:test";
import { HermesSkillsManagementError, HermesSkillsManagementService } from "./governed-skills-management";
import { FakeHermesSkillsAdapter } from "./skills-management-fixture";
import type { HermesSkillAction, HermesSkillsManagementPreview } from "./skills-management-types";

const installIdentity = "official/productivity/installable-skill";
const removeIdentity = "operator-os:hub:official/productivity/removable-skill";
const reason = "Validate the governed native Hermes Skills path.";

function service(adapter = new FakeHermesSkillsAdapter(), tokens?: string[]) {
  let index = 0;
  return {
    adapter,
    target: new HermesSkillsManagementService(adapter, () => new Date(), tokens ? { opaqueToken: () => tokens[index++] ?? "f".repeat(32) } : {}),
  };
}

async function prepare(target: HermesSkillsManagementService, action: HermesSkillAction = "install", identity = installIdentity, actorIdentity = "actor-one") {
  return target.prepare({ action, targetIdentity: identity, reason, actorIdentity });
}

async function commit(target: HermesSkillsManagementService, preview: HermesSkillsManagementPreview, actorIdentity = "actor-one") {
  return target.commit({ previewId: preview.previewId, targetIdentity: preview.targetIdentity, confirmationPhrase: preview.confirmationPhrase, actorIdentity });
}

test("prepare mints independent opaque 128-bit preview and request identities with exact confirmation", async () => {
  const { target } = service(undefined, ["1".repeat(32), "2".repeat(32), "3".repeat(32), "4".repeat(32)]);
  const first = await prepare(target);
  const second = await prepare(target);
  assert.match(first.previewId, /^hermes-preview-[a-f0-9]{32}$/);
  assert.match(first.requestIdentity, /^hermes-request-[a-f0-9]{32}$/);
  assert.notEqual(first.previewId, second.previewId);
  assert.notEqual(first.requestIdentity, second.requestIdentity);
  assert.equal(first.confirmationPhrase, "INSTALL SKILL installable-skill IN operator-os");
  assert.equal(first.currentState.hubIdentifier, installIdentity);
  assert.equal(first.sourceEvidence, "Canonical Hermes CLI installed-state JSON");
});

test("prepare and commit bind actor, target, phrase, candidate, authority, and fresh canonical reads", async () => {
  const { adapter, target } = service();
  const preview = await prepare(target);
  assert.equal(adapter.catalogCalls, 0);
  assert.equal(adapter.candidateCalls, 1);
  assert.equal(adapter.canonicalCalls, 1);
  await assert.rejects(() => target.commit({ previewId: preview.previewId, targetIdentity: "official/other/skill", confirmationPhrase: preview.confirmationPhrase, actorIdentity: "actor-one" }), (error: unknown) => error instanceof HermesSkillsManagementError && error.code === "target_mismatch");
  await assert.rejects(() => target.commit({ previewId: preview.previewId, targetIdentity: preview.targetIdentity, confirmationPhrase: "INSTALL SKILL wrong IN operator-os", actorIdentity: "actor-one" }), (error: unknown) => error instanceof HermesSkillsManagementError && error.code === "not_confirmed");
  await assert.rejects(() => target.commit({ previewId: preview.previewId, targetIdentity: preview.targetIdentity, confirmationPhrase: preview.confirmationPhrase, actorIdentity: "actor-two" }), (error: unknown) => error instanceof HermesSkillsManagementError && error.code === "preview_expired");
  const result = await commit(target, preview);
  assert.equal(result.status, "verified_success");
  assert.equal(result.mutationAttempted, true);
  assert.equal(result.retryAttempted, false);
  assert.equal(adapter.mutationCalls, 1);
  assert.equal(adapter.catalogCalls, 0);
  assert.equal(adapter.candidateCalls, 2);
  assert.equal(adapter.canonicalCalls, 3, "precondition and post-dispatch verification each use canonical readback");
});

test("enable, disable, and update have no operational authority", async () => {
  const { target } = service();
  for (const [action, identity] of [["enable", "operator-os:bundled:disabled-skill"], ["disable", "operator-os:bundled:enabled-skill"], ["update", removeIdentity]] as const) {
    await assert.rejects(() => prepare(target, action, identity), (error: unknown) => error instanceof HermesSkillsManagementError && error.code === "unsupported_action");
  }
});

test("governed Remove rejects community, GitHub, private, local, bundled, missing, and ambiguous targets before dispatch", async () => {
  const drifts = [
    { source: "community", nativeTrust: "community", authorityClass: "unapproved" as const, official: false, public: false },
    { source: "github", nativeTrust: "community", authorityClass: "unapproved" as const, official: false, public: true },
    { source: "private", nativeTrust: "private", authorityClass: "unapproved" as const, official: false, public: false },
    { source: "local", provenance: "agent" as const, nativeTrust: "local", authorityClass: "unapproved" as const, official: false, public: false },
    { source: "bundled", provenance: "bundled" as const, hubIdentifier: null, nativeTrust: "builtin", authorityClass: "unapproved" as const, official: false, public: false },
  ];
  for (const drift of drifts) {
    const { adapter, target } = service();
    const canonical = adapter.readCanonicalInstalledState.bind(adapter);
    adapter.readCanonicalInstalledState = async (profile) => {
      const state = await canonical(profile);
      return {
        ...state,
        installed: state.installed.map((skill) => skill.identity === removeIdentity ? { ...skill, ...drift } : skill),
      };
    };
    await assert.rejects(() => prepare(target, "remove", removeIdentity), HermesSkillsManagementError);
    assert.equal(adapter.mutationCalls, 0);
  }

  const ambiguous = service();
  const ambiguousCanonical = ambiguous.adapter.readCanonicalInstalledState.bind(ambiguous.adapter);
  ambiguous.adapter.readCanonicalInstalledState = async (profile) => ({
    ...(await ambiguousCanonical(profile)),
    duplicateNames: ["removable-skill"],
  });
  await assert.rejects(() => prepare(ambiguous.target, "remove", removeIdentity), HermesSkillsManagementError);
  assert.equal(ambiguous.adapter.mutationCalls, 0);

  const missing = service();
  await assert.rejects(() => prepare(missing.target, "remove", "operator-os:hub:official/productivity/missing-skill"));
  assert.equal(missing.adapter.mutationCalls, 0);
});

test("canonical unavailable, malformed, stale, and future observations fail before dispatch", async () => {
  for (const state of ["unavailable", "authentication_failure", "failure", "timeout", "malformed"] as const) {
    const { adapter, target } = service();
    adapter.sourceStateOverride = state;
    await assert.rejects(() => prepare(target), (error: unknown) => error instanceof HermesSkillsManagementError && error.code === "stale_target");
    assert.equal(adapter.mutationCalls, 0);
  }
  for (const observedAt of ["2020-01-01T00:00:00.000Z", "not-a-date", new Date(Date.now() + 60_000).toISOString()]) {
    const { adapter, target } = service();
    adapter.observedAtOverride = observedAt;
    await assert.rejects(() => prepare(target), HermesSkillsManagementError);
    assert.equal(adapter.mutationCalls, 0);
  }
});

test("concurrent and later duplicate commits dispatch exactly once and share the completed receipt", async () => {
  const { adapter, target } = service();
  let release!: () => void;
  adapter.executionBarrier = new Promise<void>((resolve) => { release = resolve; });
  const preview = await prepare(target);
  const first = commit(target, preview);
  const second = commit(target, preview);
  await new Promise<void>((resolve) => { adapter.executionStarted = resolve; setTimeout(resolve, 10); });
  release();
  const [one, two] = await Promise.all([first, second]);
  const three = await commit(target, preview);
  assert.deepEqual(one, two);
  assert.deepEqual(one, three);
  assert.equal(adapter.mutationCalls, 1);
});

test("changed canonical state, candidate fingerprint, and same-name provenance collision block before dispatch", async () => {
  const stale = service();
  const stalePreview = await prepare(stale.target);
  const staleRead = stale.adapter.readCanonicalInstalledState.bind(stale.adapter);
  let injectCollision = true;
  stale.adapter.readCanonicalInstalledState = async (...args) => {
    const state = await staleRead(...args);
    if (!injectCollision) return state;
    injectCollision = false;
    const alternate = { ...state.installed[0], identity: "operator-os:agent:installable-skill", name: "installable-skill", provenance: "agent" as const, hubIdentifier: null, supportedActions: [] };
    return { ...state, installed: [...state.installed, alternate], duplicateNames: ["installable-skill"] };
  };
  const staleResult = await commit(stale.target, stalePreview);
  assert.equal(staleResult.status, "blocked_no_action");
  assert.equal(stale.adapter.mutationCalls, 0);

  const changedCandidate = service();
  const candidatePreview = await prepare(changedCandidate.target);
  const original = changedCandidate.adapter.inspectExactCandidate.bind(changedCandidate.adapter);
  changedCandidate.adapter.inspectExactCandidate = async (...args) => ({ ...(await original(...args)), fingerprint: "changed" });
  const candidateResult = await commit(changedCandidate.target, candidatePreview);
  assert.equal(candidateResult.status, "blocked_no_action");
  assert.equal(changedCandidate.adapter.mutationCalls, 0);

  const collision = service();
  collision.adapter.installWithSameNameBundled = true;
  const collisionResult = await commit(collision.target, await prepare(collision.target));
  assert.equal(collisionResult.status, "outcome_unknown");
  assert.equal(collision.adapter.mutationCalls, 1);
});

test("exact Hub install and removal require canonical provenance and no same-name ambiguity", async () => {
  const install = service();
  const installed = await commit(install.target, await prepare(install.target));
  assert.equal(installed.status, "verified_success");
  assert.equal(install.adapter.operations[0].skipExternalSecretSources, true);

  const wrongSource = service();
  wrongSource.adapter.installAsDifferentHubIdentity = true;
  const wrong = await commit(wrongSource.target, await prepare(wrongSource.target));
  assert.equal(wrong.status, "outcome_unknown");

  const remove = service();
  const removed = await commit(remove.target, await prepare(remove.target, "remove", removeIdentity));
  assert.equal(removed.status, "verified_success");
  assert.equal(removed.action, "remove");

  const ambiguousRemove = service();
  ambiguousRemove.adapter.leaveSameNameBundledOnRemove = true;
  const ambiguous = await commit(ambiguousRemove.target, await prepare(ambiguousRemove.target, "remove", removeIdentity));
  assert.equal(ambiguous.status, "outcome_unknown");
});

test("failure before dispatch and ambiguous outcome remain honest and never retry automatically", async () => {
  const before = service();
  before.adapter.failBeforeDispatch = true;
  const failed = await commit(before.target, await prepare(before.target));
  assert.equal(failed.status, "failed_before_dispatch");
  assert.equal(failed.mutationAttempted, false);
  assert.equal(before.adapter.mutationCalls, 0);

  const unknown = service();
  unknown.adapter.unknownAfterDispatch = true;
  const preview = await prepare(unknown.target);
  const result = await commit(unknown.target, preview);
  assert.equal(result.status, "outcome_unknown");
  assert.equal(result.mutationAttempted, true);
  assert.equal(result.retryAttempted, false);
  assert.equal(unknown.adapter.mutationCalls, 1);
  const rechecked = await unknown.target.recheck({ previewId: preview.previewId, targetIdentity: preview.targetIdentity, actorIdentity: "actor-one" });
  assert.equal(rechecked.status, "outcome_unknown");
  assert.equal(unknown.adapter.mutationCalls, 1, "read-only reconciliation must never redispatch");
});

test("actor identity, reason secrets, credentials, state fingerprint, and candidate content never egress", async () => {
  const { adapter, target } = service();
  const preview = await target.prepare({ action: "install", targetIdentity: installIdentity, reason: "Validate without token=super-secret or /Users/private/.env", actorIdentity: "actor-secret-value" });
  await commit(target, preview, "actor-secret-value");
  const serialized = JSON.stringify({ preview, operations: adapter.operations });
  assert.doesNotMatch(serialized, /actor-secret-value|stateFingerprint|API_KEY|Authorization: Bearer|SKILL\.md content/i);
});

test("25/25 catalog, prepare, dry precondition, post-verification, and reconciliation simulations never retry", async () => {
  for (let index = 0; index < 25; index += 1) {
    const catalog = service();
    assert.equal((await catalog.target.snapshot()).profile, "operator-os");

    const prepared = service();
    const preview = await prepare(prepared.target);
    assert.equal(prepared.adapter.mutationCalls, 0);
    assert.equal(preview.action, "install");

    const dry = service();
    dry.adapter.failBeforeDispatch = true;
    const dryResult = await commit(dry.target, await prepare(dry.target));
    assert.equal(dryResult.status, "failed_before_dispatch");
    assert.equal(dry.adapter.mutationCalls, 0);

    const verified = service();
    const verifiedResult = await commit(verified.target, await prepare(verified.target));
    assert.equal(verifiedResult.status, "verified_success");
    assert.equal(verified.adapter.mutationCalls, 1);

    const unknown = service();
    unknown.adapter.unknownAfterDispatch = true;
    const unknownPreview = await prepare(unknown.target);
    assert.equal((await commit(unknown.target, unknownPreview)).status, "outcome_unknown");
    assert.equal((await unknown.target.recheck({ previewId: unknownPreview.previewId, targetIdentity: unknownPreview.targetIdentity, actorIdentity: "actor-one" })).status, "outcome_unknown");
    assert.equal(unknown.adapter.mutationCalls, 1);
  }
});
