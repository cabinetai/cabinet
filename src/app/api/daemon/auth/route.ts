import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateDaemonToken } from "@/lib/agents/daemon-auth";
import { getPublicDaemonWsOriginForRequest } from "@/lib/runtime/runtime-config";

export async function GET(request: NextRequest) {
  const token = await getOrCreateDaemonToken();
  return NextResponse.json({
    token,
    wsOrigin: getPublicDaemonWsOriginForRequest(request),
  });
}
