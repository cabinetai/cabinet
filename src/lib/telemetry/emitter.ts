import crypto from "node:crypto";
import {
  EVENT_PAYLOAD_KEYS,
  isAllowedEvent,
  type EventName,
  type EventPayload,
} from "./catalog";
import { drainOnce, drainOrphans } from "./flusher";
import { isTelemetryEnabled } from "./kill-switches";
import { enqueue } from "./queue";

const FLUSH_INTERVAL_MS = 60_000;
const FLUSH_THRESHOLD = 10;

let pendingCount = 0;
let intervalTimer: NodeJS.Timeout | null = null;
let initialized = false;
let scheduledFlush: Promise<void> | null = null;

export function emit(name: EventName, payload: EventPayload = {}): void {
  if (!isTelemetryEnabled()) return;
  if (!isAllowedEvent(name)) return;

  try {
    const filtered = enforcePayloadKeys(name, payload);
    enqueue({
      id: crypto.randomUUID(),
      name,
      occurredAt: Date.now(),
      payload: filtered,
    });
    pendingCount++;
    if (pendingCount >= FLUSH_THRESHOLD) {
      scheduleFlush();
    }
  } catch {
    /* swallow — telemetry must never crash callers */
  }
}

function enforcePayloadKeys(
  name: EventName,
  payload: EventPayload
): Record<string, unknown> {
  const allowed = EVENT_PAYLOAD_KEYS[name];
  const out: Record<string, unknown> = {};
  const extras: string[] = [];

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (!allowed.includes(key)) {
      extras.push(key);
      continue;
    }
    if (typeof value === "string" && value.length > 256) {
      out[key] = value.slice(0, 256);
    } else {
      out[key] = value;
    }
  }

  if (extras.length > 0 && process.env.NODE_ENV !== "production") {
    console.warn(
      `[telemetry] ${name}: stripped unknown payload keys: ${extras.join(", ")}`
    );
  }

  return out;
}

function scheduleFlush(): void {
  if (scheduledFlush) return;
  scheduledFlush = Promise.resolve().then(async () => {
    pendingCount = 0;
    try {
      await drainOnce();
    } finally {
      scheduledFlush = null;
    }
  });
}

export function startTelemetryFlusher(): void {
  if (initialized) return;
  initialized = true;
  if (!isTelemetryEnabled()) return;

  drainOrphans().catch(() => {});

  intervalTimer = setInterval(() => {
    drainOnce().catch(() => {});
  }, FLUSH_INTERVAL_MS);
  intervalTimer.unref?.();

  // Fire-and-forget on exit: don't await, don't block the process. Anything
  // unsent survives on disk and ships on the next startup via drainOrphans().
  const flushOnExit = () => {
    drainOnce().catch(() => {});
  };
  process.once("beforeExit", flushOnExit);
  process.once("SIGINT", flushOnExit);
  process.once("SIGTERM", flushOnExit);
}

export function stopTelemetryFlusher(): void {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
  initialized = false;
}
