import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addManualRisk, addOwnerPotentialMiss, classifyCard, commentOnCard, readCockpitState, recordCockpitAction, recordCockpitSnapshot, recordOwnerFriction, snoozeCard } from "./cockpit-store";

test("cockpit projection store persists bounded human state without runtime credentials", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-cockpit-"));
  const previous = process.env.CABINET_DATA_DIR;
  process.env.CABINET_DATA_DIR = root;
  try {
    const risk = await addManualRisk({ title: "Runway", whyItMatters: "Cash is constrained.", recommendedNextStep: "Review forecast.", urgency: "high" });
    await commentOnCard(`manual-risk-${risk.id}`, "Reviewed with finance.", "Jeremy");
    await snoozeCard(`manual-risk-${risk.id}`, "2026-07-20T16:00:00.000Z");
    await classifyCard("card-1", "missing_context", "Recurring occurrence omitted.", "Jeremy");
    await addOwnerPotentialMiss({ title: "Compliance reminder", sourceType: "gmail", sourceId: "owner:compliance", whyPotentiallyMissed: "Deadline item was omitted.", reviewQuestion: "Should this be promoted?", actor: "Jeremy" });
    await recordOwnerFriction("Calendar recurrence was unclear.", "Jeremy");
    await recordCockpitSnapshot({ schemaVersion: 1, runId: "run_intake", generatedAt: "2099-07-18T23:00:00.000Z", sourceCoverage: {
      gmail: { status: "unavailable", message: "No connector", evidenceCount: 0 }, calendar: { status: "unavailable", message: "No connector", evidenceCount: 0 },
      hermesJobs: { status: "connected", message: "Inspected", evidenceCount: 0 }, manualRisks: { status: "connected", message: "Inspected", evidenceCount: 1 },
      supermemory: { status: "connected", message: "Healthy", evidenceCount: 1 },
    }, cards: [] });
    await recordCockpitAction({ cardId: "intake", action: "intake_completed", actor: "Hermes", runId: "run_intake", requestId: null, outcome: "completed", detail: "Normalized.", at: "2026-07-18T23:00:00.000Z" });
    const state = await readCockpitState();
    assert.equal(state.manualRisks[0]?.title, "Runway");
    assert.equal(state.snapshots[0]?.runId, "run_intake");
    assert.equal(state.snapshots[0]?.generatedAt, "2026-07-18T23:00:00.000Z");
    assert.equal(state.cardState[`manual-risk-${risk.id}`]?.comments[0]?.actor, "Jeremy");
    assert.equal(state.actions[0]?.runId, "run_intake");
    assert.equal(state.ownerReview.classifications["card-1"]?.classification, "missing_context");
    assert.equal(state.ownerReview.potentialMisses[0]?.sourceId, "owner:compliance");
    assert.equal(state.ownerReview.friction[0]?.body, "Calendar recurrence was unclear.");
    const raw = await fs.readFile(path.join(root, ".cabinet-state", "hermes-daily-intake.json"), "utf8");
    assert.doesNotMatch(raw, /API_KEY|TOKEN|PASSWORD/);
  } finally {
    if (previous === undefined) delete process.env.CABINET_DATA_DIR; else process.env.CABINET_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
