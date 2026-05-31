import { NextRequest, NextResponse } from "next/server";
import {
  getCabinetEnvSnapshot,
  isValidKey,
  removeCabinetEnv,
  upsertCabinetEnv,
} from "@/lib/runtime/cabinet-env";

/**
 * `/api/agents/config/cabinet-env` — read/write API for the `.cabinet.env`
 * file at the cabinet root. Backs the Settings → Integrations → API Keys
 * UI. Never returns full values to the client; only `{key, hasValue, lastFour}`.
 */

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ entries: getCabinetEnvSnapshot() });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }
  const { key, value } = body as { key?: unknown; value?: unknown };
  if (typeof key !== "string" || !isValidKey(key)) {
    return NextResponse.json(
      {
        error:
          "Invalid env var name. Use uppercase letters, digits, and underscores; must start with a letter.",
      },
      { status: 400 },
    );
  }
  if (typeof value !== "string") {
    return NextResponse.json({ error: "Value must be a string" }, { status: 400 });
  }
  if (value.length === 0) {
    return NextResponse.json(
      { error: "Value can't be empty. Use DELETE to remove a key." },
      { status: 400 },
    );
  }
  try {
    upsertCabinetEnv(key, value);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to write key" },
      { status: 500 },
    );
  }
  return NextResponse.json({ entries: getCabinetEnvSnapshot() });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key || !isValidKey(key)) {
    return NextResponse.json({ error: "Invalid or missing key" }, { status: 400 });
  }
  try {
    removeCabinetEnv(key);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove key" },
      { status: 500 },
    );
  }
  return NextResponse.json({ entries: getCabinetEnvSnapshot() });
}
