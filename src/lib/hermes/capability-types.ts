export const HERMES_CAPABILITY_STAGES = ["Draft", "Tested", "Approved", "Scheduled", "Monitored", "Trusted"] as const;
export type HermesCapabilityStage = typeof HERMES_CAPABILITY_STAGES[number];

export type HermesCapabilityPromotion = {
  from: HermesCapabilityStage | null;
  to: HermesCapabilityStage;
  actor: string;
  at: string;
  reason: string;
  evidence: { runId?: string; jobId?: string; outcome?: string; metrics?: string; shadowReview?: string };
};

export type HermesCapabilityEvidenceRecord = {
  capability: string;
  profile: string;
  stage: HermesCapabilityStage;
  history: HermesCapabilityPromotion[];
};
