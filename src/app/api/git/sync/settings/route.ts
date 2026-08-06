import { NextRequest, NextResponse } from "next/server";
import {
  readCabinetEnvFile,
  upsertCabinetEnv,
} from "@/lib/runtime/cabinet-env";

const KEY = "CABINET_SYNC_ENABLED";

export const dynamic = "force-dynamic";

function isEnabled(): boolean {
  const saved = readCabinetEnvFile().values[KEY];
  const configured = saved ?? process.env[KEY];
  return configured?.trim().toLowerCase() !== "false";
}

export async function GET() {
  return NextResponse.json(
    { enabled: isEnabled() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled must be a boolean" },
      { status: 400 },
    );
  }

  try {
    upsertCabinetEnv(KEY, body.enabled ? "true" : "false");
    return NextResponse.json({ enabled: isEnabled() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 },
    );
  }
}
