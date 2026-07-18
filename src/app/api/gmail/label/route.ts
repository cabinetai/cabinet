import { NextRequest, NextResponse } from "next/server";
import { applyLabel } from "@/lib/gmail/imap-client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const label = await applyLabel(body?.messageId, body?.label, body?.account);
    return NextResponse.json({ ok: true, label });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
