import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDrainingDir, getQueueFilePath, getTelemetryDir } from "./paths";

const MAX_QUEUE_BYTES = 1_000_000;

export interface QueuedEvent {
  id: string;
  name: string;
  occurredAt: number;
  payload: Record<string, unknown>;
}

function ensureDirs(): void {
  fs.mkdirSync(getTelemetryDir(), { recursive: true });
  fs.mkdirSync(getDrainingDir(), { recursive: true });
}

export function enqueue(event: QueuedEvent): void {
  ensureDirs();
  const file = getQueueFilePath();

  try {
    const stat = fs.statSync(file);
    if (stat.size > MAX_QUEUE_BYTES) return;
  } catch {
    /* file does not exist yet */
  }

  const line = JSON.stringify(event) + "\n";
  fs.appendFileSync(file, line, { flag: "a" });
}

export interface DrainBatch {
  path: string;
  events: QueuedEvent[];
}

export function claimForDrain(): DrainBatch | null {
  ensureDirs();
  const src = getQueueFilePath();
  try {
    fs.accessSync(src);
  } catch {
    return null;
  }

  const dest = path.join(
    getDrainingDir(),
    `queue-${Date.now()}-${crypto.randomUUID()}.ndjson`
  );

  try {
    fs.renameSync(src, dest);
  } catch {
    return null;
  }

  const events = parseNdjson(dest);
  if (events.length === 0) {
    try {
      fs.unlinkSync(dest);
    } catch {
      /* ignore */
    }
    return null;
  }

  return { path: dest, events };
}

export function listOrphanDrains(): string[] {
  ensureDirs();
  try {
    return fs
      .readdirSync(getDrainingDir())
      .filter((name) => name.endsWith(".ndjson"))
      .map((name) => path.join(getDrainingDir(), name));
  } catch {
    return [];
  }
}

export function readDrain(filePath: string): QueuedEvent[] {
  return parseNdjson(filePath);
}

export function acknowledgeDrain(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

function parseNdjson(filePath: string): QueuedEvent[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }
  const out: QueuedEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as QueuedEvent;
      if (parsed && typeof parsed.id === "string" && typeof parsed.name === "string") {
        out.push(parsed);
      }
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}
