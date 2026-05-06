import { type NextRequest, NextResponse } from "next/server";
import { requireOptaleSettingsRequest } from "@/lib/optale/console-admin-auth";
import { buildOptaleConsolePermissionsPayload } from "@/lib/optale/console-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireOptaleSettingsRequest(request);
  if (!auth.ok) return auth.response;

  return NextResponse.json(buildOptaleConsolePermissionsPayload(), {
    headers: { "Cache-Control": "no-store" },
  });
}
