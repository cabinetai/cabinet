import { NextResponse } from "next/server";
import { buildDiagnosticsBundle } from "@/lib/log/diagnostics-bundle";

export const dynamic = "force-dynamic";

/** Download the diagnostics zip (PRD §3.4). Nothing is auto-uploaded. */
export async function GET() {
  try {
    const buffer = await buildDiagnosticsBundle();
    const date = new Date().toISOString().slice(0, 10);
    try {
      const { emit } = await import("@/lib/telemetry");
      emit("diagnostics.exported", {});
    } catch {
      // telemetry optional
    }
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="cabinet-diagnostics-${date}.zip"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "bundle failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
