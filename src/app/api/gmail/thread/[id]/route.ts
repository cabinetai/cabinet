import { NextRequest, NextResponse } from "next/server";
import { readThread } from "@/lib/gmail/imap-client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Message ID is required" }, { status: 400 });
    }

    const thread = await readThread(decodeURIComponent(id));
    return NextResponse.json(thread);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
