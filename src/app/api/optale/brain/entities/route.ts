import { NextRequest, NextResponse } from "next/server";
import { readOptaleBrainEntities } from "@/lib/optale/brain-entities-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseNumber(value: string | null): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export async function GET(request: NextRequest) {
  const response = await readOptaleBrainEntities({
    cabinetPath:
      trimString(request.nextUrl.searchParams.get("cabinetPath")) ||
      trimString(request.nextUrl.searchParams.get("path")),
    query: trimString(request.nextUrl.searchParams.get("q")),
    limit: parseNumber(request.nextUrl.searchParams.get("limit")),
    offset: parseNumber(request.nextUrl.searchParams.get("offset")),
    relationship: trimString(request.nextUrl.searchParams.get("relationship")),
    asOf: trimString(request.nextUrl.searchParams.get("as_of")),
  });

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
