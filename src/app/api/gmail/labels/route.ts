import { NextRequest, NextResponse } from "next/server";
import { listLabels, createLabel } from "@/lib/gmail/imap-client";

export async function GET() {
  try {
    const labels = await listLabels();
    return NextResponse.json({ labels });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const label = await createLabel(body?.name);
    return NextResponse.json({ ok: true, label });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
