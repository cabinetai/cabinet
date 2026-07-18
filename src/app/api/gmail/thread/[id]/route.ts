import { NextRequest, NextResponse } from "next/server";
import { readThread } from "@/lib/gmail/imap-client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Message ID is required" }, { status: 400 });
    }

    const account = request.nextUrl.searchParams.get("account") ?? undefined;
    const thread = await readThread(decodeURIComponent(id), account);
    return NextResponse.json(thread);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
