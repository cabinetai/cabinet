import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";
import { HermesRunClient } from "@/lib/hermes/run-client";
import { getHermesRunBridge } from "@/lib/hermes/run-bridge";
import { readHermesServerConfig } from "@/lib/hermes/server-config";

export const dynamic = "force-dynamic";

function bridge() { return getHermesRunBridge(() => new HermesRunClient(readHermesServerConfig())); }

export async function GET(request: NextRequest) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  return NextResponse.json({ runs: bridge().list() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.requiresSecret === true || body.requiresSudo === true) return NextResponse.json({ error: "Hermes Run API does not support secret or sudo decisions. Use the interactive Hermes gateway path." }, { status: 422 });
    if (typeof body.input !== "string" || !body.input.trim() || typeof body.context !== "string" || !body.context.trim() || typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim()) return NextResponse.json({ error: "Run input, originating context, and idempotency key are required." }, { status: 400 });
    const run = await bridge().start({ input: body.input, instructions: typeof body.instructions === "string" ? body.instructions : undefined, sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined, context: body.context, capability: typeof body.capability === "string" ? body.capability : undefined, idempotencyKey: body.idempotencyKey });
    return NextResponse.json(run, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Hermes run failed to start." }, { status: 502 }); }
}
