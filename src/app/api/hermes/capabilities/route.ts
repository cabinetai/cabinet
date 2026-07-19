import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { listCapabilityEvidence, promoteCapability } from "@/lib/hermes/capability-evidence";
import { HERMES_CAPABILITY_STAGES, type HermesCapabilityStage } from "@/lib/hermes/capability-types";
import { readHermesServerConfig } from "@/lib/hermes/server-config";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";

export async function GET(request: NextRequest) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  return NextResponse.json({ stages: HERMES_CAPABILITY_STAGES, records: await listCapabilityEvidence() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.confirmed !== true) return NextResponse.json({ error: "Explicit operator confirmation is required." }, { status: 428 });
    if (typeof body.to !== "string" || !HERMES_CAPABILITY_STAGES.includes(body.to as HermesCapabilityStage)) return NextResponse.json({ error: "A valid next lifecycle stage is required." }, { status: 400 });
    const record = await promoteCapability({ capability: String(body.capability ?? ""), profile: readHermesServerConfig().profile, to: body.to as HermesCapabilityStage, actor: String(body.actor ?? ""), reason: String(body.reason ?? ""), evidence: body.evidence && typeof body.evidence === "object" ? body.evidence as Record<string, string> : {} });
    return NextResponse.json({ ok: true, record });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Capability promotion failed." }, { status: 400 }); }
}
