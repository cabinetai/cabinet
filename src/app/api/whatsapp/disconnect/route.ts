import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { removeCabinetEnv } from "@/lib/runtime/cabinet-env";
import { DATA_DIR } from "@/lib/storage/path-utils";

/**
 * Turns the WhatsApp gateway off (removes WHATSAPP_ACCOUNTS /
 * WHATSAPP_PAIRING_PHONE from .cabinet.env, which the daemon's file watch
 * picks up) and clears the account's saved session so a future "Connect"
 * starts a fresh pairing instead of reusing a logged-out one.
 */
const STORE_DIR = path.join(DATA_DIR, ".agents", ".whatsapp", "store");

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { accountId } = (body ?? {}) as { accountId?: unknown };
  const id = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "personal";

  removeCabinetEnv("WHATSAPP_ACCOUNTS");
  removeCabinetEnv("WHATSAPP_PAIRING_PHONE");

  for (const p of [
    path.join(STORE_DIR, id),
    path.join(STORE_DIR, `status-${id}.json`),
    path.join(STORE_DIR, `qr-${id}.txt`),
  ]) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({ ok: true });
}
