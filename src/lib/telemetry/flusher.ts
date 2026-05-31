import crypto from "node:crypto";
import os from "node:os";
import {
  acknowledgeDrain,
  claimForDrain,
  listOrphanDrains,
  readDrain,
  type QueuedEvent,
} from "./queue";
import { getOrCreateSessionId } from "./session";
import { readState } from "./state";
import { version as pkgVersion } from "../../../package.json";

const DEFAULT_ENDPOINT = "https://reports.runcabinet.com/telemetry";
const BATCH_SIZE = 25;
const POST_TIMEOUT_MS = 2500;

function getEndpoint(): string {
  return process.env.CABINET_TELEMETRY_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
}

function getClientVersion(): string | undefined {
  // npm_package_version is only set when running via `npm run …` — packaged
  // CLI/electron builds don't have it. Read from the bundled package.json so
  // the version is always present.
  return pkgVersion || process.env.npm_package_version;
}

function getSessionId(): string {
  return getOrCreateSessionId();
}

async function postBatch(events: QueuedEvent[]): Promise<boolean> {
  if (events.length === 0) return true;

  const state = readState();
  const body = {
    schemaVersion: "1" as const,
    app: "cabinet" as const,
    requestId: crypto.randomUUID(),
    installId: state.installId,
    sessionId: getSessionId(),
    clientVersion: getClientVersion(),
    platform: process.env.CABINET_RUNTIME === "electron" ? "desktop" : "cli",
    os: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    events,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    const res = await fetch(getEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res.status === 202 || (res.status >= 200 && res.status < 300);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function drainOnce(): Promise<void> {
  const batch = claimForDrain();
  if (!batch) return;

  const chunks: QueuedEvent[][] = [];
  for (let i = 0; i < batch.events.length; i += BATCH_SIZE) {
    chunks.push(batch.events.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const ok = await postBatch(chunk);
    if (!ok) return; // leave drain file in place for retry
  }

  acknowledgeDrain(batch.path);
}

export async function drainOrphans(): Promise<void> {
  for (const file of listOrphanDrains()) {
    const events = readDrain(file);
    if (events.length === 0) {
      acknowledgeDrain(file);
      continue;
    }
    let anyFail = false;
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const chunk = events.slice(i, i + BATCH_SIZE);
      const ok = await postBatch(chunk);
      if (!ok) {
        anyFail = true;
        break;
      }
    }
    if (!anyFail) acknowledgeDrain(file);
  }
}

export function describeHost(): { os: string; arch: string; cpus: number } {
  return { os: process.platform, arch: process.arch, cpus: os.cpus().length };
}
