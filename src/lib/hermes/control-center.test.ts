import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { formatHermesMatrixRows } from "../../../scripts/generate-hermes-parity-evidence";
import {
  buildHermesAcceptanceFixtureInput,
  buildHermesAcceptanceFixtureProjection,
  HERMES_ACCEPTANCE_FIXTURE_OBSERVATIONS,
} from "./control-center-acceptance-fixture";
import { buildHermesControlCenterProjection, hermesProjectionMatrixRows } from "./control-center-projection";
import { gatewayEvidenceState, messagingHealth } from "./control-center";
import type { HermesCapabilityObservation, HermesControlCenterProjectionInput } from "./control-center-types";

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
    observedAt: "2026-07-19T22:15:00.000Z",
    freshness: "fresh",
    proofKind: "exact_fixture",
    outcome,
    summary: `${capabilityId} ${outcome}`,
    installedBackendVersion: "0.18.2",
    installedBackendCommit: "fixture",
    ...options,
  };
}

test("the full acceptance fixture uses one assembler for all 48 rows, totals, and percentages", () => {
  const snapshot = buildHermesAcceptanceFixtureProjection();
  assert.equal(snapshot.capabilities.length, 48);
  assert.equal(HERMES_ACCEPTANCE_FIXTURE_OBSERVATIONS.length >= 48, true);
  assert.equal(Object.values(snapshot.summary).reduce((sum, count) => sum + count, 0), 48);
  assert.equal(hermesProjectionMatrixRows(snapshot).length, 48);
  assert.equal(formatHermesMatrixRows(snapshot).length, 48);
  assert.equal(snapshot.parity.discoverability.total, 48);
  for (const observation of HERMES_ACCEPTANCE_FIXTURE_OBSERVATIONS) {
    assert.equal("status" in observation, false);
    assert.equal("surfaceState" in observation, false);
    assert.equal("credit" in observation, false);
    assert.equal("operationalHealth" in observation, false);
  }
});

test("Cabinet surface state is registry-only in every evidence condition", () => {
  const snapshot = buildWith((input) => {
    for (const id of ["messaging", "profiles", "approvals", "raw-logs", "billing"]) {
      replaceObservation(input, id, [observed(id, id === "billing" ? "success" : "failure")]);
    }
  });
  assert.equal(snapshot.capabilities.find((item) => item.id === "messaging")?.surfaceState, "visible_read_only");
  assert.equal(snapshot.capabilities.find((item) => item.id === "profiles")?.surfaceState, "visible_read_only");
  assert.equal(snapshot.capabilities.find((item) => item.id === "approvals")?.surfaceState, "first_class");
  assert.equal(snapshot.capabilities.find((item) => item.id === "raw-logs")?.surfaceState, "diagnostic_only");
  assert.equal(snapshot.capabilities.find((item) => item.id === "billing")?.surfaceState, "unsupported");
  assert.deepEqual(snapshot.capabilities.filter((item) => item.surfaceState === "missing").map((item) => item.id), snapshot.capabilities.filter((item) => item.parityState === "missing").map((item) => item.id));
});

test("stale evidence cannot rewrite a visible surface or earn current visibility", () => {
  const snapshot = buildWith((input) => replaceObservation(input, "profiles", [observed("profiles", "success", { freshness: "stale", observedAt: "2026-07-01T00:00:00Z" })]));
  const capability = snapshot.capabilities.find((item) => item.id === "profiles")!;
  assert.equal(capability.surfaceState, "visible_read_only");
  assert.equal(capability.operationalHealth, "unknown");
  assert.equal(capability.credit.liveVisibility, false);
});

test("connected-empty is healthy and current while failure and conflict receive no current credit", () => {
  const snapshot = buildHermesAcceptanceFixtureProjection();
  const cron = snapshot.capabilities.find((item) => item.id === "cron")!;
  const messaging = snapshot.capabilities.find((item) => item.id === "messaging")!;
  const gateway = snapshot.capabilities.find((item) => item.id === "gateway")!;
  assert.equal(cron.operationalHealth, "healthy");
  assert.equal(cron.credit.liveVisibility, true);
  assert.equal(messaging.operationalHealth, "degraded");
  assert.equal(messaging.credit.liveVisibility, false);
  assert.equal(gateway.operationalHealth, "conflicting_evidence");
  assert.equal(gateway.credit.liveVisibility, false);
});

test("gateway unknown is not stopped and only fresh concrete disagreement conflicts", () => {
  assert.deepEqual(gatewayEvidenceState({ primary: "running", management: "unknown", managementRunning: null }), { primary: "running", management: "unknown", conflict: false });
  assert.deepEqual(gatewayEvidenceState({ primary: "running", management: "stopped", managementRunning: false }), { primary: "running", management: "stopped", conflict: true });
  const unavailable = buildWith((input) => replaceObservation(input, "gateway", [
    observed("gateway", "success", { source: "health bridge", facts: { state: "running" } }),
    observed("gateway", "unavailable", { source: "management", facts: { state: "unavailable" } }),
  ])).capabilities.find((item) => item.id === "gateway")!;
  assert.equal(unavailable.operationalHealth, "degraded");
  assert.notEqual(unavailable.operationalHealth, "conflicting_evidence");
});

test("Messaging is based on platform records and Telegram fatal stays degraded", () => {
  assert.equal(messagingHealth([{ configured: true, lastError: "Fatal polling conflict" }]), "degraded");
  assert.equal(messagingHealth([]), "not_configured");
  const messaging = buildHermesAcceptanceFixtureProjection().capabilities.find((item) => item.id === "messaging")!;
  assert.equal(messaging.evidence.find((item) => item.proofKind === "exact_fixture")?.outcome, "failure");
  assert.equal(messaging.credit.liveVisibility, false);
});

test("Hermes online cannot fabricate OpenCLI or Voice success", () => {
  const snapshot = buildWith((input) => {
    replaceObservation(input, "command-center", [observed("command-center", "success")]);
    replaceObservation(input, "browser-opencli", [observed("browser-opencli", "unavailable", { source: "OpenCLI doctor" })]);
    replaceObservation(input, "voice", [observed("voice", "unknown", { facts: { serverInterface: "unprobed", browserPermission: "not_requested" } })]);
  });
  const openCli = snapshot.capabilities.find((item) => item.id === "browser-opencli")!;
  const voice = snapshot.capabilities.find((item) => item.id === "voice")!;
  assert.equal(openCli.operationalHealth, "unavailable");
  assert.equal(openCli.credit.liveVisibility, false);
  assert.equal(voice.operationalHealth, "unknown");
  assert.equal(voice.credit.liveVisibility, false);
});

test("Cabinet-local Notifications do not receive Hermes runtime live credit", () => {
  const notifications = buildHermesAcceptanceFixtureProjection().capabilities.find((item) => item.id === "notifications")!;
  assert.equal(notifications.surfaceState, "mapped");
  assert.equal(notifications.operationalHealth, "healthy");
  assert.equal(notifications.credit.liveVisibility, false);
  assert.equal(notifications.credit.governedManagement, true);
  assert.match(notifications.evidence[0]?.summary ?? "", /Cabinet-local/);
});

test("multi-endpoint partial success is degraded and cannot earn whole-capability current visibility", () => {
  const modelSettings = buildHermesAcceptanceFixtureProjection().capabilities.find((item) => item.id === "model-settings")!;
  assert.equal(modelSettings.operationalHealth, "degraded");
  assert.equal(modelSettings.credit.liveVisibility, false);
});

test("historical proof stays historical, stale, and separate from current runtime health", () => {
  const capability = buildHermesAcceptanceFixtureProjection().capabilities.find((item) => item.id === "starmap")!;
  const historical = capability.evidence.find((item) => item.proofKind === "historical_audit")!;
  assert.equal(historical.stale, true);
  assert.equal(historical.freshness, "stale");
  assert.equal(historical.observedAt, "2026-07-19T21:06:53Z");
  assert.match(historical.summary, /historical/i);
});

test("full projection sanitization prevents credential and secret-bearing URL egress", () => {
  const secrets = ["agent-secret-1", "result-secret-2", "provider-secret-3", "diagnostic-secret-4", "message-secret-5", "opencli-secret-6", "gateway-secret-7", "oauth-secret-8"];
  const snapshot = buildWith((input) => {
    const live = input.installedRuntime.live;
    live.diagnostics.push({ area: "future", status: "degraded", message: `Authorization: Bearer ${secrets[3]}` });
    live.operator.agents.active[0]!.error = `api_key=${secrets[0]}`;
    live.operator.agents.active[0]!.result = `session_token=${secrets[1]}`;
    live.operator.providers[0]!.warning = `client_secret=${secrets[2]}`;
    live.operator.messaging[0]!.lastError = `https://api.telegram.org/bot${secrets[4]}/getUpdates`;
    live.openCliBinaryLocation = `/Users/jeremy/.config/credentials/${secrets[5]}`;
    replaceObservation(input, "gateway", [
      observed("gateway", "failure", { summary: `Proxy-Authorization: Basic ${secrets[6]} https://example.test/?access_token=${secrets[7]}` }),
    ]);
  });
  const serialized = JSON.stringify(snapshot);
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, `secret escaped: ${secret}`);
  assert.doesNotMatch(serialized, /api\.telegram\.org\/bot|access_token=|Bearer diagnostic|Basic gateway/i);
  assert.match(serialized, /redacted/);
});

test("the canonical generator fails closed without one explicit input", () => {
  const result = spawnSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), path.resolve("scripts/generate-hermes-parity-evidence.ts")], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /Provide exactly one explicit input/);
});
