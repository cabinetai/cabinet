import assert from "node:assert/strict";
import test from "node:test";
import type { CockpitCard, DailyBusinessCockpit } from "@/lib/hermes/cockpit-types";
import { momentum, primaryAction } from "./cockpit-model";

const card: CockpitCard = {
  id: "card-1",
  kind: "needs_jeremy",
  title: "Prepare response",
  summary: "A response is needed.",
  whyItMatters: "A client is waiting.",
  recommendedNextStep: "Prepare a draft.",
  recommendedAction: "draft_response",
  urgency: "high",
  sourceType: "gmail",
  sourceId: "gmail:1",
  evidence: [],
  approval: { state: "not_required", runId: null, requestId: null },
  createdAt: "2026-07-19T08:00:00.000Z",
  snoozedUntil: null,
  comments: [],
};

test("primary action uses the governed recommendation and preserves approval boundaries", () => {
  assert.equal(primaryAction(card), "draft_response");
  assert.equal(primaryAction({ ...card, recommendedAction: "schedule", approval: { state: "pending", runId: "run-1", requestId: "request-1" } }), "approve");
});

test("Momentum reads only the frozen plan, not queue size or free-text history", () => {
  const cockpit = {
    cards: [card, { ...card, id: "card-2", sourceId: "gmail:2" }],
    history: [{
      id: "action-1", cardId: card.id, action: "investigate", actor: "Hermes", at: "2026-07-19T09:00:00.000Z",
      runId: "run-1", requestId: null, outcome: "completed", detail: "Verified confirmed evidence and clarification.",
      momentumCategory: null, meaningfulLoopClosed: false,
    }],
    momentumPlan: {
      localDate: "2026-07-19", intakeRunId: "intake-1", acceptedAt: "2026-07-19T08:00:00.000Z", proposal: null,
      loops: [{ id: "decide:card-1", cardId: card.id, sourceId: card.sourceId, title: card.title, category: "decide", status: "open", completedAt: null, completionActionId: null }],
    },
  } as DailyBusinessCockpit;
  assert.deepEqual(momentum(cockpit), {
    completed: { decide: 0, protect: 0, verify: 0 },
    selected: { decide: 1, protect: 0, verify: 0 },
    done: 0,
    total: 1,
    percent: 0,
  });
  cockpit.momentumPlan!.loops[0] = { ...cockpit.momentumPlan!.loops[0], status: "completed", completedAt: "2026-07-19T09:00:00.000Z", completionActionId: "action-2" };
  assert.equal(momentum(cockpit).total, 1);
  assert.equal(momentum(cockpit).done, 1);
});
