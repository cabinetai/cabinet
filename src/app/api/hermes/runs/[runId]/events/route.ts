import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { HermesRunClient } from "@/lib/hermes/run-client";
import { getHermesRunBridge } from "@/lib/hermes/run-bridge";
import { readHermesServerConfig } from "@/lib/hermes/server-config";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";

function bridge() { return getHermesRunBridge(() => new HermesRunClient(readHermesServerConfig())); }
const terminal = new Set(["completed", "cancelled", "failed"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  const { runId } = await params;
  const from = Number(request.nextUrl.searchParams.get("after") || "0");
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let cursor = Number.isFinite(from) ? from : 0;
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      while (!request.signal.aborted) {
        const run = bridge().get(runId);
        if (!run) { send({ event: "bridge.not_found", runId }); break; }
        for (const event of run.events.filter((item) => item.sequence > cursor)) { send(event); cursor = event.sequence; }
        if (terminal.has(run.status)) { send({ event: "bridge.closed", runId, status: run.status, lastSequence: cursor }); break; }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no" } });
}
