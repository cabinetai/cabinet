import { NextRequest, NextResponse } from "next/server";
import { askOptaleBrainDreams } from "@/lib/optale/brain-dreams-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const response = await askOptaleBrainDreams({
    cabinetPath:
      trimString(body?.cabinetPath) ||
      trimString(request.nextUrl.searchParams.get("cabinetPath")) ||
      trimString(request.nextUrl.searchParams.get("path")),
    question: trimString(body?.question),
  });

  return NextResponse.json(response, {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  });
}
