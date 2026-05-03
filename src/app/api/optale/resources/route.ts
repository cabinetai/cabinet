import { NextRequest, NextResponse } from "next/server";
import { parseCabinetVisibilityMode } from "@/lib/cabinets/visibility";
import { requireOptaleControlPlaneRequest } from "@/lib/optale/control-plane-auth";
import { readOptaleResourceRegistry } from "@/lib/optale/resource-registry";

export const dynamic = "force-dynamic";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireOptaleControlPlaneRequest(request);
  if (unauthorized) return unauthorized;

  const limit = Number.parseInt(
    request.nextUrl.searchParams.get("limit") || "250",
    10,
  );
  const registry = await readOptaleResourceRegistry({
    cabinetPath:
      trimString(request.nextUrl.searchParams.get("cabinetPath")) ||
      trimString(request.nextUrl.searchParams.get("path")),
    visibilityMode: parseCabinetVisibilityMode(
      request.nextUrl.searchParams.get("visibilityMode") ||
        request.nextUrl.searchParams.get("visibility"),
    ),
    limit: Number.isFinite(limit) ? limit : 250,
  });

  return NextResponse.json(registry, {
    headers: { "Cache-Control": "no-store" },
  });
}
