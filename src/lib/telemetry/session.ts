import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getSessionFilePath, getTelemetryDir } from "./paths";

interface SessionRecord {
  sessionId: string;
  createdAt: number;
  pid: number;
}

function ensureDir(): void {
  fs.mkdirSync(getTelemetryDir(), { recursive: true });
}

/**
 * Return the session id shared by all Cabinet processes in this run.
 *
 * Semantics:
 * - If current-session.json exists and contains a valid id, use it.
 * - Otherwise, generate a new id and atomically write the file.
 * Whichever process (daemon or Next.js) boots first creates the session;
 * the other reads it. On daemon shutdown we call `clearSessionId()` so the
 * next run gets a fresh id.
 */
export function getOrCreateSessionId(): string {
  const file = getSessionFilePath();
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SessionRecord>;
    if (typeof parsed.sessionId === "string" && parsed.sessionId.length > 0) {
      return parsed.sessionId;
    }
  } catch {
    /* fall through to create */
  }
  return createAndWriteSession().sessionId;
}

function createAndWriteSession(): SessionRecord {
  ensureDir();
  const record: SessionRecord = {
    sessionId: crypto.randomUUID(),
    createdAt: Date.now(),
    pid: process.pid,
  };
  const file = getSessionFilePath();
  const tmp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.tmp`
  );
  fs.writeFileSync(tmp, JSON.stringify(record), "utf-8");
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Another process raced us; re-read and use theirs.
    try {
      const raw = fs.readFileSync(file, "utf-8");
      const parsed = JSON.parse(raw) as Partial<SessionRecord>;
      if (typeof parsed.sessionId === "string" && parsed.sessionId.length > 0) {
        return {
          sessionId: parsed.sessionId,
          createdAt: parsed.createdAt ?? Date.now(),
          pid: parsed.pid ?? 0,
        };
      }
    } catch {
      /* give up, use our local record even if we lost the write race */
    }
  }
  return record;
}

export function clearSessionId(): void {
  try {
    fs.unlinkSync(getSessionFilePath());
  } catch {
    /* already gone */
  }
}
