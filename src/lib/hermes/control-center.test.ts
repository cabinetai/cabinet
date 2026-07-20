import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  assembleRawProjectionEnvelope,
  formatHermesMatrixRows,
  renderHermesParitySummary,
  validateLiveProjection,
  validateRawProjectionEnvelope,
} from "../../../scripts/generate-hermes-parity-evidence";
import {
  buildHermesAcceptanceFixtureEnvelope,
  buildHermesAcceptanceFixtureInput,
  buildHermesAcceptanceFixtureProjection,
  HERMES_ACCEPTANCE_FIXTURE_OBSERVATIONS,
} from "./control-center-acceptance-fixture";
import { buildHermesControlCenterProjection, hermesProjectionMatrixRows } from "./control-center-projection";
import { gatewayEvidenceState, messagingHealth } from "./control-center";
import type { HermesCapabilityObservation, HermesControlCenterProjectionInput } from "./control-center-types";

const NOW = "2026-07-19T22:15:00.000Z";

function buildWith(mutator: (input: HermesControlCenterProjectionInput) => void) {
  const input = structuredClone(buildHermesAcceptanceFixtureInput());
  mutator(input);
  return buildHermesControlCenterProjection(input);
}

function replaceObservation(input: HermesControlCenterProjectionInput, capabilityId: string, observations: HermesCapabilityObservation[]) {
  input.observations = [...input.observations.filter((item) => item.capabilityId !== capabilityId), ...observations];
}

function observed(capabilityId: string, outcome: HermesCapabilityObservation["outcome"], options: Partial<HermesCapabilityObservation> = {}): HermesCapabilityObservation {
  return {
    capabilityId,
    source: "test source",
    interface: "/api/test",
    observedAt: NOW,
    assertedFreshness: "fresh",
    proofKind: "exact_fixture",
    proofScope: "exact_fixture_path",
    outcome,
    summary: `${capabilityId} ${outcome}`,
    installedBackendVersion: "0.18.2",
    installedBackendCommit: "fixture",
    ...options,
  };
}

function liveSnapshot(capabilityId: string, observations: HermesCapabilityObservation[]) {
  return buildWith((input) => {
    input.installedRuntime.provenance = { kind: "live_runtime", label: "Live runtime projection", capturedAt: NOW, fixtureId: null };
    replaceObservation(input, capabilityId, observations.map((item) => ({ ...item, proofKind: "live", proofScope: "live_runtime_operation" })));
  });
}

function capability(snapshot: ReturnType<typeof buildHermesControlCenterProjection>, id: string) {
  return snapshot.capabilities.find((item) => item.id === id)!;
}

test("the full acceptance fixture uses one assembler for all 48 rows, totals, and percentages", () => {
  const snapshot = buildHermesAcceptanceFixtureProjection();
  assert.equal(snapshot.capabilities.length, 48);
  assert.equal(new Set(snapshot.capabilities.map((item) => item.id)).size, 48);
  assert.equal(HERMES_ACCEPTANCE_FIXTURE_OBSERVATIONS.length >= 48, true);
  assert.equal(Object.values(snapshot.summary).reduce((sum, count) => sum + count, 0), 48);
  assert.equal(hermesProjectionMatrixRows(snapshot).length, 48);
  assert.equal(formatHermesMatrixRows(snapshot).length, 48);
  assert.equal(snapshot.parity.discoverability.total, 48);
  assert.equal(snapshot.parity.liveVisibility.covered, 0);
  assert.equal(snapshot.parity.liveProven.covered, 2);
  for (const observation of HERMES_ACCEPTANCE_FIXTURE_OBSERVATIONS) {
    for (const forbidden of ["status", "surfaceState", "credit", "operationalHealth", "parity", "exceptions"]) assert.equal(forbidden in observation, false);
  }
});

test("matrix rows and committed machine evidence equal the shared fixture projection", () => {
  const fixture = buildHermesAcceptanceFixtureProjection();
  const machine = JSON.parse(readFileSync(path.resolve("docs/evidence/hermes-truth-state/acceptance-fixture-projection.json"), "utf8"));
  assert.deepEqual(machine, JSON.parse(JSON.stringify(fixture)));
  assert.deepEqual(hermesProjectionMatrixRows(machine), hermesProjectionMatrixRows(fixture));
  assert.deepEqual(machine.parity, fixture.parity);
});

test("Cabinet surface state remains registry-only in every evidence condition", () => {
  const snapshot = buildWith((input) => {
    for (const id of ["messaging", "profiles", "approvals", "raw-logs", "billing"]) replaceObservation(input, id, [observed(id, id === "billing" ? "success" : "failure")]);
  });
  assert.equal(capability(snapshot, "messaging").surfaceState, "visible_read_only");
  assert.equal(capability(snapshot, "profiles").surfaceState, "visible_read_only");
  assert.equal(capability(snapshot, "approvals").surfaceState, "first_class");
  assert.equal(capability(snapshot, "raw-logs").surfaceState, "diagnostic_only");
  assert.equal(capability(snapshot, "billing").surfaceState, "unsupported");
});

test("proof scope, not proof kind alone, controls Live-Proven credit", () => {
  for (const outcome of ["success", "connected_empty"] as const) {
    const live = capability(liveSnapshot("profiles", [observed("profiles", outcome)]), "profiles");
    assert.equal(live.credit.liveProven, true);
  }
  const fixture = buildHermesAcceptanceFixtureProjection();
  assert.equal(capability(fixture, "messaging").credit.liveProven, false);
  assert.equal(capability(fixture, "gateway").credit.liveProven, false);
  assert.equal(capability(fixture, "profiles").credit.liveProven, false);
  assert.equal(capability(fixture, "messaging").pathProof.proven, true);
  assert.equal(capability(fixture, "gateway").pathProof.proven, true);
  assert.equal(capability(fixture, "agents-subagents").evidence.some((item) => item.proofScope === "source_audit"), true);
  assert.equal(capability(fixture, "agents-subagents").credit.liveProven, false);
  assert.equal(capability(fixture, "approvals").evidence.some((item) => item.proofScope === "historical_live_acceptance"), true);
  assert.equal(capability(fixture, "approvals").credit.liveProven, true);
  assert.equal(capability(fixture, "notifications").credit.liveProven, false);
  for (const outcome of ["failure", "conflict", "unavailable", "unknown", "not_configured"] as const) {
    assert.equal(capability(liveSnapshot("profiles", [observed("profiles", outcome)]), "profiles").credit.liveProven, false, outcome);
  }
});

test("derived freshness ignores caller optimism and handles absent, invalid, future, current, and historical times", () => {
  const cases: Array<[string, string | null, "fresh" | "stale" | "unknown"]> = [
    ["old", "2026-07-19T20:00:00.000Z", "stale"],
    ["missing", null, "unknown"],
    ["invalid", "not-a-time", "unknown"],
    ["future", "2026-07-20T22:15:00.000Z", "unknown"],
    ["current", "2026-07-19T22:14:30.000Z", "fresh"],
  ];
  for (const [name, observedAt, expected] of cases) {
    const row = capability(liveSnapshot("profiles", [observed("profiles", "success", { observedAt, assertedFreshness: "fresh" })]), "profiles");
    assert.equal(row.evidence.find((item) => item.source === "test source")?.effectiveFreshness, expected, name);
    assert.equal(row.credit.liveVisibility, expected === "fresh", name);
  }
  const historical = capability(buildHermesAcceptanceFixtureProjection(), "starmap").evidence.find((item) => item.proofScope === "source_audit")!;
  assert.equal(historical.effectiveFreshness, "stale");
  assert.equal(historical.assertedFreshness, "stale");
});

test("fixture freshness is deterministic against capturedAt rather than generation wall time", () => {
  const snapshot = buildWith((input) => { input.now = "2036-07-19T22:15:00.000Z"; });
  const fixtureEvidence = capability(snapshot, "messaging").evidence.find((item) => item.proofScope === "exact_fixture_path")!;
  assert.equal(fixtureEvidence.effectiveFreshness, "fresh");
  assert.equal(capability(snapshot, "messaging").operationalHealth, "degraded");
});

test("connected-empty live runtime is healthy and current; fixture failure and conflict earn path proof only", () => {
  const cron = capability(liveSnapshot("cron", [observed("cron", "connected_empty")]), "cron");
  assert.equal(cron.operationalHealth, "healthy");
  assert.equal(cron.credit.liveVisibility, true);
  assert.equal(cron.credit.liveProven, true);
  const fixture = buildHermesAcceptanceFixtureProjection();
  assert.equal(capability(fixture, "messaging").operationalHealth, "degraded");
  assert.equal(capability(fixture, "gateway").operationalHealth, "conflicting_evidence");
  assert.equal(capability(fixture, "messaging").credit.liveVisibility, false);
  assert.equal(capability(fixture, "gateway").credit.liveVisibility, false);
});

test("Gateway reconciliation chooses opposing deterministic sources across three observations", () => {
  const combinations: HermesCapabilityObservation[][] = [
    [observed("gateway", "success", { source: "A", interface: "/a", facts: { state: "running" } }), observed("gateway", "success", { source: "B", interface: "/b", facts: { state: "running" } }), observed("gateway", "success", { source: "C", interface: "/c", facts: { state: "stopped" } })],
    [observed("gateway", "success", { source: "A", interface: "/a", facts: { state: "stopped" } }), observed("gateway", "success", { source: "B", interface: "/b", facts: { state: "stopped" } }), observed("gateway", "success", { source: "C", interface: "/c", facts: { state: "running" } })],
  ];
  for (const observations of combinations) {
    const gateway = capability(buildWith((input) => replaceObservation(input, "gateway", observations)), "gateway");
    assert.equal(gateway.operationalHealth, "conflicting_evidence");
    assert.match(gateway.operationalDetail, /observed running.*observed stopped/);
  }
});

test("Gateway deduplicates source/interface using the newest valid observation", () => {
  const gateway = capability(buildWith((input) => replaceObservation(input, "gateway", [
    observed("gateway", "success", { source: "A", interface: "/same", observedAt: "2026-07-19T22:13:00Z", facts: { state: "stopped" } }),
    observed("gateway", "success", { source: "A", interface: "/same", observedAt: "2026-07-19T22:14:00Z", facts: { state: "running" } }),
    observed("gateway", "success", { source: "B", interface: "/other", facts: { state: "running" } }),
  ])), "gateway");
  assert.notEqual(gateway.operationalHealth, "conflicting_evidence");
});

test("Gateway ignores unknown, unavailable, stale, and invalid-time disagreements", () => {
  const ignored = [
    observed("gateway", "unknown", { source: "B", facts: { state: "unknown" } }),
    observed("gateway", "unavailable", { source: "B", facts: { state: "stopped" } }),
    observed("gateway", "success", { source: "B", observedAt: "2026-07-19T20:00:00Z", facts: { state: "stopped" } }),
    observed("gateway", "success", { source: "B", observedAt: "invalid", facts: { state: "stopped" } }),
  ];
  for (const second of ignored) {
    const gateway = capability(buildWith((input) => replaceObservation(input, "gateway", [observed("gateway", "success", { source: "A", facts: { state: "running" } }), second])), "gateway");
    assert.notEqual(gateway.operationalHealth, "conflicting_evidence");
  }
  assert.deepEqual(gatewayEvidenceState({ primary: "running", management: "unknown", managementRunning: null }), { primary: "running", management: "unknown", conflict: false });
});

test("one genuine fresh Gateway disagreement preserves all evidence and opposing summary", () => {
  const gateway = capability(buildHermesAcceptanceFixtureProjection(), "gateway");
  assert.equal(gateway.operationalHealth, "conflicting_evidence");
  assert.match(gateway.operationalDetail, /health bridge observed running.*management status observed stopped/i);
  assert.equal(gateway.evidence.some((item) => item.facts?.state === "running"), true);
  assert.equal(gateway.evidence.some((item) => item.facts?.state === "stopped"), true);
});

test("Messaging remains platform-derived and Telegram fatal stays degraded", () => {
  assert.equal(messagingHealth([{ configured: true, lastError: "Fatal polling conflict" }]), "degraded");
  assert.equal(messagingHealth([]), "not_configured");
  const messaging = capability(buildHermesAcceptanceFixtureProjection(), "messaging");
  assert.equal(messaging.evidence.find((item) => item.proofScope === "exact_fixture_path")?.outcome, "failure");
  assert.equal(messaging.credit.liveProven, false);
});

test("diagnostic-only and Cabinet-local notification semantics remain intact", () => {
  const snapshot = buildHermesAcceptanceFixtureProjection();
  for (const id of ["advanced-config", "raw-logs", "gateway-diagnostics", "backups"]) assert.equal(capability(snapshot, id).surfaceState, "diagnostic_only");
  const notifications = capability(snapshot, "notifications");
  assert.equal(notifications.surfaceState, "mapped");
  assert.equal(notifications.credit.liveVisibility, false);
  assert.equal(notifications.credit.liveProven, false);
  assert.match(notifications.evidence[0]?.summary ?? "", /Cabinet-local/);
});

test("partial endpoint failure remains degraded and bounded operational text remains bounded", () => {
  const modelSettings = capability(buildHermesAcceptanceFixtureProjection(), "model-settings");
  assert.equal(modelSettings.operationalHealth, "degraded");
  assert.equal(modelSettings.credit.liveVisibility, false);
  const long = capability(buildWith((input) => replaceObservation(input, "profiles", [observed("profiles", "failure", { summary: "x".repeat(1_000) })])), "profiles");
  assert.equal((long.evidence[0]?.summary.length ?? 0) <= 240, true);
});

test("recursive sanitization prevents credential and secret-bearing URL egress", () => {
  const secrets = ["agent-secret-1", "result-secret-2", "provider-secret-3", "diagnostic-secret-4", "message-secret-5", "opencli-secret-6", "gateway-secret-7", "oauth-secret-8"];
  const snapshot = buildWith((input) => {
    const live = input.installedRuntime.live;
    live.diagnostics.push({ area: "future", status: "degraded", message: `Authorization: Bearer ${secrets[3]}` });
    live.operator.agents.active[0]!.error = `api_key=${secrets[0]}`;
    live.operator.agents.active[0]!.result = `session_token=${secrets[1]}`;
    live.operator.providers[0]!.warning = `client_secret=${secrets[2]}`;
    live.operator.messaging[0]!.lastError = `https://api.telegram.org/bot${secrets[4]}/getUpdates`;
    live.openCliBinaryLocation = `/Users/jeremy/.config/credentials/${secrets[5]}`;
    replaceObservation(input, "gateway", [observed("gateway", "failure", { summary: `Proxy-Authorization: Basic ${secrets[6]} https://example.test/?access_token=${secrets[7]}` })]);
  });
  const serialized = JSON.stringify(snapshot);
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, `secret escaped: ${secret}`);
  assert.doesNotMatch(serialized, /api\.telegram\.org\/bot|access_token=|Bearer diagnostic|Basic gateway/i);
  assert.match(serialized, /redacted/);
});

test("raw observation envelopes are assembled rather than trusted", () => {
  const envelope = structuredClone(buildHermesAcceptanceFixtureEnvelope()) as unknown as Record<string, unknown>;
  validateRawProjectionEnvelope(envelope);
  const assembled = assembleRawProjectionEnvelope(envelope);
  assert.deepEqual(hermesProjectionMatrixRows(assembled), hermesProjectionMatrixRows(buildHermesAcceptanceFixtureProjection()));
  const observations = envelope.observations as unknown as Array<Record<string, unknown>>;
  observations[0]!.credit = { liveProven: true };
  assert.throws(() => validateRawProjectionEnvelope(envelope), /authored projection observations/);
  assert.throws(() => validateRawProjectionEnvelope(buildHermesAcceptanceFixtureProjection()), /Raw observation envelope/);
});

test("raw and live inputs fail for missing, unknown, duplicate, or mismatched aggregates", () => {
  const missing = structuredClone(buildHermesAcceptanceFixtureEnvelope());
  missing.observations = missing.observations.filter((item) => item.capabilityId !== "messaging");
  assert.throws(() => validateRawProjectionEnvelope(missing), /incomplete or unknown/);
  const unknown = structuredClone(buildHermesAcceptanceFixtureEnvelope());
  unknown.observations = [...unknown.observations, observed("not-a-capability", "success")];
  assert.throws(() => validateRawProjectionEnvelope(unknown), /incomplete or unknown/);

  const live = structuredClone(buildHermesAcceptanceFixtureProjection());
  live.provenance = { kind: "live_runtime", label: "Live runtime projection", capturedAt: NOW, fixtureId: null };
  validateLiveProjection(live);
  live.capabilities[1]!.id = live.capabilities[0]!.id;
  assert.throws(() => validateLiveProjection(live), /48 unique known/);
  const mismatch = structuredClone(buildHermesAcceptanceFixtureProjection());
  mismatch.provenance = { kind: "live_runtime", label: "Live runtime projection", capturedAt: NOW, fixtureId: null };
  mismatch.parity.liveProven.covered += 1;
  assert.throws(() => validateLiveProjection(mismatch), /aggregate integrity/);
});

test("fixture and live summaries use provenance-specific wording", () => {
  assert.match(renderHermesParitySummary(buildHermesAcceptanceFixtureProjection()), /not live-runtime percentages/);
  const live = structuredClone(buildHermesAcceptanceFixtureProjection());
  live.provenance = { kind: "live_runtime", label: "Live runtime projection", capturedAt: NOW, fixtureId: null };
  assert.match(renderHermesParitySummary(live), /Live-runtime projection captured/);
  assert.doesNotMatch(renderHermesParitySummary(live), /Acceptance-fixture/);
});

test("generatedAt remains separate from observation and fixture capture times", () => {
  const snapshot = buildHermesAcceptanceFixtureProjection();
  assert.equal(snapshot.checkedAt, NOW);
  assert.equal(snapshot.provenance.capturedAt, NOW);
  assert.equal(capability(snapshot, "messaging").evidence[0]?.observedAt, NOW);
  assert.equal("generatedAt" in snapshot, false);
});

test("the generator fails closed for no source, multiple sources, legacy input, and unknown fixture", () => {
  const cli = path.resolve("node_modules/tsx/dist/cli.mjs");
  const script = path.resolve("scripts/generate-hermes-parity-evidence.ts");
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, script, ...args], { encoding: "utf8" });
  for (const args of [[], ["--fixture", "unknown"], ["--input", "projection.json"], ["--fixture", "hermes-phase-2a2-proof-integrity-v1", "--url", "http://127.0.0.1:1"]]) {
    const result = run(...args);
    assert.notEqual(result.status, 0, args.join(" "));
  }
});
