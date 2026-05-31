import { NextRequest } from "next/server";
import { conversationEvents } from "@/lib/agents/conversation-events";
import type { ConversationEvent } from "@/lib/agents/conversation-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Global conversation event stream (no id) — used by the sidebar recent-tasks
 * list and /tasks index to auto-refresh on turn appends + task status
 * transitions. Per-conversation listeners still use /[id]/events.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: ConversationEvent | { type: "ping"; ts: string }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // controller may be closed
        }
      };

      send({ type: "ping", ts: new Date().toISOString() });

      const unsubscribe = conversationEvents.subscribe(undefined, (event) =>
        send(event)
      );
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
