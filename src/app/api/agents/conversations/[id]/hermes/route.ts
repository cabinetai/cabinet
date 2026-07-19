import { NextRequest, NextResponse } from "next/server";
import {
  appendEventLog,
  claimHermesDecision,
  readConversationMeta,
  readEventLog,
  releaseHermesDecision,
} from "@/lib/agents/conversation-store";
import { normalizeHermesActivity, type HermesDecisionKind } from "@/lib/hermes/activity";
import { HermesGatewayClient } from "@/lib/hermes/gateway-client";
import { readHermesServerConfig } from "@/lib/hermes/server-config";

export const dynamic = "force-dynamic";

type DecisionBody = {
  kind?: HermesDecisionKind;
  requestId?: string | null;
  eventSeq?: number;
  action?: string;
  answer?: string;
  comment?: string;
  value?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cabinetPath = req.nextUrl.searchParams.get("cabinetPath") || undefined;
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta || meta.adapterType !== "hermes_runtime" || !meta.hermes) {
    return NextResponse.json({ error: "Hermes conversation not found" }, { status: 404 });
  }

  let body: DecisionBody;
  try {
    body = (await req.json()) as DecisionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.kind || typeof body.eventSeq !== "number") {
    return NextResponse.json({ error: "Stable request identity is required" }, { status: 400 });
  }

  const activity = normalizeHermesActivity(await readEventLog(id, { cabinetPath }));
  const pending = activity.decisions.find(
    (item) =>
      item.kind === body.kind &&
      item.eventSeq === body.eventSeq &&
      item.requestId === (body.requestId || null)
  );
  if (!pending) {
    return NextResponse.json({ error: "Hermes request was not found" }, { status: 404 });
  }
  if (pending.status !== "pending" && pending.status !== "commented") {
    return NextResponse.json(
      { error: `Hermes request is already ${pending.status}` },
      { status: 409 }
    );
  }
  if (pending.expiresAt && Date.parse(pending.expiresAt) <= Date.now()) {
    await appendEventLog(
      id,
      {
        type: "runtime.decision",
        kind: pending.kind,
        requestId: pending.requestId,
        requestEventSeq: pending.eventSeq,
        sessionId: pending.sessionId,
        runId: pending.runId,
        status: "expired",
        decision: "expired",
      },
      cabinetPath
    );
    return NextResponse.json({ error: "Hermes request has expired" }, { status: 409 });
  }

  const action = body.action?.trim() || "";
  const requestIdentity = `${body.kind}:${body.requestId || "session"}:${body.eventSeq}:${
    action === "comment" ? body.comment?.trim() || "" : "resolve"
  }`;
  const claimed = await claimHermesDecision(
    id,
    requestIdentity,
    {
      kind: body.kind,
      requestId: body.requestId || null,
      requestEventSeq: body.eventSeq,
      action,
      claimedAt: new Date().toISOString(),
    },
    cabinetPath
  );
  if (!claimed) {
    return NextResponse.json({ error: "This response was already submitted" }, { status: 409 });
  }

  const client = new HermesGatewayClient(readHermesServerConfig());
  try {
    await client.connect();
    let status: "resolved" | "commented" | "expired" = "resolved";
    let decision = action;

    if (body.kind === "clarification") {
      if (!body.requestId || typeof body.answer !== "string" || !body.answer.trim()) {
        throw new Error("A clarification answer and request ID are required.");
      }
      await client.respondClarification(body.requestId, body.answer.trim());
      decision = "answered";
    } else if (body.kind === "approval") {
      const liveSessionId = meta.hermes.liveSessionId;
      if (!liveSessionId) throw new Error("The live Hermes session is unavailable.");
      if (action === "comment") {
        const comment = body.comment?.trim();
        if (!comment) throw new Error("A comment is required.");
        await client.steer(liveSessionId, comment);
        status = "commented";
        decision = "commented";
      } else {
        const choice =
          action === "approve_session"
            ? "session"
            : action === "approve_always"
              ? "always"
              : action === "reject"
                ? "deny"
                : "once";
        const result = await client.respondApproval(liveSessionId, choice);
        if (!result.resolved) {
          throw new Error("Hermes did not resolve the active approval request.");
        }
        decision = choice;
      }
    } else if (body.kind === "secret") {
      if (!body.requestId || typeof body.value !== "string" || !body.value) {
        throw new Error("A secret value and request ID are required.");
      }
      const result = await client.respondSecret(body.requestId, body.value);
      status = result.status === "expired" ? "expired" : "resolved";
      decision = result.status === "expired" ? "expired" : "provided";
    } else if (body.kind === "sudo") {
      if (!body.requestId || typeof body.value !== "string" || !body.value) {
        throw new Error("A sudo value and request ID are required.");
      }
      const result = await client.respondSudo(body.requestId, body.value);
      status = result.status === "expired" ? "expired" : "resolved";
      decision = result.status === "expired" ? "expired" : "approved";
    }

    await appendEventLog(
      id,
      {
        type: "runtime.decision",
        kind: body.kind,
        requestId: body.requestId || null,
        requestEventSeq: body.eventSeq,
        sessionId: pending.sessionId,
        runId: pending.runId,
        status,
        decision,
      },
      cabinetPath
    );
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    await releaseHermesDecision(id, requestIdentity, cabinetPath);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Hermes response failed" },
      { status: 409 }
    );
  } finally {
    client.close();
  }
}
