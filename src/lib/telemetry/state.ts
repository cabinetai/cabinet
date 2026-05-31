import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getStateFilePath, getTelemetryDir } from "./paths";

export interface TelemetryState {
  installId: string;
  enabled: boolean;
  createdAt: number;
  bannerShownCount: number;
}

function ensureDir(): void {
  fs.mkdirSync(getTelemetryDir(), { recursive: true });
}

function freshState(): TelemetryState {
  return {
    installId: crypto.randomUUID(),
    enabled: true,
    createdAt: Date.now(),
    bannerShownCount: 0,
  };
}

export function readState(): TelemetryState {
  const file = getStateFilePath();
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as Partial<TelemetryState>;
    if (typeof parsed.installId !== "string") throw new Error("missing installId");
    return {
      installId: parsed.installId,
      enabled: parsed.enabled !== false,
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
      bannerShownCount:
        typeof parsed.bannerShownCount === "number" ? parsed.bannerShownCount : 0,
    };
  } catch {
    const state = freshState();
    writeState(state);
    return state;
  }
}

export function writeState(state: TelemetryState): void {
  ensureDir();
  const file = getStateFilePath();
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

export function updateState(patch: Partial<TelemetryState>): TelemetryState {
  const current = readState();
  const next = { ...current, ...patch };
  writeState(next);
  return next;
}
