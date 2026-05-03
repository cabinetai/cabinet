import { NextRequest, NextResponse } from "next/server";
import { readOptaleBrainSummary } from "@/lib/optale/brain-summary";

export const dynamic = "force-dynamic";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function GET(request: NextRequest) {
  const cabinetPath =
    trimString(request.nextUrl.searchParams.get("cabinetPath")) ||
    trimString(request.nextUrl.searchParams.get("path"));
  const summary = await readOptaleBrainSummary(cabinetPath);

  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
