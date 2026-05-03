import { NextRequest, NextResponse } from "next/server";
import { submitOptaleBrainDreamProposalAction } from "@/lib/optale/brain-dreams-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const response = await submitOptaleBrainDreamProposalAction({
    cabinetPath:
      trimString(body?.cabinetPath) ||
      trimString(request.nextUrl.searchParams.get("cabinetPath")) ||
      trimString(request.nextUrl.searchParams.get("path")),
    proposalPath: trimString(body?.proposalPath),
    action: trimString(body?.action),
  });

  return NextResponse.json(response, {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  });
}
