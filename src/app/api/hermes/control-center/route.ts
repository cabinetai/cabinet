import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { getHermesControlCenterSnapshot } from "@/lib/hermes/control-center";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = await requireApiAuth(request);
  if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") {
    return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  }
  try {
    return NextResponse.json(await getHermesControlCenterSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Hermes Control Center is unavailable." },
      { status: 502 }
    );
  }
}
