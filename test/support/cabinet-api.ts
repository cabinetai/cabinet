/**
 * Thin, typed wrappers over the HTTP surface the e2e suite drives.
 *
 * Plain `fetch` rather than Playwright's `request` fixture: most of these are
 * called from `beforeAll`, where no page exists yet, and a conversation is
 * driven through the same routes whether a browser is involved or not. Keeping
 * them fixture-free means a spec can exercise the agent loop headlessly and only
 * open a page when it actually asserts on the DOM.
 */
import type { CabinetInstance } from "./harness";

export interface ConversationMeta {
  id: string;
  status: "idle" | "running" | "completed" | "failed";
  agentSlug: string;
  trigger?: string;
  summary?: string;
  artifactPaths?: string[];
  pendingActions?: Array<{ id: string; action: Record<string, unknown> }>;
  dispatchedActions?: Array<{ id: string; status: string; conversationId?: string }>;
  errorKind?: string;
  exitCode?: number;
  [key: string]: unknown;
}

async function json(response: Response, context: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${context}: HTTP ${response.status} — ${text}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Creating a conversation IS "send the first message": the route starts the run
 * unless `draftOnly` is set. It returns as soon as the CLI is spawned, so the
 * returned meta is almost always `running` — poll with `waitForStatus`.
 */
export async function startConversation(
  cabinet: CabinetInstance,
  body: Record<string, unknown>
): Promise<ConversationMeta> {
  const response = await fetch(`${cabinet.appUrl}/api/agents/conversations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentSlug: "editor", source: "manual", ...body }),
  });
  const payload = await json(response, "startConversation");
  return payload.conversation as ConversationMeta;
}

/** A follow-up turn. Returns the raw Response so a spec can assert on 409 busy. */
export function continueConversation(
  cabinet: CabinetInstance,
  id: string,
  userMessage: string,
  body: Record<string, unknown> = {}
): Promise<Response> {
  return fetch(`${cabinet.appUrl}/api/agents/conversations/${id}/continue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userMessage, ...body }),
  });
}

/** `stop` | `close` | `restart` | `edit-draft`. */
export function patchConversation(
  cabinet: CabinetInstance,
  id: string,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(`${cabinet.appUrl}/api/agents/conversations/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface ConversationArtifact {
  path: string;
  [key: string]: unknown;
}

export interface ConversationDetail {
  meta: ConversationMeta;
  prompt: string;
  transcript: string;
  rawTranscript: string;
  /** Files the agent claimed, via ARTIFACT: lines in its cabinet block. */
  artifacts: ConversationArtifact[];
  turns?: Array<{ role: string; content: string }>;
  /** Only populated with `withTurns` — carries the resumeId for the next turn. */
  session?: { resumeId?: string; alive?: boolean } | null;
}

/** `withTurns` also fetches the turns and the session handle. */
export async function getConversationDetail(
  cabinet: CabinetInstance,
  id: string,
  withTurns = false
): Promise<ConversationDetail> {
  const query = withTurns ? "?withTurns=1" : "";
  const response = await fetch(
    `${cabinet.appUrl}/api/agents/conversations/${id}${query}`
  );
  return (await json(response, "getConversationDetail")) as unknown as ConversationDetail;
}

export async function getConversation(
  cabinet: CabinetInstance,
  id: string
): Promise<ConversationMeta> {
  const detail = await getConversationDetail(cabinet, id);
  return detail.meta;
}

export async function listConversations(
  cabinet: CabinetInstance
): Promise<ConversationMeta[]> {
  const response = await fetch(`${cabinet.appUrl}/api/agents/conversations`);
  const payload = await json(response, "listConversations");
  return (payload.conversations ?? []) as ConversationMeta[];
}

/** Approve (and thereby dispatch) pending actions by id. */
export async function approveActions(
  cabinet: CabinetInstance,
  id: string,
  approve: string[]
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${cabinet.appUrl}/api/agents/conversations/${id}/actions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approve }),
    }
  );
  return json(response, "approveActions");
}

/** Run a job on demand — the same route the daemon's cron tick calls. */
export function runJob(
  cabinet: CabinetInstance,
  agentSlug: string,
  jobId: string
): Promise<Response> {
  return fetch(`${cabinet.appUrl}/api/agents/${agentSlug}/jobs/${jobId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "run",
      source: "scheduler",
      scheduledAt: "2026-01-01T00:00:00.000Z",
    }),
  });
}

const TERMINAL = new Set(["completed", "failed"]);

/**
 * Poll until the conversation reaches `status`. Polling rather than sleeping,
 * and failing loudly on the *wrong* terminal state rather than timing out, so a
 * run that fails for an unrelated reason reports that reason instead of a bare
 * 60-second timeout.
 */
export async function waitForStatus(
  cabinet: CabinetInstance,
  id: string,
  status: ConversationMeta["status"],
  timeoutMs = 60_000
): Promise<ConversationMeta> {
  const deadline = Date.now() + timeoutMs;
  let meta: ConversationMeta | undefined;
  for (;;) {
    meta = await getConversation(cabinet, id);
    if (meta.status === status) return meta;
    if (TERMINAL.has(meta.status) && TERMINAL.has(status) && meta.status !== status) {
      throw new Error(
        `expected conversation ${id} to be "${status}" but it settled as "${meta.status}"` +
          ` (exitCode=${meta.exitCode}, errorKind=${meta.errorKind})`
      );
    }
    if (Date.now() > deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for ${id} to be "${status}" (last: "${meta.status}")`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
