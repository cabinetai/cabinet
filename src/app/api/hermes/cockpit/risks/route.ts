import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";
import { closeManualRisk, createManualRisk } from "@/lib/hermes/cockpit-service";
import type { CockpitUrgency } from "@/lib/hermes/cockpit-types";

const URGENCY = new Set<CockpitUrgency>(["critical", "high", "normal", "low"]);

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const urgency = typeof body.urgency === "string" ? body.urgency as CockpitUrgency : "normal";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const whyItMatters = typeof body.whyItMatters === "string" ? body.whyItMatters.trim() : "";
    const recommendedNextStep = typeof body.recommendedNextStep === "string" ? body.recommendedNextStep.trim() : "";
    if (!title || !whyItMatters || !recommendedNextStep || !URGENCY.has(urgency)) return NextResponse.json({ error: "Title, impact, next step, and valid urgency are required." }, { status: 400 });
    return NextResponse.json({ ok: true, risk: await createManualRisk({ title, whyItMatters, recommendedNextStep, urgency, actor: typeof body.actor === "string" ? body.actor : "Jeremy" }) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Manual risk could not be recorded." }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id || body.confirmed !== true) return NextResponse.json({ error: "Risk identity and explicit confirmation are required." }, { status: 428 });
    return NextResponse.json({ ok: true, risk: await closeManualRisk(id, typeof body.actor === "string" ? body.actor : "Jeremy") });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Manual risk could not be resolved." }, { status: 400 }); }
}
