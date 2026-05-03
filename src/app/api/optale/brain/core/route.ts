import { NextRequest, NextResponse } from "next/server";
import { readOptaleBrainCoreStatus } from "@/lib/optale/brain-core";
import { redactBrainCoreStatusForClient } from "@/lib/optale/brain-contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requestId(request: NextRequest): string | undefined {
  return trimString(request.headers.get("x-request-id"));
}

export async function GET(request: NextRequest) {
  const cabinetPath =
    trimString(request.nextUrl.searchParams.get("cabinetPath")) ||
    trimString(request.nextUrl.searchParams.get("path"));
  const status = await readOptaleBrainCoreStatus({
    cabinetPath,
    requestId: requestId(request),
  });

  return NextResponse.json(redactBrainCoreStatusForClient(status), {
    headers: { "Cache-Control": "no-store" },
  });
}
