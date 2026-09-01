import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { DATA_DIR } from "@/lib/storage/path-utils";

/**
 * Reads the status file the daemon's AccountConnection mirrors on every
 * connection.update (docs/WHATSAPP_CONNECTOR.md) — backs the WhatsApp
 * connector card's pairing/connected state polling.
 */

const STORE_DIR = path.join(DATA_DIR, ".agents", ".whatsapp", "store");

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accountId = new URL(request.url).searchParams.get("accountId") || "personal";
  const statusPath = path.join(STORE_DIR, `status-${accountId}.json`);
  try {
    const raw = fs.readFileSync(statusPath, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ status: "not_started" });
  }
}
