import { NextRequest, NextResponse } from "next/server";
import { readHistoryConfig, writeHistoryConfig } from "@/lib/history/engine";

export const dynamic = "force-dynamic";

/** Per-cabinet history policy (PRD §4.7/§4.8): binary threshold + tier. */
export async function GET(req: NextRequest) {
  const cabinetPath = req.nextUrl.searchParams.get("cabinetPath") ?? "";
  return NextResponse.json({ ok: true, config: readHistoryConfig(cabinetPath) });
}

export async function PATCH(req: NextRequest) {
  let body: { cabinetPath?: string; binaryThresholdMB?: number; journalOnly?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const cabinetPath = typeof body.cabinetPath === "string" ? body.cabinetPath : "";
  const current = readHistoryConfig(cabinetPath);
  const threshold = body.binaryThresholdMB;
  if (threshold !== undefined && ![0, 2, 5].includes(threshold)) {
    return NextResponse.json(
      { ok: false, error: "binaryThresholdMB must be 0, 2, or 5" },
      { status: 400 }
    );
  }
  const next = {
    binaryThresholdMB: threshold ?? current.binaryThresholdMB,
    journalOnly:
      typeof body.journalOnly === "boolean" ? body.journalOnly : current.journalOnly,
  };
  try {
    writeHistoryConfig(cabinetPath, next);
  } catch (err) {
    const message = err instanceof Error ? err.message : "write failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
  if (next.journalOnly && !current.journalOnly) {
    try {
      const { emit } = await import("@/lib/telemetry");
      emit("history.tier", { tier: "journal-only" });
    } catch {
      // telemetry optional
    }
  }
  return NextResponse.json({ ok: true, config: next });
}
