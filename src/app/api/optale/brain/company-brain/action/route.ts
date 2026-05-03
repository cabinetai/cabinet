import { NextRequest, NextResponse } from "next/server";
import { submitOptaleCompanyBrainAction } from "@/lib/optale/brain-company-brain-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const response = await submitOptaleCompanyBrainAction({
    cabinetPath:
      trimString(body?.cabinetPath) ||
      trimString(request.nextUrl.searchParams.get("cabinetPath")) ||
      trimString(request.nextUrl.searchParams.get("path")),
    targetId: trimString(body?.targetId),
    promotionId: trimString(body?.promotionId),
    action: trimString(body?.action),
    reviewerNotes: trimString(body?.reviewerNotes) || trimString(body?.notes),
    force: body?.force === true,
    dryRun: body?.dryRun === true,
    requestHeaders: request.headers,
  });

  return NextResponse.json(response, {
    status: response.httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
