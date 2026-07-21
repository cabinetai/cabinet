import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import {
  createConversation,
  listConversationMetas,
  readConversationMeta,
  writeConversationMeta,
  writeSession,
} from "@/lib/agents/conversation-store";
import {
  HermesGatewayClient,
  type HermesGatewaySession,
  type HermesStoredSession,
} from "@/lib/hermes/gateway-client";
import { readHermesServerConfig } from "@/lib/hermes/server-config";
import {
  claimHermesSessionOperation,
  completeHermesSessionOperation,
  releaseHermesSessionOperation,
} from "@/lib/hermes/session-operations";

export const dynamic = "force-dynamic";

type SessionAction = {
  action?: "resume" | "rename" | "archive" | "branch";
  sessionId?: string;
  title?: string;
  operationId?: string;
};

async function projections(): Promise<Map<string, string>> {
  const conversations = await listConversationMetas({ cabinetPath: ".", limit: 2_000 });
  return new Map(
    conversations
      .filter((item) => item.hermes?.sessionId)
      .map((item) => [item.hermes!.sessionId, item.id])
  );
}

async function importSession(
  stored: HermesStoredSession | undefined,
  session: HermesGatewaySession,
  parentSessionId?: string
): Promise<string> {
  const existing = (await projections()).get(session.sessionId);
  if (existing) return existing;
  const config = readHermesServerConfig();
  const title = stored?.title || `Hermes session ${session.sessionId.slice(0, 12)}`;
  const meta = await createConversation({
    agentSlug: "editor",
    cabinetPath: ".",
    title,
    trigger: "manual",
    prompt: `Resumed canonical Hermes session ${session.sessionId}.`,
    providerId: "hermes",
    adapterType: "hermes_runtime",
    initialStatus: "completed",
  });
  await writeSession(
    meta.id,
    {
      kind: "hermes_runtime",
      resumeId: session.sessionId,
      alive: true,
      lastUsedAt: new Date().toISOString(),
      codecBlob: { profile: config.profile, sessionId: session.sessionId },
      displayId: session.sessionId,
    },
    "."
  );
  await writeConversationMeta({
    ...meta,
    hermes: {
      profile: config.profile,
      sessionId: session.sessionId,
      parentSessionId,
      liveSessionId: session.liveSessionId,
      eventSequence: 0,
      status: "idle",
      artifactPaths: [],
      updatedAt: new Date().toISOString(),
    },
  });
  return meta.id;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireApiAuth(request);
  if (unauthorized) return unauthorized;
  const client = new HermesGatewayClient(readHermesServerConfig());
  try {
    await client.connect();
    const [stored, active, known] = await Promise.all([
      client.listSessions(),
      client.listActiveSessions(),
      projections(),
    ]);
    const activeByStored = new Map(active.map((item) => [item.sessionId, item]));
    const query = (request.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
    const sessions = stored
      .filter((item) =>
        !query || `${item.title} ${item.preview} ${item.id}`.toLowerCase().includes(query)
      )
      .map((item) => ({
        ...item,
        projectionId: known.get(item.id) || null,
        active: activeByStored.has(item.id),
        status: activeByStored.get(item.id)?.status || "archived",
        running: activeByStored.get(item.id)?.running || false,
      }));
    return NextResponse.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Hermes session request failed" },
      { status: 503 }
    );
  } finally {
    client.close();
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request);
  if (unauthorized) return unauthorized;
  let body: SessionAction;
  try {
    body = (await request.json()) as SessionAction;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sessionId = body.sessionId?.trim();
  if (!body.action || !sessionId) {
    return NextResponse.json({ error: "Action and session ID are required" }, { status: 400 });
  }
  const consequential = body.action === "branch";
  const operationId = body.operationId?.trim();
  const operationIdentity = consequential && operationId
    ? `${body.action}:${sessionId}:${operationId}`
    : null;
  if (consequential && !operationIdentity) {
    return NextResponse.json({ error: "A stable operation ID is required" }, { status: 400 });
  }
  if (operationIdentity) {
    const claim = await claimHermesSessionOperation(operationIdentity);
    if (!claim.claimed) {
      if (claim.result) return NextResponse.json(claim.result);
      return NextResponse.json({ error: "This session action is already in progress" }, { status: 409 });
    }
  }
  const client = new HermesGatewayClient(readHermesServerConfig());
  try {
    await client.connect();
    const stored = (await client.listSessions()).find((item) => item.id === sessionId);
    if (!stored) {
      if (operationIdentity) await releaseHermesSessionOperation(operationIdentity);
      return NextResponse.json({ error: "Hermes session not found" }, { status: 404 });
    }
    const active = await client.listActiveSessions();
    const current = active.find((item) => item.sessionId === sessionId);

    if (body.action === "archive") {
      if (current) await client.closeSession(current.liveSessionId);
      return NextResponse.json({ ok: true, status: "archived" });
    }

    const resumed = await client.resumeSession(sessionId);
    const openedForAction = !current;

    if (body.action === "rename") {
      const title = body.title?.trim();
      if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
      await client.renameSession(resumed.liveSessionId, title);
      const projectionId = (await projections()).get(sessionId);
      if (projectionId) {
        const projection = await readConversationMeta(projectionId, ".");
        if (projection) await writeConversationMeta({ ...projection, title });
      }
      if (openedForAction) await client.closeSession(resumed.liveSessionId);
      return NextResponse.json({ ok: true, title });
    }

    if (body.action === "branch") {
      const result = await client.branch(resumed.liveSessionId);
      const branchLiveId = String(result.session_id || "");
      const branchActive = (await client.listActiveSessions()).find(
        (item) => item.liveSessionId === branchLiveId
      );
      if (!branchActive?.sessionId) throw new Error("Hermes did not return branch identity.");
      const branch = await client.resumeSession(branchActive.sessionId);
      const conversationId = await importSession(
        {
          id: branch.sessionId,
          title: String(result.title || `${stored.title} (branch)`),
          preview: stored.preview,
          startedAt: Date.now() / 1_000,
          messageCount: branch.messages.length,
          source: "cabinet",
        },
        branch,
        sessionId
      );
      if (openedForAction) await client.closeSession(resumed.liveSessionId);
      const response = { ok: true, conversationId, sessionId: branch.sessionId };
      if (operationIdentity) await completeHermesSessionOperation(operationIdentity, response);
      return NextResponse.json(response);
    }

    const conversationId = await importSession(stored, resumed);
    return NextResponse.json({ ok: true, conversationId, sessionId: resumed.sessionId });
  } catch (error) {
    if (operationIdentity) await releaseHermesSessionOperation(operationIdentity);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Hermes session action failed" },
      { status: 409 }
    );
  } finally {
    client.close();
  }
}
