import { NextRequest, NextResponse } from "next/server";
import { searchEmails } from "@/lib/gmail/imap-client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from") ?? undefined;
    const subject = searchParams.get("subject") ?? undefined;
    const sinceStr = searchParams.get("since");
    const beforeStr = searchParams.get("before");
    const unseenStr = searchParams.get("unseen");

    const criteria = {
      from,
      subject,
      since: sinceStr ? new Date(sinceStr) : undefined,
      before: beforeStr ? new Date(beforeStr) : undefined,
      unseen: unseenStr === "true" ? true : undefined,
    };

    const results = await searchEmails(criteria);
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
