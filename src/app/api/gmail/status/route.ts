import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decryptPassword } from "@/lib/gmail/crypto";

export async function GET() {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT email, method, imap_password FROM gmail_credentials WHERE id = 'default'")
      .get() as { email: string; method: string; imap_password: string } | undefined;

    if (!row) {
      return NextResponse.json({ connected: false, email: null, method: null, lastIndexed: null });
    }

    // A row alone doesn't mean the connection works: if the encryption secret
    // changed since the password was saved, every real Gmail call 500s while
    // this endpoint claims "connected". Verify decryptability so the UI can
    // show a reconnect prompt instead.
    let needsReconnect = false;
    try {
      decryptPassword(row.imap_password);
    } catch {
      needsReconnect = true;
    }

    // Get last indexed time from gmail_index
    const indexed = db
      .prepare("SELECT MAX(indexed_at) as last FROM gmail_index")
      .get() as { last: string | null } | undefined;

    return NextResponse.json({
      connected: !needsReconnect,
      needsReconnect,
      email: row.email,
      method: row.method as "imap",
      lastIndexed: indexed?.last ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
