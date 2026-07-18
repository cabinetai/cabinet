import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { encryptPassword } from "@/lib/gmail/crypto";
import { accountKey, validateCredentials } from "@/lib/gmail/imap-client";
import { installGmailSkill } from "@/lib/gmail/skill";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    // Google displays App Passwords as "xxxx xxxx xxxx xxxx" — strip the spaces.
    const email = body.email?.trim();
    const password = body.password?.replace(/\s+/g, "");

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }

    // Validate by actually connecting to IMAP
    try {
      await validateCredentials(email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : "IMAP connection failed";
      return NextResponse.json(
        { error: `Could not connect to Gmail: ${message}` },
        { status: 400 }
      );
    }

    // Rows are keyed by lowercased email — each connect adds (or refreshes)
    // one account; other connected accounts are untouched.
    const id = accountKey(email);
    const encrypted = encryptPassword(password);
    const db = getDb();
    db.prepare(
      `INSERT INTO gmail_credentials (id, method, email, imap_password)
       VALUES (?, 'imap', ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, imap_password = excluded.imap_password, method = 'imap'`
    ).run(id, email, encrypted);

    // Install the Gmail skill so agents can use email tools immediately. If
    // this fails, roll back the just-stored credentials so the persisted state
    // stays consistent with the error response (otherwise status would report
    // connected despite this call returning 500).
    try {
      await installGmailSkill();
    } catch (err) {
      db.prepare("DELETE FROM gmail_credentials WHERE id = ?").run(id);
      throw err;
    }

    return NextResponse.json({ ok: true, email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
