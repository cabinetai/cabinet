import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { HermesRunClient, HermesRunError } from "@/lib/hermes/run-client";
import { getHermesRunBridge } from "@/lib/hermes/run-bridge";
import { readHermesServerConfig } from "@/lib/hermes/server-config";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";

function bridge() { return getHermesRunBridge(() => new HermesRunClient(readHermesServerConfig())); }
function status(error: unknown) { return error instanceof HermesRunError ? error.status ?? 400 : 400; }

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  const { runId } = await params; const run = bridge().get(runId);
  return run ? NextResponse.json(run, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Run projection not found." }, { status: 404 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try {
    const { runId } = await params; const body = await request.json() as Record<string, unknown>;
    if (body.confirmed !== true || typeof body.requestId !== "string" || !["once", "session", "always", "deny"].includes(String(body.choice))) return NextResponse.json({ error: "A current request identity, valid choice, and explicit confirmation are required." }, { status: 428 });
    return NextResponse.json(await bridge().approve(runId, body.requestId, body.choice as "once" | "session" | "always" | "deny"));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Approval failed." }, { status: status(error) }); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try { const { runId } = await params; return NextResponse.json(await bridge().stop(runId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Stop failed." }, { status: status(error) }); }
}
