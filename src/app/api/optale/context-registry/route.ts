import { NextRequest, NextResponse } from "next/server";
import { readPublicOptaleContextRegistry } from "@/lib/optale/context-registry";
import { requireOptaleControlPlaneRequest } from "@/lib/optale/control-plane-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = await requireOptaleControlPlaneRequest(request);
  if (unauthorized) return unauthorized;

  return NextResponse.json(readPublicOptaleContextRegistry(), {
    headers: { "Cache-Control": "no-store" },
  });
}
