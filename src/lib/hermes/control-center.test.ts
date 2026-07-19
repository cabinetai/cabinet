import assert from "node:assert/strict";
import test from "node:test";
import { boundedHermesFailureSummary } from "./management-client";
import { effectiveParityState, evidenceCredit, gatewayEvidenceState, messagingHealth, operationalHealthForOutcome } from "./control-center";
import type { HermesCapabilityDefinition, HermesCapabilityEvidence } from "./control-center-types";

const diagnostic: HermesCapabilityDefinition = {
  id: "raw-logs", name: "Raw logs", group: "Developer", audience: "developer",
  desktopSource: "Desktop", installedVersionSupport: "Supported", installedSupported: true,
  interface: "/api/logs", cabinetSurface: "Hermes Developer", cabinetHref: "/hermes?mode=developer",
  parityState: "diagnostic_only", readWriteRisk: "secret", mode: "Developer", missingWork: "Bound output.", testEvidence: "Historical audit", keywords: [],
};

test("diagnostic-only parity is never downgraded by absent credit", () => {
  assert.equal(effectiveParityState(diagnostic, { discoverability: true, liveVisibility: false, governedManagement: false, liveProven: false }), "diagnostic_only");
});

test("gateway disagreement is classified as conflicting evidence", () => {
  assert.deepEqual(gatewayEvidenceState({ primary: "running", management: "stopped", managementRunning: false }), { primary: "running", management: "stopped", conflict: true });
});

test("configured Telegram failure degrades Messaging while connected-empty stays distinct", () => {
  assert.equal(messagingHealth([{ configured: true, lastError: "Fatal polling conflict" }]), "degraded");
  assert.equal(messagingHealth([]), "not_configured");
});

test("historical and failed live evidence do not earn current visibility", () => {
  const base = { source: "test", observedAt: "2026-07-19T00:00:00Z", installedBackendVersion: "0.18.2", installedBackendCommit: null, summary: "test" };
  const evidence: HermesCapabilityEvidence[] = [
    { ...base, stale: false, proofKind: "live", outcome: "failure" },
    { ...base, stale: true, proofKind: "historical_audit", outcome: "success" },
  ];
  assert.deepEqual(evidenceCredit(evidence), { liveVisibility: false, liveProven: true });
  assert.deepEqual(evidenceCredit([{ ...base, stale: false, proofKind: "live", outcome: "empty" }]), { liveVisibility: true, liveProven: true });
  assert.equal(operationalHealthForOutcome("cron", "empty"), "healthy");
  assert.equal(operationalHealthForOutcome("messaging", "empty"), "not_configured");
  assert.equal(operationalHealthForOutcome("cron", "failure"), "degraded");
});

test("messaging failure summaries are bounded and redact credentials and URLs", () => {
  const result = boundedHermesFailureSummary("Fatal conflict token=abc123 Authorization: Bearer xyz https://api.telegram.org/botabc/getUpdates");
  assert.ok(result);
  assert.ok(result.length <= 240);
  assert.doesNotMatch(result, /abc123|Bearer xyz|api\.telegram\.org|botabc|token|authorization/i);
});
