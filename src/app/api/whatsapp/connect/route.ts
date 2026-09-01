import { NextRequest, NextResponse } from "next/server";
import { upsertCabinetEnv } from "@/lib/runtime/cabinet-env";

/**
 * Starts pairing for the WhatsApp connector (docs/WHATSAPP_CONNECTOR.md):
 * writes WHATSAPP_ACCOUNTS + WHATSAPP_PAIRING_PHONE to .cabinet.env. The
 * daemon's file watch picks this up and requests a Baileys pairing code;
 * poll GET /api/whatsapp/status for the result.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { accountId, phone } = (body ?? {}) as { accountId?: unknown; phone?: unknown };
  const id = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "personal";
  if (typeof phone !== "string" || !/^[0-9]{8,15}$/.test(phone)) {
    return NextResponse.json(
      { error: "Phone number must be digits only, with country code (no +)." },
      { status: 400 },
    );
  }
  try {
    upsertCabinetEnv("WHATSAPP_ACCOUNTS", id);
    upsertCabinetEnv("WHATSAPP_PAIRING_PHONE", phone);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
