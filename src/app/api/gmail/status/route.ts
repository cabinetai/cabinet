import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT email, method FROM gmail_credentials WHERE id = 'default'")
      .get() as { email: string; method: string } | undefined;

    if (!row) {
      return NextResponse.json({ connected: false, email: null, method: null, lastIndexed: null });
    }

    // Get last indexed time from gmail_index
    const indexed = db
      .prepare("SELECT MAX(indexed_at) as last FROM gmail_index")
      .get() as { last: string | null } | undefined;

    return NextResponse.json({
      connected: true,
      email: row.email,
      method: row.method as "imap",
      lastIndexed: indexed?.last ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
