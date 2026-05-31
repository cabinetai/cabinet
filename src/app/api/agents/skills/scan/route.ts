import { NextResponse } from "next/server";
import { scanForSkills } from "@/lib/agents/skills/scan";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const cabinetPath = url.searchParams.get("cabinet") || undefined;
  const results = await scanForSkills({ cabinetPath });
  return NextResponse.json({ count: results.length, results });
}
