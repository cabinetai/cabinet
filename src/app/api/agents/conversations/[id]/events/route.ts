import { NextRequest } from "next/server";
import { conversationEvents } from "@/lib/agents/conversation-events";
import type { ConversationEvent } from "@/lib/agents/conversation-events";
import { readEventLog } from "@/lib/agents/conversation-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const encoder = new TextEncoder();

  // SSE reconnect: the browser auto-sends `Last-Event-ID`. Replay any
  // events with seq > last before subscribing to the live bus, so callers
  // never miss a turn during a drop-out.
  const lastEventIdHeader =
    req.headers.get("last-event-id") ||
    req.nextUrl.searchParams.get("lastEventId") ||
    null;
  const lastEventId = lastEventIdHeader ? Number.parseInt(lastEventIdHeader, 10) : null;
  const replayFromSeq =
    typeof lastEventId === "number" && Number.isFinite(lastEventId) && lastEventId > 0
      ? lastEventId
      : undefined;

  const cabinetPath = req.nextUrl.searchParams.get("cabinetPath") || undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const formatEvent = (event: ConversationEvent | { type: "ping"; ts: string }) => {
        const lines: string[] = [];
        if ("seq" in event && typeof event.seq === "number") {
          lines.push(`id: ${event.seq}`);
        }
        lines.push(`data: ${JSON.stringify(event)}`);
        lines.push("", "");
        return lines.join("\n");
      };

      const send = (event: ConversationEvent | { type: "ping"; ts: string }) => {
        try {
          controller.enqueue(encoder.encode(formatEvent(event)));
        } catch {
          // controller may be closed
        }
      };

      // 1. Initial ping.
      send({ type: "ping", ts: new Date().toISOString() });

      // 2. Replay missed events from events.log.
      if (replayFromSeq !== undefined) {
        try {
          const missed = await readEventLog(id, {
            cabinetPath,
            fromSeq: replayFromSeq,
          });
          for (const raw of missed) {
            // Reconstitute the shape of a ConversationEvent. events.log lines
            // contain { seq, ts, type, turn?, role?, pending?, ... }; the
            // payload was whatever the publisher passed in.
            const { seq, ts, type, ...rest } = raw as {
              seq?: number;
              ts?: string;
              type?: ConversationEvent["type"];
              [key: string]: unknown;
            };
            if (!type) continue;
            send({
              type,
              taskId: id,
              cabinetPath,
              ts: typeof ts === "string" ? ts : new Date().toISOString(),
              seq,
              payload: rest as Record<string, unknown>,
            });
          }
        } catch {
          // best-effort; live subscribe still attached below
        }
      }

      // 3. Subscribe to live bus.
      const unsubscribe = conversationEvents.subscribe(id, (event) => send(event));
      const heartbeat = setInterval(
        () => send({ type: "ping", ts: new Date().toISOString() }),
        15_000
      );

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
