import { NextRequest, NextResponse } from "next/server";
import { readOptaleCompanyBrainAddon } from "@/lib/optale/brain-company-brain-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function GET(request: NextRequest) {
  const response = await readOptaleCompanyBrainAddon({
    cabinetPath:
      trimString(request.nextUrl.searchParams.get("cabinetPath")) ||
      trimString(request.nextUrl.searchParams.get("path")),
    targetId: trimString(request.nextUrl.searchParams.get("targetId")),
    status: trimString(request.nextUrl.searchParams.get("status")),
    requestHeaders: request.headers,
  });

  return NextResponse.json(response, {
    status: response.httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
