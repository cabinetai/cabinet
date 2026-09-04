import { NextRequest, NextResponse } from "next/server";
import { readCabinetOverview } from "@/lib/cabinets/overview";
import { parseCabinetVisibilityMode } from "@/lib/cabinets/visibility";
import { staleProcessResponse } from "@/lib/api/stale-process-response";

export async function GET(request: NextRequest) {
  const cabinetPath = request.nextUrl.searchParams.get("path");
  const visibilityMode = parseCabinetVisibilityMode(
    request.nextUrl.searchParams.get("visibility")
  );

  if (!cabinetPath) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  try {
    const overview = await readCabinetOverview(cabinetPath, { visibilityMode });
    return NextResponse.json(overview);
  } catch (error) {
    const stale = staleProcessResponse(error);
    if (stale) return stale;
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
