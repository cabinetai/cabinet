import { NextResponse } from "next/server";
import { getPublicCommandBrainBridgeStatus } from "@/lib/optale/command-brain-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  return NextResponse.json(getPublicCommandBrainBridgeStatus(), { headers: HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...HEADERS,
      Allow: "GET, OPTIONS",
    },
  });
}
