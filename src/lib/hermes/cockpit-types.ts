import type { HermesHealthSnapshot, HermesRunDecision, HermesRunState } from "./types";

export const COCKPIT_CARD_KINDS = [
  "needs_jeremy",
  "business_risk",
  "todays_mission",
  "recent_win",
] as const;

export type CockpitCardKind = (typeof COCKPIT_CARD_KINDS)[number];
export type CockpitSourceKind = "gmail" | "calendar" | "hermes_job" | "manual_risk" | "hermes_run" | "memory";
export type CockpitSourceStatus = "connected" | "partial" | "unavailable" | "error";
export type CockpitUrgency = "critical" | "high" | "normal" | "low";
export type CockpitApprovalState = "not_required" | "pending" | "approved" | "rejected";

export type CockpitEvidence = {
  source: CockpitSourceKind;
  label: string;
  reference: string;
  occurredAt: string | null;
};

export type CockpitApproval = {
  state: CockpitApprovalState;
  runId: string | null;
  requestId: string | null;
};

export type CockpitCard = {
  id: string;
  kind: CockpitCardKind;
  title: string;
  summary: string;
  whyItMatters: string;
  recommendedNextStep: string;
  urgency: CockpitUrgency;
  sourceType: CockpitSourceKind;
  sourceId: string;
  evidence: CockpitEvidence[];
  approval: CockpitApproval;
  createdAt: string;
  snoozedUntil: string | null;
  comments: Array<{ id: string; body: string; actor: string; createdAt: string }>;
};

export type CockpitSourceCoverage = Record<
  "gmail" | "calendar" | "hermesJobs" | "manualRisks" | "supermemory",
  { status: CockpitSourceStatus; message: string; evidenceCount: number }
>;

export type CockpitIntakeSnapshot = {
  schemaVersion: 1;
  runId: string;
  generatedAt: string;
  sourceCoverage: CockpitSourceCoverage;
  cards: CockpitCard[];
};

export type CockpitManualRisk = {
  id: string;
  title: string;
  whyItMatters: string;
  recommendedNextStep: string;
  urgency: CockpitUrgency;
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
};

export const COCKPIT_ACTIONS = [
  "investigate",
  "draft_response",
  "approve",
  "reject",
  "comment",
  "snooze",
  "schedule",
  "ask_why",
] as const;

export type CockpitAction = (typeof COCKPIT_ACTIONS)[number];

export type CockpitActionRecord = {
  id: string;
  cardId: string;
  action: CockpitAction | "intake_started" | "intake_completed" | "viewed" | "risk_added" | "risk_resolved";
  actor: string;
  at: string;
  runId: string | null;
  requestId: string | null;
  outcome: "started" | "completed" | "rejected" | "failed" | "recorded";
  detail: string;
};

export type CockpitRunSummary = {
  runId: string;
  context: string;
  capability: string | null;
  status: HermesRunState;
  startedAt: string;
  updatedAt: string;
  result: string | null;
  error: string | null;
  pendingDecision: HermesRunDecision | null;
};

export type DailyBusinessCockpit = {
  schemaVersion: 1;
  generatedAt: string;
  shadowMode: true;
  profile: string;
  health: HermesHealthSnapshot;
  memory: {
    namespace: string;
    provider: string;
    captureState: string;
    recallHealth: string;
  };
  sourceCoverage: CockpitSourceCoverage;
  cards: CockpitCard[];
  runs: CockpitRunSummary[];
  telemetry: {
    cockpitViews: number;
    actionsStarted: number;
    actionsCompleted: number;
    sourceSystemsCovered: number;
    estimatedToolSwitchesAvoided: number;
    lastIntakeAt: string | null;
  };
};
