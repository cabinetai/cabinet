import { NextRequest, NextResponse } from "next/server";
import {
  readHistoryEvents,
  cabinetRootForVirtualPath,
} from "@/lib/history/engine";

export const dynamic = "force-dynamic";

/**
 * Per-room activity feed (PRD §4.5): reverse-chron journal events, file
 * mutations only. `cabinetPath` selects the room ("" = root cabinet);
 * when only `path` is given, the room is derived from it (per-file view).
 */
export async function GET(req: NextRequest) {
  const filterPath = req.nextUrl.searchParams.get("path") ?? undefined;
  const cabinetPathParam = req.nextUrl.searchParams.get("cabinetPath");
  const cabinetPath =
    cabinetPathParam ??
    (filterPath ? cabinetRootForVirtualPath(filterPath) : "");
  const limit = Math.min(
    500,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 100)
  );
  const events = readHistoryEvents(
    cabinetPath,
    limit,
    filterPath ? { path: filterPath } : undefined
  );
  return NextResponse.json({ ok: true, events, cabinetPath });
}
