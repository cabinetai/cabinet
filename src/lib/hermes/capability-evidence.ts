import fs from "node:fs/promises";
import path from "node:path";
import { getManagedDataDir } from "@/lib/runtime/runtime-config";
import { HERMES_CAPABILITY_STAGES, type HermesCapabilityEvidenceRecord, type HermesCapabilityPromotion, type HermesCapabilityStage } from "./capability-types";

type FileShape = { schemaVersion: 1; records: HermesCapabilityEvidenceRecord[] };

function evidencePath() { return path.join(getManagedDataDir(), ".cabinet-state", "hermes-capability-evidence.json"); }

export async function listCapabilityEvidence(): Promise<HermesCapabilityEvidenceRecord[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(evidencePath(), "utf8")) as Partial<FileShape>;
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function promoteCapability(input: {
  capability: string; profile: string; to: HermesCapabilityStage; actor: string; reason: string;
  evidence?: HermesCapabilityPromotion["evidence"];
}): Promise<HermesCapabilityEvidenceRecord> {
  const capability = input.capability.trim(); const actor = input.actor.trim(); const reason = input.reason.trim();
  if (!capability || !actor || !reason) throw new Error("Capability, operator identity, and promotion reason are required.");
  const records = await listCapabilityEvidence();
  const existing = records.find((item) => item.capability === capability && item.profile === input.profile);
  const currentIndex = existing ? HERMES_CAPABILITY_STAGES.indexOf(existing.stage) : -1;
  const targetIndex = HERMES_CAPABILITY_STAGES.indexOf(input.to);
  if (targetIndex !== currentIndex + 1) throw new Error(`Capability promotion must advance exactly one stage from ${existing?.stage ?? "untracked"}.`);
  const evidence = input.evidence ?? {};
  if (input.to === "Tested" && (!evidence.runId || !evidence.outcome)) throw new Error("Tested requires a Hermes run ID and outcome evidence.");
  if (input.to === "Approved" && !reason) throw new Error("Approved requires an explicit operator decision.");
  if (input.to === "Scheduled" && !evidence.jobId) throw new Error("Scheduled requires a canonical Hermes job ID.");
  if (input.to === "Monitored" && (!evidence.runId || !evidence.metrics)) throw new Error("Monitored requires run history and performance metrics.");
  if (input.to === "Trusted" && !evidence.shadowReview) throw new Error("Trusted requires an explicit shadow-mode trust review.");
  const promotion: HermesCapabilityPromotion = { from: existing?.stage ?? null, to: input.to, actor, at: new Date().toISOString(), reason, evidence };
  const record: HermesCapabilityEvidenceRecord = existing
    ? { ...existing, stage: input.to, history: [...existing.history, promotion] }
    : { capability, profile: input.profile, stage: input.to, history: [promotion] };
  const updated = existing ? records.map((item) => item === existing ? record : item) : [...records, record];
  const target = evidencePath(); await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, records: updated } satisfies FileShape, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, target);
  return record;
}
