export type HermesSkillAction = "install" | "enable" | "disable" | "update" | "remove";

export type HermesSkillsSourceState =
  | "success"
  | "connected_empty"
  | "unavailable"
  | "authentication_failure"
  | "failure"
  | "timeout"
  | "stale"
  | "malformed";

export type HermesManagedSkill = {
  identity: string;
  name: string;
  category: string | null;
  installed: boolean;
  enabled: boolean | null;
  version: string | null;
  source: string | null;
  nativeTrust: string | null;
  authorityClass: "official_public" | "unapproved";
  official: boolean;
  public: boolean;
  localFulfillment: boolean;
  provenance: "hub" | "bundled" | "agent" | null;
  hubIdentifier: string | null;
  profile: string;
  updateAvailable: boolean | null;
  observedAt: string;
  supportedActions: HermesSkillAction[];
};

export type HermesSkillsSnapshot = {
  fixture: boolean;
  fixtureLabel: string | null;
  profile: string;
  observedAt: string;
  sourceState: HermesSkillsSourceState;
  summary: string;
  interface: "Approved Hermes CLI catalog + canonical Skills JSON";
  operations: Record<HermesSkillAction, { supported: boolean; interface: string; note: string }>;
  installed: HermesManagedSkill[];
  available: HermesManagedSkill[];
  duplicateIdentities: string[];
};

export type HermesSkillsReadEvidence = {
  attemptCount: 1 | 2;
  finalClassification: "success" | "timeout" | "transport_unavailable" | "authentication_rejected" | "malformed_response" | "contract_mismatch";
  totalElapsedMs: number;
};

export type HermesCanonicalSkillsState = {
  profile: string;
  observedAt: string;
  sourceState: HermesSkillsSourceState;
  summary: string;
  interface: "Canonical Hermes CLI installed-state JSON";
  installed: HermesManagedSkill[];
  duplicateIdentities: string[];
  duplicateNames: string[];
  evidence: HermesSkillsReadEvidence;
};

export type HermesExactSkillCandidate = {
  identifier: string;
  name: string;
  source: string;
  nativeTrust: string;
  authorityClass: "official_public";
  official: true;
  public: true;
  localFulfillment: true;
  scanVerdict: string;
  installPolicy: "allow" | "ask" | "block";
  findingCount: number;
  prerequisiteClassification: "none_declared" | "declared";
  prerequisiteClasses: string[];
  fingerprint: string;
  observedAt: string;
  evidence: {
    preview: HermesSkillsReadEvidence;
    scan: HermesSkillsReadEvidence;
  };
};

export type HermesSkillExecutionAuthority = {
  action: HermesSkillAction;
  profile: string;
  opaqueIdentity: string;
  cliAuthorityIdentity: string | null;
  inspectedAt: string;
};

export type HermesSkillTargetState = Pick<
  HermesManagedSkill,
  "identity" | "name" | "installed" | "enabled" | "version" | "source" | "nativeTrust" | "authorityClass" | "official" | "public" | "localFulfillment" | "provenance" | "hubIdentifier" | "profile" | "updateAvailable"
>;

export type HermesSkillOperation = {
  action: HermesSkillAction;
  targetIdentity: string;
  targetName: string;
  profile: string;
  reason: string;
  skipExternalSecretSources: boolean;
};

export type HermesSkillsManagementPreview = {
  previewId: string;
  requestIdentity: string;
  action: HermesSkillAction;
  targetIdentity: string;
  targetName: string;
  currentState: HermesSkillTargetState;
  targetState: string;
  profile: string;
  expectedConsequence: string;
  reversibility: string;
  sourceEvidence: string;
  evidenceObservedAt: string;
  expiresAt: string;
  confirmationPhrase: string;
  reason: string;
  phase: "prepared";
};

export type HermesSkillsResultStatus =
  | "verified_success"
  | "blocked_no_action"
  | "failed_before_dispatch"
  | "outcome_unknown";

export type HermesSkillsManagementResult = {
  requestIdentity: string;
  action: HermesSkillAction;
  targetIdentity: string;
  targetName: string;
  profile: string;
  status: HermesSkillsResultStatus;
  phase: "precondition_check" | "mutation_dispatch_attempted" | "verification_attempted" | "verified";
  summary: string;
  mutationAttempted: boolean;
  mutationResponseReceived: boolean;
  retryAttempted: false;
  verificationObservedAt: string | null;
  completedAt: string;
};
