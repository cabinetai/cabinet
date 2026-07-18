import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decryptPassword } from "@/lib/gmail/crypto";

export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT id, email, method, imap_password FROM gmail_credentials ORDER BY rowid")
      .all() as { id: string; email: string; method: string; imap_password: string }[];

    if (rows.length === 0) {
      return NextResponse.json({
        connected: false,
        email: null,
        method: null,
        lastIndexed: null,
        accounts: [],
      });
    }

    // A row alone doesn't mean the connection works: if the encryption secret
    // changed since a password was saved, every real Gmail call 500s. Verify
    // decryptability per account so the UI can show a reconnect prompt.
    const lastIndexedStmt = db.prepare(
      "SELECT MAX(indexed_at) as last FROM gmail_index WHERE account = ? OR account = ''",
    );
    const accounts = rows.map((row) => {
      let needsReconnect = false;
      try {
        decryptPassword(row.imap_password);
      } catch {
        needsReconnect = true;
      }
      const indexed = lastIndexedStmt.get(row.id) as { last: string | null } | undefined;
      return { email: row.email, needsReconnect, lastIndexed: indexed?.last ?? null };
    });

    // Top-level fields describe the first-connected (primary) account — the
    // one account-less API calls act on — so pre-multi-account consumers keep
    // reading the same shape.
    const primary = accounts[0];
    return NextResponse.json({
      connected: !primary.needsReconnect,
      needsReconnect: primary.needsReconnect,
      email: primary.email,
      method: rows[0].method as "imap",
      lastIndexed: primary.lastIndexed,
      accounts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
