import type { HermesCapabilityEvidenceCatalog, HermesHistoricalProof } from "./control-center-types";
import upstreamAudit from "./upstream-audit.json";

const historical = (source: string, summary: string): HermesHistoricalProof => ({
  source,
  interface: "Hermes Desktop source audit",
  observedAt: upstreamAudit.auditedAt,
  outcome: "success",
  summary,
  installedBackendVersion: upstreamAudit.installedBackendVersion,
  installedBackendCommit: upstreamAudit.installedBackendCommit,
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
    historical: [historical("Cabinet Hermes M3-M7 acceptance suite", "The approval boundary and duplicate-submission behavior passed the historical conversion acceptance suite.")],
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
    historical: [historical("Cabinet notification preference component contract", "Cabinet-local preferences are mapped to Hermes events. This does not prove Hermes Desktop notification settings or current Hermes runtime health.")],
  },
  "agents-subagents": { historical: [historical("Installed Desktop agents route audit", "Installed Desktop source exposes agent and subagent status surfaces.")] },
  messaging: { historical: [historical("Installed Desktop messaging route audit", "Historical route support only. Current platform health requires a fresh platform observation.")] },
  artifacts: { historical: [historical("Installed Desktop artifacts route audit", "Historical route support only. Current artifact visibility requires a fresh files projection.")] },
  voice: { historical: [historical("Installed audio interface source audit", "Audio interfaces exist in the audited source. They were not probed in the current runtime.")] },
  "archived-chats": { historical: [historical("Installed Desktop session route audit", "Archived session support was found in the historical source audit.")] },
  "session-pinning": { historical: [historical("Installed Desktop session action audit", "Session pinning was visible in the historical Desktop source audit.")] },
  "memory-context": { historical: [historical("Installed Desktop memory route audit", "Memory management interfaces were found in the historical source audit.")] },
  starmap: { historical: [historical("Installed Desktop Starmap route audit", "Memory graph support was found in the historical source audit; node counts are observation-specific.")] },
  providers: { historical: [historical("Installed Desktop provider settings audit", "Provider settings were found in the historical source audit.")] },
  "provider-accounts": { historical: [historical("Installed Desktop account settings audit", "Provider account surfaces were found without retaining credential material.")] },
  models: { historical: [historical("Installed Desktop model settings audit", "Model selection surfaces were found in the historical source audit.")] },
  "model-settings": { historical: [historical("Installed Desktop model settings audit", "Model settings were found in the historical source audit.")] },
  gateway: { historical: [historical("Installed Desktop gateway settings audit", "Gateway management support exists historically; current state requires fresh independent observations.")] },
  "browser-opencli": { historical: [historical("OpenCLI read-only acceptance audit", "Historical local acceptance proved title, DOM read, and screenshot support without external writes.")] },
};
