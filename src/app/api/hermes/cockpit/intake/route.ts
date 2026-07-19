import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";
import { startDailyIntake } from "@/lib/hermes/cockpit-service";

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (!idempotencyKey) return NextResponse.json({ error: "An idempotency key is required." }, { status: 400 });
    const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "America/Vancouver";
    return NextResponse.json(await startDailyIntake(idempotencyKey, timezone), { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Daily intake failed to start." }, { status: 502 }); }
}
