import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";
import { openHermesDesktop } from "@/lib/hermes/desktop-escape";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request);
  if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") {
    return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.confirmed !== true || body.purpose !== "diagnostic") {
      return NextResponse.json({ error: "Explicit diagnostic confirmation is required." }, { status: 428 });
    }
    return NextResponse.json({ ok: true, purpose: "diagnostic", ...openHermesDesktop() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hermes Desktop could not be opened." }, { status: 500 });
  }
}
