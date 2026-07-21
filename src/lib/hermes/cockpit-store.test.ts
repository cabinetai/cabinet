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
    const coverage = {
      gmail: { status: "unavailable", message: "No connector", evidenceCount: 0 }, calendar: { status: "unavailable", message: "No connector", evidenceCount: 0 },
      hermesJobs: { status: "connected", message: "Inspected", evidenceCount: 0 }, manualRisks: { status: "connected", message: "Inspected", evidenceCount: 1 },
      supermemory: { status: "connected", message: "Healthy", evidenceCount: 1 },
    } as const;
    const verifyCard = {
      id: "card-verify", kind: "needs_jeremy" as const, title: "Confirm balance", summary: "Balance missing.", whyItMatters: "Payment decision is blocked.",
      recommendedNextStep: "Confirm the balance.", recommendedAction: "investigate" as const, urgency: "high" as const, sourceType: "gmail" as const,
      sourceId: "gmail:balance", evidence: [], approval: { state: "not_required" as const, runId: null, requestId: null }, createdAt: "2026-07-18T22:00:00.000Z",
      snoozedUntil: null, comments: [], missingFacts: ["Current balance"],
    };
    const projectedRiskCard = {
      ...verifyCard, id: "risk-presentation", kind: "business_risk" as const, title: risk.title, sourceType: "manual_risk" as const,
      sourceId: risk.id, missingFacts: [],
    };
    await recordCockpitSnapshot({ schemaVersion: 1, runId: "run_intake", generatedAt: "2099-07-18T23:00:00.000Z", sourceCoverage: coverage, cards: [verifyCard, projectedRiskCard] });
    await recordCockpitSnapshot({ schemaVersion: 1, runId: "run_intake_2", generatedAt: "2099-07-18T23:05:00.000Z", sourceCoverage: coverage, cards: [
      verifyCard, projectedRiskCard,
      { ...verifyCard, id: "card-new", sourceId: "gmail:new", title: "New decision", missingFacts: [] },
    ] });
    await recordCockpitAction({ cardId: verifyCard.id, action: "investigate", actor: "Hermes", runId: "run_action_prose", requestId: null, outcome: "completed", detail: "Verified evidence and confirmed the balance." });
    const beforeClosure = await readCockpitState();
    const planBeforeClosure = beforeClosure.momentumPlans[0];
    assert.equal(planBeforeClosure?.loops.length, 2);
    assert.equal(planBeforeClosure?.loops.find((loop) => loop.cardId === verifyCard.id)?.status, "open");
    assert.equal(planBeforeClosure?.proposal?.intakeRunId, "run_intake_2");
    await recordCockpitAction({ cardId: verifyCard.id, action: "investigate", actor: "Hermes", runId: "run_action_structured", requestId: null, outcome: "completed", detail: "Balance confirmed.", momentumCategory: "verify", meaningfulLoopClosed: true });
    await recordCockpitAction({ cardId: "intake", action: "intake_completed", actor: "Hermes", runId: "run_intake", requestId: null, outcome: "completed", detail: "Normalized.", at: "2026-07-18T23:00:00.000Z" });
    const state = await readCockpitState();
    assert.equal(state.manualRisks[0]?.title, "Runway");
    assert.equal(state.snapshots[0]?.runId, "run_intake_2");
    assert.equal(state.snapshots.find((snapshot) => snapshot.runId === "run_intake")?.generatedAt, "2026-07-18T23:00:00.000Z");
    assert.equal(state.cardState[`manual-risk-${risk.id}`]?.comments[0]?.actor, "Jeremy");
    assert.equal(state.actions.some((action) => action.runId === "run_intake"), true);
    assert.equal(state.ownerReview.classifications["card-1"]?.classification, "missing_context");
    assert.equal(state.ownerReview.potentialMisses[0]?.sourceId, "owner:compliance");
    assert.equal(state.ownerReview.friction[0]?.body, "Calendar recurrence was unclear.");
    const frozenPlan = state.momentumPlans[0];
    assert.equal(frozenPlan?.loops.length, 2);
    assert.equal(frozenPlan?.loops.find((loop) => loop.cardId === verifyCard.id)?.status, "completed");
    assert.equal(frozenPlan?.proposal?.loops.length, 2);
    const raw = await fs.readFile(path.join(root, ".cabinet-state", "hermes-daily-intake.json"), "utf8");
    assert.doesNotMatch(raw, /API_KEY|TOKEN|PASSWORD/);
  } finally {
    if (previous === undefined) delete process.env.CABINET_DATA_DIR; else process.env.CABINET_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
