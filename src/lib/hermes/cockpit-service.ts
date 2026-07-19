import { createHash } from "node:crypto";
import { HermesManagementClient } from "./management-client";
import { HermesRunClient } from "./run-client";
import { getHermesRunBridge } from "./run-bridge";
import { readHermesServerConfig } from "./server-config";
import { buildIntakePrompt, parseCockpitIntake } from "./cockpit-contract";
import {
  addManualRisk,
  commentOnCard,
  readCockpitState,
  recordCockpitAction,
  recordCockpitSnapshot,
  resolveManualRisk,
  snoozeCard,
} from "./cockpit-store";
import {
  COCKPIT_ACTIONS,
  type CockpitAction,
  type CockpitCard,
  type CockpitManualRisk,
  type CockpitSourceCoverage,
  type CockpitUrgency,
  type DailyBusinessCockpit,
} from "./cockpit-types";
import type { HermesManagementSnapshot, HermesRunProjection } from "./types";

function bridge() {
  return getHermesRunBridge(() => new HermesRunClient(readHermesServerConfig()));
}

function clients() {
  const config = readHermesServerConfig();
  return { management: new HermesManagementClient(config), config };
}

function compact(value: string | null, fallback: string): string {
  if (!value?.trim()) return fallback;
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > 240 ? `${oneLine.slice(0, 237)}...` : oneLine;
}

function sourceDefaults(management: HermesManagementSnapshot, manualRiskCount: number): CockpitSourceCoverage {
  const memoryHealthy = management.memory.recallHealth === "healthy" && management.memory.captureState === "active";
  return {
    gmail: { status: "unavailable", message: "No completed intake has verified Gmail access yet.", evidenceCount: 0 },
    calendar: { status: "unavailable", message: "No completed intake has verified Calendar access yet.", evidenceCount: 0 },
    hermesJobs: { status: "connected", message: `${management.jobs.length} canonical Hermes jobs inspected.`, evidenceCount: management.jobs.length },
    manualRisks: { status: "connected", message: `${manualRiskCount} open manual risks inspected.`, evidenceCount: manualRiskCount },
    supermemory: {
      status: memoryHealthy ? "connected" : "partial",
      message: `${management.memory.namespace}; capture ${management.memory.captureState}; recall ${management.memory.recallHealth}.`,
      evidenceCount: memoryHealthy ? 1 : 0,
    },
  };
}

function manualRiskCard(risk: CockpitManualRisk): CockpitCard {
  return {
    id: `manual-risk-${risk.id}`,
    kind: "business_risk",
    title: risk.title,
    summary: risk.whyItMatters,
    whyItMatters: risk.whyItMatters,
    recommendedNextStep: risk.recommendedNextStep,
    urgency: risk.urgency,
    sourceType: "manual_risk",
    sourceId: risk.id,
    evidence: [{ source: "manual_risk", label: "Operator-tracked risk", reference: risk.id, occurredAt: risk.updatedAt }],
    approval: { state: "not_required", runId: null, requestId: null },
    createdAt: risk.createdAt,
    snoozedUntil: null,
    comments: [],
  };
}

function recentWinCard(run: HermesRunProjection): CockpitCard {
  return {
    id: `run-win-${run.runId}`,
    kind: "recent_win",
    title: compact(run.result, "Hermes run completed"),
    summary: `Completed from ${run.context}.`,
    whyItMatters: "This is a verified Hermes outcome with retained run evidence.",
    recommendedNextStep: "Review the result only if it changes today's priorities.",
    urgency: "low",
    sourceType: "hermes_run",
    sourceId: run.runId,
    evidence: [{ source: "hermes_run", label: "Completed Hermes run", reference: run.runId, occurredAt: run.updatedAt }],
    approval: { state: "not_required", runId: run.runId, requestId: null },
    createdAt: run.updatedAt,
    snoozedUntil: null,
    comments: [],
  };
}

async function ingestCompletedIntakes(runs: HermesRunProjection[]): Promise<void> {
  const state = await readCockpitState();
  const known = new Set(state.snapshots.map((item) => item.runId));
  for (const run of runs) {
    if (!run.context.startsWith("cockpit:intake:") || run.status !== "completed" || !run.result || known.has(run.runId)) continue;
    try {
      const snapshot = parseCockpitIntake(run.result, run.runId);
      await recordCockpitSnapshot(snapshot);
      await recordCockpitAction({ cardId: "intake", action: "intake_completed", actor: "Hermes", runId: run.runId, requestId: null, outcome: "completed", detail: `${snapshot.cards.length} normalized cards.` });
    } catch (error) {
      await recordCockpitAction({ cardId: "intake", action: "intake_completed", actor: "Hermes", runId: run.runId, requestId: null, outcome: "failed", detail: error instanceof Error ? error.message : "Invalid intake output." });
    }
  }
}

export async function getDailyBusinessCockpit(): Promise<DailyBusinessCockpit> {
  const { management, config } = clients();
  const [health, managementSnapshot] = await Promise.all([management.health(), management.snapshot()]);
  const allRuns = bridge().list();
  await ingestCompletedIntakes(allRuns);
  const state = await readCockpitState();
  const latest = state.snapshots[0] ?? null;
  const openRisks = state.manualRisks.filter((item) => item.status === "open");
  const projected = latest?.cards ?? [];
  const cards = [
    ...projected,
    ...openRisks.filter((risk) => !projected.some((card) =>
      card.sourceType === "manual_risk" &&
      (card.sourceId === risk.id || card.sourceId.endsWith(`:${risk.id}`))
    )).map(manualRiskCard),
    ...allRuns.filter((run) => run.status === "completed" && run.context.startsWith("cockpit:") && !run.context.startsWith("cockpit:intake:")).slice(0, 5).map(recentWinCard),
  ].map((card) => {
    const saved = state.cardState[card.id];
    return saved ? { ...card, snoozedUntil: saved.snoozedUntil, comments: saved.comments } : card;
  }).sort((a, b) => {
    const rank = { critical: 0, high: 1, normal: 2, low: 3 } as const;
    return rank[a.urgency] - rank[b.urgency] || b.createdAt.localeCompare(a.createdAt);
  });
  const sourceCoverage = latest?.sourceCoverage ?? sourceDefaults(managementSnapshot, openRisks.length);
  sourceCoverage.hermesJobs = sourceDefaults(managementSnapshot, openRisks.length).hermesJobs;
  sourceCoverage.manualRisks = sourceDefaults(managementSnapshot, openRisks.length).manualRisks;
  sourceCoverage.supermemory = sourceDefaults(managementSnapshot, openRisks.length).supermemory;
  const cockpitRuns = allRuns.filter((run) => run.context.startsWith("cockpit:"));
  const views = state.actions.filter((item) => item.action === "viewed").length;
  const actionsStarted = state.actions.filter((item) => item.outcome === "started").length;
  const actionsCompleted = state.actions.filter((item) => item.outcome === "completed").length;
  const sourceSystemsCovered = Object.values(sourceCoverage).filter((item) => item.status === "connected" || item.status === "partial").length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    shadowMode: true,
    profile: config.profile,
    health,
    memory: {
      namespace: managementSnapshot.memory.namespace,
      provider: managementSnapshot.memory.activeProvider,
      captureState: managementSnapshot.memory.captureState,
      recallHealth: managementSnapshot.memory.recallHealth,
    },
    sourceCoverage,
    cards,
    runs: cockpitRuns.slice(0, 20).map((run) => ({
      runId: run.runId, context: run.context, capability: run.capability, status: run.status,
      startedAt: run.startedAt, updatedAt: run.updatedAt, result: run.result, error: run.error,
      pendingDecision: run.pendingDecision,
    })),
    telemetry: {
      cockpitViews: views,
      actionsStarted,
      actionsCompleted,
      sourceSystemsCovered,
      estimatedToolSwitchesAvoided: Math.max(0, sourceSystemsCovered - 1) * Math.max(1, views),
      lastIntakeAt: latest?.generatedAt ?? null,
    },
  };
}

export async function startDailyIntake(idempotencyKey: string, timezone: string) {
  const { management, config } = clients();
  const [snapshot, state] = await Promise.all([management.snapshot(), readCockpitState()]);
  const runs = bridge().list();
  const now = new Date().toISOString();
  const prompt = buildIntakePrompt({
    now,
    timezone,
    manualRisks: state.manualRisks.filter((item) => item.status === "open"),
    jobs: snapshot.jobs,
    recentRuns: runs.slice(0, 12).map((run) => ({
      runId: run.runId, context: run.context, capability: run.capability, status: run.status,
      startedAt: run.startedAt, updatedAt: run.updatedAt, result: run.result, error: run.error,
      pendingDecision: run.pendingDecision,
    })),
  });
  const run = await bridge().start({
    input: prompt,
    instructions: "Read-only shadow-mode analysis. Return the requested JSON contract exactly. Never perform an external or material write.",
    context: `cockpit:intake:${now.slice(0, 10)}`,
    capability: "daily-business-intake",
    idempotencyKey,
  });
  await recordCockpitAction({ cardId: "intake", action: "intake_started", actor: "Jeremy", runId: run.runId, requestId: null, outcome: "started", detail: `Read-only intake started for ${config.profile}.` });
  return run;
}

function actionPrompt(action: "investigate" | "draft_response" | "ask_why", card: CockpitCard): string {
  const objective = action === "investigate"
    ? "Investigate the evidence, identify what is verified versus uncertain, and recommend the smallest safe next step."
    : action === "draft_response"
      ? "Draft a response for Jeremy to review. Do not create or send a draft in any external system."
      : "Explain why this item is in the cockpit, which evidence supports it, and what would make the recommendation change.";
  return `${objective}\n\nCard:\n${JSON.stringify(card)}\n\nThis is read-only shadow-mode work. Do not perform external or material writes.`;
}

export async function performCockpitAction(input: {
  action: CockpitAction;
  cardId: string;
  actor: string;
  idempotencyKey: string;
  confirmed: boolean;
  runId?: string;
  requestId?: string;
  body?: string;
  until?: string;
  schedule?: string;
}) {
  if (!COCKPIT_ACTIONS.includes(input.action)) throw new Error("Unsupported cockpit action.");
  const cockpit = await getDailyBusinessCockpit();
  const card = cockpit.cards.find((item) => item.id === input.cardId);
  if (!card) throw new Error("Cockpit card not found or no longer active.");
  if (input.action === "investigate" || input.action === "draft_response" || input.action === "ask_why") {
    const run = await bridge().start({
      input: actionPrompt(input.action, card),
      instructions: "Return analysis to the originating cockpit card. Do not perform external or material writes.",
      context: `cockpit:card:${card.id}:${input.action}`,
      capability: input.action,
      idempotencyKey: input.idempotencyKey,
    });
    await recordCockpitAction({ cardId: card.id, action: input.action, actor: input.actor, runId: run.runId, requestId: null, outcome: "started", detail: "Hermes run started." });
    return { kind: "run", run } as const;
  }
  if (input.action === "approve" || input.action === "reject") {
    if (!input.confirmed) throw new Error("Explicit confirmation is required for a Hermes decision.");
    if (!input.runId || !input.requestId || card.approval.runId !== input.runId || card.approval.requestId !== input.requestId) {
      throw new Error("The exact pending run and request identity are required.");
    }
    const result = await bridge().approve(input.runId, input.requestId, input.action === "approve" ? "once" : "deny");
    await recordCockpitAction({ cardId: card.id, action: input.action, actor: input.actor, runId: input.runId, requestId: input.requestId, outcome: input.action === "approve" ? "completed" : "rejected", detail: `Hermes decision ${input.action} recorded.` });
    return { kind: "decision", result } as const;
  }
  if (input.action === "comment") {
    const body = input.body?.trim();
    if (!body) throw new Error("A comment is required.");
    const comment = await commentOnCard(card.id, body.slice(0, 4_000), input.actor);
    await recordCockpitAction({ cardId: card.id, action: "comment", actor: input.actor, runId: null, requestId: null, outcome: "recorded", detail: "Local operator comment recorded." });
    return { kind: "comment", comment } as const;
  }
  if (input.action === "snooze") {
    const until = input.until ? new Date(input.until) : null;
    if (!until || Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) throw new Error("A future snooze time is required.");
    await snoozeCard(card.id, until.toISOString());
    await recordCockpitAction({ cardId: card.id, action: "snooze", actor: input.actor, runId: null, requestId: null, outcome: "recorded", detail: `Snoozed until ${until.toISOString()}.` });
    return { kind: "snooze", until: until.toISOString() } as const;
  }
  if (input.action === "schedule") {
    if (!input.confirmed) throw new Error("Explicit confirmation is required to create a Hermes schedule.");
    const schedule = input.schedule?.trim();
    if (!schedule) throw new Error("A Hermes schedule is required.");
    const { management } = clients();
    const result = await management.perform("job.create", {
      name: `Cockpit: ${card.title}`.slice(0, 120),
      prompt: actionPrompt("investigate", card),
      schedule,
      skills: [],
    });
    await recordCockpitAction({ cardId: card.id, action: "schedule", actor: input.actor, runId: null, requestId: null, outcome: "completed", detail: `Canonical Hermes job created with schedule ${schedule}.` });
    return { kind: "schedule", result } as const;
  }
  throw new Error("Unsupported cockpit action.");
}

export async function createManualRisk(input: { title: string; whyItMatters: string; recommendedNextStep: string; urgency: CockpitUrgency; actor: string }) {
  const risk = await addManualRisk({
    title: input.title,
    whyItMatters: input.whyItMatters,
    recommendedNextStep: input.recommendedNextStep,
    urgency: input.urgency,
  });
  await recordCockpitAction({ cardId: `manual-risk-${risk.id}`, action: "risk_added", actor: input.actor, runId: null, requestId: null, outcome: "recorded", detail: risk.title });
  return risk;
}

export async function closeManualRisk(id: string, actor: string) {
  const risk = await resolveManualRisk(id);
  await recordCockpitAction({ cardId: `manual-risk-${risk.id}`, action: "risk_resolved", actor, runId: null, requestId: null, outcome: "recorded", detail: risk.title });
  return risk;
}

export async function recordCockpitView(actor = "Jeremy") {
  return recordCockpitAction({ cardId: "cockpit", action: "viewed", actor, runId: null, requestId: null, outcome: "recorded", detail: "Daily Business Intake viewed." });
}

export function newCockpitIdempotencyKey(prefix: string, value: string): string {
  return `${prefix}:${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}
