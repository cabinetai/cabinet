import { NextRequest, NextResponse } from "next/server";
import {
  executeOptaleCommandCenterAction,
  OptaleCommandCenterError,
  readOptaleCommandCenterSnapshot,
} from "@/lib/optale/command-center-control";
import { parseCabinetVisibilityMode } from "@/lib/cabinets/visibility";
import { requireOptaleControlPlaneRequest } from "@/lib/optale/control-plane-auth";

export const dynamic = "force-dynamic";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireOptaleControlPlaneRequest(request);
  if (unauthorized) return unauthorized;

  const limit = Number.parseInt(
    request.nextUrl.searchParams.get("limit") || "100",
    10,
  );
  const snapshot = await readOptaleCommandCenterSnapshot({
    cabinetPath:
      trimString(request.nextUrl.searchParams.get("cabinetPath")) ||
      trimString(request.nextUrl.searchParams.get("path")),
    visibilityMode: parseCabinetVisibilityMode(
      request.nextUrl.searchParams.get("visibilityMode") ||
        request.nextUrl.searchParams.get("visibility"),
    ),
    limit: Number.isFinite(limit) ? limit : 100,
  });

  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireOptaleControlPlaneRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await executeOptaleCommandCenterAction(
      await request.json().catch(() => null),
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status =
      error instanceof OptaleCommandCenterError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status });
  }
}
