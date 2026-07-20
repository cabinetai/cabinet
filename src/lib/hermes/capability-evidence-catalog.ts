import type { HermesCapabilityEvidenceCatalog, HermesHistoricalProof } from "./control-center-types";
import upstreamAudit from "./upstream-audit.json";

const sourceAudit = (capabilityId: string, source: string, summary: string): HermesHistoricalProof => ({
  capabilityId,
  proofScope: "source_audit",
  source,
  interface: "Hermes Desktop source audit",
  observedAt: upstreamAudit.auditedAt,
  outcome: "success",
  summary,
  installedBackendVersion: upstreamAudit.installedBackendVersion,
  installedBackendCommit: upstreamAudit.installedBackendCommit,
  evidenceReference: "src/lib/hermes/upstream-audit.json",
});

const historicalAcceptance = (
  capabilityId: string,
  source: string,
  interfaceIdentity: string,
  observedAt: string,
  summary: string,
  evidenceReference: string
): HermesHistoricalProof => ({
  capabilityId,
  proofScope: "historical_live_acceptance",
  source,
  interface: interfaceIdentity,
  observedAt,
  outcome: "success",
  summary,
  installedBackendVersion: "0.18.2",
  installedBackendCommit: "594308d4bbe95548c9fe418bb10c449099426f93",
  evidenceReference,
});

export const HERMES_CAPABILITY_EVIDENCE_CATALOG: HermesCapabilityEvidenceCatalog = {
  approvals: {
    governance: [{
      confirmationBoundary: "Consequential Hermes decisions require explicit owner confirmation.",
      stableRequestIdentity: "Hermes request IDs are retained across retries.",
      idempotencyBehavior: "Duplicate decision submission is rejected by the run contract.",
      visibleOutcomeEvidence: "Accepted and rejected outcomes remain visible in the canonical Hermes transcript.",
      testedContract: "Hermes gateway and run decision contract tests",
      proofTimestamp: "2026-07-19T21:06:53Z",
      proofSource: "Cabinet Hermes M3-M7 acceptance suite",
    }],
    historical: [
      sourceAudit("approvals", "Cabinet Hermes M3-M7 source audit", "The approval contract exists in the audited source. Source existence does not prove a live operation."),
      historicalAcceptance("approvals", "Cabinet Hermes M3-M7 acceptance suite", "Hermes gateway and run decision contract", "2026-07-19T02:23:07Z", "A governed approval decision completed with confirmation and duplicate-submission protection.", "PROGRESS.md#2026-07-19-m7-technical-conversion-acceptance"),
    ],
  },
  notifications: {
    governance: [{
      confirmationBoundary: "Notification preference changes are Cabinet-local and user initiated.",
      stableRequestIdentity: "A stable Cabinet preference key identifies each Hermes event mapping.",
      idempotencyBehavior: "Writing the same preference value is idempotent.",
      visibleOutcomeEvidence: "The selected Cabinet-local preference is rendered after save.",
      testedContract: "Cabinet notification preference component contract",
      proofTimestamp: "2026-07-19T21:06:53Z",
      proofSource: "Phase 1 Control Center source audit",
    }],
    historical: [sourceAudit("notifications", "Cabinet notification preference component contract", "Cabinet-local preferences are mapped to Hermes events. This does not prove Hermes Desktop notification settings or current Hermes runtime health.")],
  },
  "agents-subagents": { historical: [sourceAudit("agents-subagents", "Installed Desktop agents route audit", "Installed Desktop source exposes agent and subagent status surfaces.")] },
  messaging: { historical: [sourceAudit("messaging", "Installed Desktop messaging route audit", "Historical route support only. Current platform health requires a fresh platform observation.")] },
  artifacts: { historical: [sourceAudit("artifacts", "Installed Desktop artifacts route audit", "Historical route support only. Current artifact visibility requires a fresh files projection.")] },
  voice: { historical: [sourceAudit("voice", "Installed audio interface source audit", "Audio interfaces exist in the audited source. They were not probed in the current runtime.")] },
  "archived-chats": { historical: [sourceAudit("archived-chats", "Installed Desktop session route audit", "Archived session support was found in the historical source audit.")] },
  "session-pinning": { historical: [sourceAudit("session-pinning", "Installed Desktop session action audit", "Session pinning was visible in the historical Desktop source audit.")] },
  "memory-context": { historical: [sourceAudit("memory-context", "Installed Desktop memory route audit", "Memory management interfaces were found in the historical source audit.")] },
  starmap: { historical: [sourceAudit("starmap", "Installed Desktop Starmap route audit", "Memory graph support was found in the historical source audit; node counts are observation-specific.")] },
  providers: { historical: [sourceAudit("providers", "Installed Desktop provider settings audit", "Provider settings were found in the historical source audit.")] },
  "provider-accounts": { historical: [sourceAudit("provider-accounts", "Installed Desktop account settings audit", "Provider account surfaces were found without retaining credential material.")] },
  models: { historical: [sourceAudit("models", "Installed Desktop model settings audit", "Model selection surfaces were found in the historical source audit.")] },
  "model-settings": { historical: [sourceAudit("model-settings", "Installed Desktop model settings audit", "Model settings were found in the historical source audit.")] },
  gateway: { historical: [sourceAudit("gateway", "Installed Desktop gateway settings audit", "Gateway management support exists historically; current state requires fresh independent observations.")] },
  "browser-opencli": { historical: [
    sourceAudit("browser-opencli", "OpenCLI interface source audit", "OpenCLI interface support was found in the audited integration source."),
    historicalAcceptance("browser-opencli", "OpenCLI read-only acceptance", "opencli local page title, DOM read, and screenshot", "2026-07-19T20:18:51Z", "A local read-only acceptance opened a test page, read its title and DOM, and captured a screenshot without an external write.", "docs/plans/hermes-desktop-capability-parity.md#phase-4-opencli-browser-module"),
  ] },
};
