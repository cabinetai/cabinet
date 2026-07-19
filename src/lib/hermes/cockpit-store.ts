import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getManagedDataDir } from "@/lib/runtime/runtime-config";
import type { CockpitActionRecord, CockpitIntakeSnapshot, CockpitManualRisk, CockpitUrgency } from "./cockpit-types";

type CardState = Record<string, { snoozedUntil: string | null; comments: Array<{ id: string; body: string; actor: string; createdAt: string }> }>;
type FileShape = {
  schemaVersion: 1;
  manualRisks: CockpitManualRisk[];
  snapshots: CockpitIntakeSnapshot[];
  cardState: CardState;
  actions: CockpitActionRecord[];
};

const EMPTY: FileShape = { schemaVersion: 1, manualRisks: [], snapshots: [], cardState: {}, actions: [] };
let writeQueue: Promise<unknown> = Promise.resolve();

function statePath() { return path.join(getManagedDataDir(), ".cabinet-state", "hermes-daily-intake.json"); }

export async function readCockpitState(): Promise<FileShape> {
  try {
    const parsed = JSON.parse(await fs.readFile(statePath(), "utf8")) as Partial<FileShape>;
    return {
      schemaVersion: 1,
      manualRisks: Array.isArray(parsed.manualRisks) ? parsed.manualRisks : [],
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      cardState: parsed.cardState && typeof parsed.cardState === "object" ? parsed.cardState : {},
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
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
  });
}

export async function recordCockpitAction(input: Omit<CockpitActionRecord, "id" | "at"> & { at?: string }): Promise<CockpitActionRecord> {
  return mutate((state) => {
    const record: CockpitActionRecord = { ...input, id: randomUUID(), at: input.at ?? new Date().toISOString() };
    state.actions.push(record);
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
