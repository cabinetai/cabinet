import { type NextRequest, NextResponse } from "next/server";
import { requireOptaleSettingsRequest } from "@/lib/optale/console-admin-auth";
import { readOptaleBrainIsolationStatus } from "@/lib/optale/brain-isolation";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireOptaleSettingsRequest(request, "settings.read");
  if (!auth.ok) return auth.response;

  try {
    const payload = await readOptaleBrainIsolationStatus({
      companyCabinetPath: trimString(request.nextUrl.searchParams.get("companyCabinetPath")),
      personalCabinetPath: trimString(request.nextUrl.searchParams.get("personalCabinetPath")),
    });

    return NextResponse.json(payload, { headers: HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "OptaleBrainIsolationCheckFailed", message },
      { status: 500, headers: HEADERS },
    );
  }
}
