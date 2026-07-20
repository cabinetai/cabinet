import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  assembleRawProjectionEnvelope,
  formatHermesMatrixRows,
  renderHermesParitySummary,
  loadExplicitProjection,
  validateLiveProjection,
  validateRawProjectionEnvelope,
} from "../../../scripts/generate-hermes-parity-evidence";
import {
  buildHermesAcceptanceFixtureEnvelope,
  buildHermesAcceptanceFixtureInput,
  buildHermesAcceptanceFixtureProjection,
  HERMES_ACCEPTANCE_FIXTURE_OBSERVATIONS,
} from "./control-center-acceptance-fixture";
import { assertValidHermesEvidenceCatalog, validateHermesEvidenceAuthority } from "./control-center-authority";
import { HERMES_CAPABILITY_EVIDENCE_CATALOG } from "./capability-evidence-catalog";
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
  const machine = JSON.parse(readFileSync(path.resolve("docs/evidence/hermes-truth-state/acceptance-fixture-projection.json"), "utf8"));
  const fixture = buildHermesAcceptanceFixtureProjection({
    implementationRevision: machine.evidenceProvenance?.implementationRevision ?? null,
    artifactGeneratedAt: machine.evidenceProvenance?.artifactGeneratedAt ?? null,
  });
  const legacyCompatibleFixture = JSON.parse(JSON.stringify(fixture));
  delete legacyCompatibleFixture.developerRepository;
  delete legacyCompatibleFixture.runtimeExecution;
  assert.deepEqual(machine, legacyCompatibleFixture);
  assert.deepEqual(hermesProjectionMatrixRows(machine), hermesProjectionMatrixRows(fixture));
  assert.deepEqual(machine.parity, fixture.parity);
});

test("proof authority validator enforces complete origin, provenance, kind, and scope tuples", () => {
  const valid = [
    ["raw_observation", "live_runtime", "live", "live_runtime_operation"],
    ["raw_observation", "live_runtime", "live", "cabinet_local_surface"],
    ["raw_observation", "acceptance_fixture", "exact_fixture", "exact_fixture_path"],
    ["raw_observation", "acceptance_fixture", "exact_fixture", "cabinet_local_surface"],
    ["approved_evidence_catalog", "live_runtime", "historical_audit", "source_audit"],
    ["approved_evidence_catalog", "acceptance_fixture", "historical_audit", "historical_live_acceptance"],
    ["derived_reconciliation", "live_runtime", "live", "live_runtime_operation"],
    ["derived_reconciliation", "acceptance_fixture", "exact_fixture", "exact_fixture_path"],
  ] as const;
  for (const [origin, provenanceKind, proofKind, proofScope] of valid) {
    assert.equal(validateHermesEvidenceAuthority({ origin, provenanceKind, proofKind, proofScope }).valid, true);
  }
  const invalid = [
    ["raw_observation", "acceptance_fixture", "live", "live_runtime_operation"],
    ["raw_observation", "live_runtime", "exact_fixture", "exact_fixture_path"],
    ["raw_observation", "acceptance_fixture", "exact_fixture", "live_runtime_operation"],
    ["raw_observation", "live_runtime", "live", "exact_fixture_path"],
    ["raw_observation", "live_runtime", "historical_audit", "source_audit"],
    ["raw_observation", "live_runtime", "historical_audit", "historical_live_acceptance"],
    ["approved_evidence_catalog", "live_runtime", "live", "live_runtime_operation"],
  ] as const;
  for (const [origin, provenanceKind, proofKind, proofScope] of invalid) {
    assert.equal(validateHermesEvidenceAuthority({ origin, provenanceKind, proofKind, proofScope }).valid, false);
  }
});

test("invalid direct raw authority is inert for health, exceptions, and every evidence credit", () => {
  const snapshot = buildWith((input) => replaceObservation(input, "profiles", [
    observed("profiles", "success"),
    observed("profiles", "failure", { source: "invalid authority", proofKind: "live", proofScope: "live_runtime_operation" }),
  ]));
  const profiles = capability(snapshot, "profiles");
  assert.equal(profiles.operationalHealth, "healthy");
  assert.equal(profiles.evidence.some((item) => item.source === "invalid authority"), false);
  assert.equal(snapshot.exceptions.some((item) => item.capabilityId === "profiles"), false);
  assert.equal(profiles.credit.liveVisibility, false);
  assert.equal(profiles.credit.liveProven, false);
  assert.equal(profiles.credit.governedManagement, false);
});

test("provenance mismatches cannot earn current, live-proven, or fixture-path credit", () => {
  const fixture = buildWith((input) => replaceObservation(input, "profiles", [
    observed("profiles", "success"),
    observed("profiles", "success", { source: "pretend live", proofKind: "live", proofScope: "live_runtime_operation" }),
  ]));
  assert.equal(capability(fixture, "profiles").operationalHealth, "healthy");
  assert.equal(capability(fixture, "profiles").credit.liveVisibility, false);
  assert.equal(capability(fixture, "profiles").credit.liveProven, false);

  const live = buildWith((input) => {
    input.installedRuntime.provenance = { kind: "live_runtime", label: "Live runtime projection", capturedAt: NOW, fixtureId: null };
    replaceObservation(input, "profiles", [observed("profiles", "success", { proofKind: "exact_fixture", proofScope: "exact_fixture_path" })]);
  });
  assert.equal(capability(live, "profiles").pathProof.proven, false);
  assert.equal(capability(live, "profiles").operationalHealth, "unknown");
});

test("raw historical scopes are rejected while source audits stay visible and non-operational", () => {
  for (const proofScope of ["source_audit", "historical_live_acceptance"] as const) {
    const envelope = structuredClone(buildHermesAcceptanceFixtureEnvelope());
    envelope.observations = [{ ...envelope.observations[0]!, proofKind: "historical_audit", proofScope }, ...envelope.observations.slice(1)];
    assert.throws(() => validateRawProjectionEnvelope(envelope), /invalid evidence-authority tuple/);
  }
  const row = capability(buildHermesAcceptanceFixtureProjection(), "agents-subagents");
  assert.equal(row.evidence.some((item) => item.origin === "approved_evidence_catalog" && item.proofScope === "source_audit"), true);
  assert.equal(row.credit.liveProven, false);
});

test("Cabinet-local evidence never earns Hermes live parity", () => {
  const fixture = capability(buildHermesAcceptanceFixtureProjection(), "notifications");
  assert.equal(fixture.operationalHealth, "healthy");
  assert.equal(fixture.credit.liveVisibility, false);
  assert.equal(fixture.credit.liveProven, false);
  const live = capability(buildWith((input) => {
    input.installedRuntime.provenance = { kind: "live_runtime", label: "Live runtime projection", capturedAt: NOW, fixtureId: null };
    replaceObservation(input, "notifications", [observed("notifications", "success", { proofKind: "live", proofScope: "cabinet_local_surface" })]);
  }), "notifications");
  assert.equal(live.credit.liveVisibility, false);
  assert.equal(live.credit.liveProven, false);
});

test("approved historical acceptance requires a valid time, reference, interface, source, and backend identity", () => {
  assert.doesNotThrow(() => assertValidHermesEvidenceCatalog(HERMES_CAPABILITY_EVIDENCE_CATALOG));
  for (const mutation of [
    { observedAt: "not-a-time" },
    { evidenceReference: "" },
    { interface: "" },
    { source: "" },
    { installedBackendVersion: null, installedBackendCommit: null },
  ]) {
    const snapshot = buildWith((input) => {
      const historical = input.evidenceCatalog.approvals!.historical!;
      input.evidenceCatalog.approvals!.historical = historical.map((proof) => proof.proofScope === "historical_live_acceptance" ? { ...proof, ...mutation } : proof);
    });
    assert.equal(capability(snapshot, "approvals").credit.liveProven, false);
  }
  assert.equal(capability(buildHermesAcceptanceFixtureProjection(), "approvals").credit.liveProven, true);
});

test("approved evidence-catalog validation rejects nonhistorical authority", () => {
  const catalog = structuredClone(HERMES_CAPABILITY_EVIDENCE_CATALOG);
  const proof = catalog.approvals!.historical![0]!;
  catalog.approvals!.historical![0] = { ...proof, proofKind: "live" as never, proofScope: "live_runtime_operation" as never };
  assert.throws(() => assertValidHermesEvidenceCatalog(catalog), /invalid authority/);
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

test("Gateway ignores a future-invalid newest record without shadowing the older valid source record", () => {
  const gateway = capability(buildWith((input) => replaceObservation(input, "gateway", [
    observed("gateway", "success", { source: "A", interface: "/same", observedAt: "2026-07-19T22:14:00Z", facts: { state: "running" } }),
    observed("gateway", "success", { source: "A", interface: "/same", observedAt: "2026-07-20T22:15:00Z", facts: { state: "stopped" } }),
    observed("gateway", "success", { source: "B", interface: "/other", observedAt: "2026-07-19T22:14:30Z", facts: { state: "stopped" } }),
  ])), "gateway");
  assert.equal(gateway.operationalHealth, "conflicting_evidence");
  assert.match(gateway.operationalDetail, /A observed running.*B observed stopped/);
});

test("Gateway missing and unparseable timestamps cannot displace valid records", () => {
  for (const observedAt of [null, "not-a-time"]) {
    const gateway = capability(buildWith((input) => replaceObservation(input, "gateway", [
      observed("gateway", "success", { source: "A", interface: "/same", observedAt: "2026-07-19T22:14:00Z", facts: { state: "running" } }),
      observed("gateway", "success", { source: "A", interface: "/same", observedAt, facts: { state: "stopped" } }),
      observed("gateway", "success", { source: "B", interface: "/other", facts: { state: "stopped" } }),
    ])), "gateway");
    assert.equal(gateway.operationalHealth, "conflicting_evidence");
  }
});

test("Gateway equal-time reconciliation is deterministic and same-source identical states collapse", () => {
  const records = [
    observed("gateway", "success", { source: "A", interface: "/same", summary: "z", facts: { state: "running" } }),
    observed("gateway", "success", { source: "A", interface: "/same", summary: "a", facts: { state: "running" } }),
    observed("gateway", "success", { source: "B", interface: "/other", facts: { state: "running" } }),
  ];
  const forward = capability(buildWith((input) => replaceObservation(input, "gateway", records)), "gateway");
  const reverse = capability(buildWith((input) => replaceObservation(input, "gateway", [...records].reverse())), "gateway");
  assert.equal(forward.operationalHealth, "healthy");
  assert.equal(reverse.operationalHealth, "healthy");
  assert.equal(forward.operationalDetail, reverse.operationalDetail);
});

test("Gateway equal-time opposing states from one source are source-ambiguous, not cross-source conflict", () => {
  const gateway = capability(buildWith((input) => replaceObservation(input, "gateway", [
    observed("gateway", "success", { source: "A", interface: "/same", facts: { state: "running" } }),
    observed("gateway", "success", { source: "A", interface: "/same", facts: { state: "stopped" } }),
    observed("gateway", "success", { source: "B", interface: "/other", facts: { state: "running" } }),
  ])), "gateway");
  assert.equal(gateway.operationalHealth, "unknown");
  assert.match(gateway.operationalDetail, /source is ambiguous/i);
  assert.equal(gateway.operationalDetail.includes("observed running"), false);
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

test("artifact generation provenance remains separate from observation, fixture, and simulated installation metadata", async () => {
  const revision = "1234567890abcdef1234567890abcdef12345678";
  const generatedAt = "2026-07-19T23:30:00.000Z";
  const snapshot = await loadExplicitProjection({
    fixtureId: "hermes-phase-2a2-proof-integrity-v1",
    implementationRevision: revision,
    artifactGeneratedAt: generatedAt,
  });
  assert.equal(snapshot.checkedAt, NOW);
  assert.equal(snapshot.provenance.capturedAt, NOW);
  assert.equal(capability(snapshot, "messaging").evidence[0]?.observedAt, NOW);
  assert.equal(snapshot.evidenceProvenance.implementationRevision, revision);
  assert.equal(snapshot.evidenceProvenance.fixtureId, "hermes-phase-2a2-proof-integrity-v1");
  assert.equal(snapshot.evidenceProvenance.fixtureCapturedAt, NOW);
  assert.equal(snapshot.evidenceProvenance.artifactGeneratedAt, generatedAt);
  assert.equal(snapshot.installed.cabinetCommit, null);
  assert.notEqual(snapshot.installed.cabinetCommit, snapshot.evidenceProvenance.implementationRevision);
});

test("the generator fails closed for no source, multiple sources, legacy input, and unknown fixture", () => {
  const cli = path.resolve("node_modules/tsx/dist/cli.mjs");
  const script = path.resolve("scripts/generate-hermes-parity-evidence.ts");
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, script, ...args], { encoding: "utf8" });
  for (const args of [[], ["--fixture", "unknown"], ["--fixture", "hermes-phase-2a2-proof-integrity-v1"], ["--fixture", "hermes-phase-2a2-proof-integrity-v1", "--implementation-revision", "short"], ["--input", "projection.json"], ["--fixture", "hermes-phase-2a2-proof-integrity-v1", "--url", "http://127.0.0.1:1"]]) {
    const result = run(...args);
    assert.notEqual(result.status, 0, args.join(" "));
  }
});
