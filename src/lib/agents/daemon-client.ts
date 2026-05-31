import type { ConversationErrorKind } from "@/types/conversations";
import { getDaemonUrl, getOrCreateDaemonToken } from "./daemon-auth";

interface CreateDaemonSessionInput {
  id: string;
  prompt: string;
  providerId?: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  cwd?: string;
  timeoutSeconds?: number;
  /**
   * Adapter-level resume handle (e.g. Claude --resume session id). Distinct
   * from the daemon's session/run id (`id`). Null for fresh runs.
   */
  adapterSessionId?: string | null;
  /**
   * Pre-rehydrated adapter session params (i.e. codec-deserialized blob).
   * The daemon passes this through as `ctx.sessionParams` so the adapter
   * resumes in its native shape without knowing about the session.json layout.
   */
  adapterSessionParams?: Record<string, unknown> | null;
}

interface DaemonSessionOutput {
  status: string;
  output: string;
  adapterSessionId?: string | null;
  adapterSessionParams?: Record<string, unknown> | null;
  adapterUsage?: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
  } | null;
  adapterErrorKind?: ConversationErrorKind | null;
  adapterErrorHint?: string | null;
  adapterErrorRetryAfterSec?: number | null;
}

async function daemonFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getOrCreateDaemonToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${getDaemonUrl()}${path}`, {
    ...init,
    headers,
  });
}

export async function createDaemonSession(
  input: CreateDaemonSessionInput
): Promise<void> {
  const response = await daemonFetch("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to create daemon session (${response.status})`);
  }
}

/**
 * Poll the daemon until the session is no longer running. Calls onPartial
 * with the accumulated stdout on each poll cycle (when it changed), so the
 * caller can stream partial content into a task turn.
 *
 * Returns the final output + status + adapter-reported usage, session params,
 * and (if failed) the classified error. Throws on explicit error paths; does
 * NOT throw on transient 404s (daemon briefly returns 404 while cleaning
 * up), retrying up to the deadline.
 */
export async function pollDaemonSessionUntilDone(
  sessionId: string,
  options: {
    onPartial?: (output: string) => void;
    intervalMs?: number;
    deadlineMs?: number;
  } = {}
): Promise<DaemonSessionOutput> {
  const interval = options.intervalMs ?? 700;
  const deadline = Date.now() + (options.deadlineMs ?? 15 * 60 * 1000);
  let lastOutput = "";

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const data = await getDaemonSessionOutput(sessionId);
      if (options.onPartial && data.output && data.output !== lastOutput) {
        lastOutput = data.output;
        try {
          options.onPartial(data.output);
        } catch {
          // swallow; partial-callback errors must not stop polling
        }
      }
      if (data.status !== "running") {
        return data;
      }
    } catch {
      // transient; try again until deadline
    }
  }

  throw new Error(`Daemon session ${sessionId} timed out while polling`);
}

export async function getDaemonSessionOutput(id: string): Promise<DaemonSessionOutput> {
  const response = await daemonFetch(`/session/${id}/output`);
  if (!response.ok) {
    throw new Error(`Failed to load daemon session output (${response.status})`);
  }
  return response.json() as Promise<DaemonSessionOutput>;
}

export async function listDaemonSessions(): Promise<
  {
    id: string;
    createdAt: string;
    connected: boolean;
    exited: boolean;
    exitCode: number | null;
    providerId?: string;
    adapterType?: string;
  }[]
> {
  const response = await daemonFetch("/sessions");
  if (!response.ok) {
    throw new Error(`Failed to list daemon sessions (${response.status})`);
  }
  return response.json() as Promise<
    {
      id: string;
      createdAt: string;
      connected: boolean;
      exited: boolean;
      exitCode: number | null;
      providerId?: string;
      adapterType?: string;
    }[]
  >;
}

export async function stopDaemonSession(id: string): Promise<boolean> {
  try {
    const response = await daemonFetch(`/session/${id}/stop`, { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Graceful close: daemon writes `/exit` into the PTY's stdin and waits
 * for the CLI to shut itself down (with a 2s SIGTERM fallback). Distinct
 * from `stopDaemonSession` which SIGTERMs immediately — the PTY's
 * natural exit (code 0) then runs `finalizeConversation` with
 * `status: "completed"` instead of `"failed"`.
 */
export async function closeDaemonSession(id: string): Promise<boolean> {
  try {
    const response = await daemonFetch(`/session/${id}/close`, { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Write stdin into a live PTY session. Returns `true` on 200, `false` on any
 * error including 404 (session already exited). Callers that want to reuse the
 * CLI's REPL for same-process continues should try this first, then fall back
 * to `createDaemonSession` if it returns `false`.
 */
export async function writeDaemonSessionInput(
  id: string,
  input: string,
  options: { appendEnter?: boolean } = {}
): Promise<boolean> {
  try {
    const response = await daemonFetch(`/session/${id}/input`, {
      method: "POST",
      body: JSON.stringify({
        input,
        appendEnter: options.appendEnter ?? true,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check whether a daemon session currently exists and hasn't exited.
 * Used to decide between same-process stdin injection vs. fresh PTY spawn.
 */
export async function isDaemonSessionAlive(id: string): Promise<boolean> {
  try {
    const response = await daemonFetch(`/session/${id}/output`);
    if (!response.ok) return false;
    const data = (await response.json()) as { status?: string; exited?: boolean };
    if (data.exited === true) return false;
    if (data.status && data.status !== "running") return false;
    return true;
  } catch {
    return false;
  }
}

export async function reloadDaemonSchedules(): Promise<void> {
  const response = await daemonFetch("/reload-schedules", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to reload daemon schedules (${response.status})`);
  }
}
