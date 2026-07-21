import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getManagedDataDir } from "@/lib/runtime/runtime-config";
import type { CockpitActionRecord, CockpitCard, CockpitIntakeSnapshot, CockpitManualRisk, CockpitMomentumCategory, CockpitMomentumLoop, CockpitMomentumPlan, CockpitOwnerReviewState, CockpitPotentialMiss, CockpitReviewClassification, CockpitSourceKind, CockpitUrgency } from "./cockpit-types";

type CardState = Record<string, { snoozedUntil: string | null; comments: Array<{ id: string; body: string; actor: string; createdAt: string }> }>;
type FileShape = {
  schemaVersion: 1;
  manualRisks: CockpitManualRisk[];
  snapshots: CockpitIntakeSnapshot[];
  cardState: CardState;
  actions: CockpitActionRecord[];
  momentumPlans: CockpitMomentumPlan[];
  ownerReview: CockpitOwnerReviewState;
};

const EMPTY_OWNER_REVIEW: CockpitOwnerReviewState = { classifications: {}, potentialMisses: [], friction: [] };
const EMPTY: FileShape = { schemaVersion: 1, manualRisks: [], snapshots: [], cardState: {}, actions: [], momentumPlans: [], ownerReview: EMPTY_OWNER_REVIEW };
let writeQueue: Promise<unknown> = Promise.resolve();

const MOMENTUM_LIMITS: Record<CockpitMomentumCategory, number> = { decide: 4, protect: 2, verify: 2 };

function localDateKey(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizedCard(card: CockpitCard): CockpitCard {
  return { ...card, recommendedAction: card.recommendedAction ?? "investigate" };
}

function normalizedPlan(plan: CockpitMomentumPlan): CockpitMomentumPlan {
  const unique = (loops: CockpitMomentumLoop[]) => {
    const seen = new Set<string>();
    return loops.filter((loop) => {
      const identity = `${loop.category}:${loop.sourceId}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  };
  return {
    ...plan,
    loops: unique(Array.isArray(plan.loops) ? plan.loops : []),
    proposal: plan.proposal ? { ...plan.proposal, loops: unique(Array.isArray(plan.proposal.loops) ? plan.proposal.loops : []) } : null,
  };
}

function momentumCategory(card: CockpitCard): CockpitMomentumCategory | null {
  if (card.kind === "business_risk") return "protect";
  if (card.approval.state === "pending") return "decide";
  if (card.missingFacts?.length) return "verify";
  return null;
}

function plannedLoops(snapshot: CockpitIntakeSnapshot, risks: CockpitManualRisk[]): CockpitMomentumLoop[] {
  const selected: CockpitMomentumLoop[] = [];
  const counts: Record<CockpitMomentumCategory, number> = { decide: 0, protect: 0, verify: 0 };
  const seen = new Set<string>();
  const add = (cardId: string, sourceId: string, title: string, category: CockpitMomentumCategory) => {
    const identity = `${category}:${sourceId}`;
    if (seen.has(identity) || counts[category] >= MOMENTUM_LIMITS[category]) return;
    seen.add(identity);
    counts[category] += 1;
    selected.push({ id: `${category}:${cardId}`, cardId, sourceId, title, category, status: "open", completedAt: null, completionActionId: null });
  };
  for (const card of snapshot.cards) {
    const category = momentumCategory(card);
    if (category) add(card.id, card.sourceId, card.title, category);
  }
  for (const risk of risks) {
    if (risk.status === "open") add(`manual-risk-${risk.id}`, risk.id, risk.title, "protect");
  }
  return selected;
}

function acceptMomentumPlan(state: FileShape, snapshot: CockpitIntakeSnapshot, acceptedAt: string): CockpitMomentumPlan {
  const localDate = localDateKey(new Date(acceptedAt));
  const loops = plannedLoops(snapshot, state.manualRisks);
  const existing = state.momentumPlans.find((plan) => plan.localDate === localDate);
  if (!existing) {
    const plan: CockpitMomentumPlan = { localDate, intakeRunId: snapshot.runId, acceptedAt, loops, proposal: null };
    state.momentumPlans.push(plan);
    return plan;
  }
  if (existing.intakeRunId !== snapshot.runId && existing.proposal?.intakeRunId !== snapshot.runId) {
    existing.proposal = { intakeRunId: snapshot.runId, proposedAt: acceptedAt, loops };
  }
  return existing;
}

function statePath() { return path.join(getManagedDataDir(), ".cabinet-state", "hermes-daily-intake.json"); }

export async function readCockpitState(): Promise<FileShape> {
  try {
    const parsed = JSON.parse(await fs.readFile(statePath(), "utf8")) as Partial<FileShape>;
    const actions = (Array.isArray(parsed.actions) ? parsed.actions : []).map((action) => ({
      ...action,
      momentumCategory: action.momentumCategory ?? null,
      meaningfulLoopClosed: action.meaningfulLoopClosed === true,
    }));
    const futureCutoff = Date.now() + 15 * 60_000;
    const snapshots = (Array.isArray(parsed.snapshots) ? parsed.snapshots : []).map((snapshot) => {
      const generatedTime = new Date(snapshot.generatedAt).getTime();
      if (!Number.isFinite(generatedTime) || generatedTime <= futureCutoff) return snapshot;
      const completion = actions.find((action) =>
        action.runId === snapshot.runId && action.action === "intake_completed" && action.outcome === "completed"
      );
      return completion ? { ...snapshot, generatedAt: completion.at } : snapshot;
    }).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    return {
      schemaVersion: 1,
      manualRisks: Array.isArray(parsed.manualRisks) ? parsed.manualRisks : [],
      snapshots: snapshots.map((snapshot) => ({ ...snapshot, cards: snapshot.cards.map(normalizedCard) })),
      cardState: parsed.cardState && typeof parsed.cardState === "object" ? parsed.cardState : {},
      actions,
      momentumPlans: Array.isArray(parsed.momentumPlans) ? parsed.momentumPlans.map(normalizedPlan) : [],
      ownerReview: parsed.ownerReview && typeof parsed.ownerReview === "object" ? {
        classifications: parsed.ownerReview.classifications && typeof parsed.ownerReview.classifications === "object" ? parsed.ownerReview.classifications : {},
        potentialMisses: Array.isArray(parsed.ownerReview.potentialMisses) ? parsed.ownerReview.potentialMisses : [],
        friction: Array.isArray(parsed.ownerReview.friction) ? parsed.ownerReview.friction : [],
      } : structuredClone(EMPTY_OWNER_REVIEW),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
    throw error;
  }
}

async function write(state: FileShape): Promise<void> {
  const target = statePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, target);
}

async function mutate<T>(operation: (state: FileShape) => T | Promise<T>): Promise<T> {
  const result = writeQueue.then(async () => {
    const state = await readCockpitState();
    const value = await operation(state);
    state.snapshots = state.snapshots.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).slice(0, 30);
    state.actions = state.actions.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 1_000);
    state.momentumPlans = state.momentumPlans.sort((a, b) => b.localDate.localeCompare(a.localDate)).slice(0, 30);
    state.ownerReview.potentialMisses = state.ownerReview.potentialMisses.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
    state.ownerReview.friction = state.ownerReview.friction.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
    await write(state);
    return value;
  });
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function recordCockpitSnapshot(snapshot: CockpitIntakeSnapshot): Promise<void> {
  await mutate((state) => {
    if (state.snapshots.some((item) => item.runId === snapshot.runId)) return;
    state.snapshots.push(snapshot);
    acceptMomentumPlan(state, snapshot, new Date().toISOString());
  });
}

export async function ensureDailyMomentumPlan(snapshot: CockpitIntakeSnapshot): Promise<CockpitMomentumPlan> {
  return mutate((state) => acceptMomentumPlan(state, snapshot, new Date().toISOString()));
}

type ActionInput = Omit<CockpitActionRecord, "id" | "at" | "momentumCategory" | "meaningfulLoopClosed"> & {
  at?: string;
  momentumCategory?: CockpitMomentumCategory | null;
  meaningfulLoopClosed?: boolean;
};

export async function recordCockpitAction(input: ActionInput): Promise<CockpitActionRecord> {
  return mutate((state) => {
    const record: CockpitActionRecord = {
      ...input,
      id: randomUUID(),
      at: input.at ?? new Date().toISOString(),
      momentumCategory: input.momentumCategory ?? null,
      meaningfulLoopClosed: input.meaningfulLoopClosed === true,
    };
    state.actions.push(record);
    if (record.meaningfulLoopClosed && record.momentumCategory) {
      const plan = state.momentumPlans.find((item) => item.localDate === localDateKey(new Date(record.at)));
      const loop = plan?.loops.find((item) => item.cardId === record.cardId && item.category === record.momentumCategory && item.status === "open");
      if (loop) {
        loop.status = "completed";
        loop.completedAt = record.at;
        loop.completionActionId = record.id;
      }
    }
    return record;
  });
}

export async function addManualRisk(input: { title: string; whyItMatters: string; recommendedNextStep: string; urgency: CockpitUrgency }): Promise<CockpitManualRisk> {
  return mutate((state) => {
    const now = new Date().toISOString();
    const risk: CockpitManualRisk = { id: randomUUID(), ...input, status: "open", createdAt: now, updatedAt: now };
    state.manualRisks.push(risk);
    return risk;
  });
}

export async function resolveManualRisk(id: string): Promise<CockpitManualRisk> {
  return mutate((state) => {
    const risk = state.manualRisks.find((item) => item.id === id);
    if (!risk) throw new Error("Manual risk not found.");
    risk.status = "resolved";
    risk.updatedAt = new Date().toISOString();
    return risk;
  });
}

export async function commentOnCard(cardId: string, body: string, actor: string) {
  return mutate((state) => {
    const item = state.cardState[cardId] ??= { snoozedUntil: null, comments: [] };
    const comment = { id: randomUUID(), body, actor, createdAt: new Date().toISOString() };
    item.comments.push(comment);
    return comment;
  });
}

export async function snoozeCard(cardId: string, until: string) {
  return mutate((state) => {
    const item = state.cardState[cardId] ??= { snoozedUntil: null, comments: [] };
    item.snoozedUntil = until;
    return item;
  });
}

export async function classifyCard(cardId: string, classification: CockpitReviewClassification, note: string, actor: string) {
  return mutate((state) => {
    const value = { classification, note, actor, reviewedAt: new Date().toISOString() };
    state.ownerReview.classifications[cardId] = value;
    return value;
  });
}

export async function addOwnerPotentialMiss(input: { title: string; sourceType: CockpitSourceKind; sourceId: string; whyPotentiallyMissed: string; reviewQuestion: string; actor: string }): Promise<CockpitPotentialMiss> {
  return mutate((state) => {
    const createdAt = new Date().toISOString();
    const value: CockpitPotentialMiss = {
      id: randomUUID(), title: input.title, sourceType: input.sourceType, sourceId: input.sourceId,
      whyPotentiallyMissed: `Owner reported: ${input.whyPotentiallyMissed}`,
      reviewQuestion: input.reviewQuestion,
      evidence: [{ source: input.sourceType, label: `Owner review by ${input.actor}`, reference: input.sourceId, occurredAt: createdAt }],
      createdAt,
    };
    const existing = state.ownerReview.potentialMisses.findIndex((item) => item.sourceId === input.sourceId);
    if (existing >= 0) state.ownerReview.potentialMisses[existing] = value; else state.ownerReview.potentialMisses.push(value);
    return value;
  });
}

export async function recordOwnerFriction(body: string, actor: string) {
  return mutate((state) => {
    const value = { id: randomUUID(), body, actor, createdAt: new Date().toISOString() };
    state.ownerReview.friction.push(value);
    return value;
  });
}
