import { NextResponse, type NextRequest } from "next/server";
import { invalidateKillSwitchCache, readState, updateState } from "@/lib/telemetry";

export async function GET(): Promise<NextResponse> {
  const state = readState();
  return NextResponse.json({
    enabled: state.enabled,
    envDisabled: process.env.CABINET_TELEMETRY_DISABLED === "1",
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const enabled = (body as { enabled?: unknown } | null)?.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
  }

  const next = updateState({ enabled });
  invalidateKillSwitchCache();
  return NextResponse.json({ enabled: next.enabled });
}
