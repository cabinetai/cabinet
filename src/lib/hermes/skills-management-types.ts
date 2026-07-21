export type HermesSkillAction = "install" | "enable" | "disable" | "update" | "remove";

export type HermesSkillsSourceState =
  | "success"
  | "connected_empty"
  | "unavailable"
  | "authentication_failure"
  | "failure"
  | "timeout";

export type HermesManagedSkill = {
  identity: string;
  name: string;
  category: string | null;
  installed: boolean;
  enabled: boolean | null;
  version: string | null;
  source: string | null;
  provenance: "hub" | "bundled" | "agent" | null;
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
  interface: "Hermes Agent 0.19.0 authenticated API";
  operations: Record<HermesSkillAction, { supported: boolean; interface: string; note: string }>;
  installed: HermesManagedSkill[];
  available: HermesManagedSkill[];
  duplicateIdentities: string[];
};

export type HermesSkillTargetState = Pick<
  HermesManagedSkill,
  "identity" | "name" | "installed" | "enabled" | "version" | "source" | "provenance" | "profile" | "updateAvailable"
>;

export type HermesSkillOperation = {
  action: HermesSkillAction;
  targetIdentity: string;
  targetName: string;
  profile: string;
  reason: string;
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
