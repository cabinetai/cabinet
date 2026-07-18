import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { accountKey } from "@/lib/gmail/imap-client";
import { uninstallGmailSkill } from "@/lib/gmail/skill";

export async function DELETE(request: NextRequest) {
  try {
    const db = getDb();
    const account = request.nextUrl.searchParams.get("account");
    if (account) {
      db.prepare("DELETE FROM gmail_credentials WHERE id = ?").run(accountKey(account));
    } else {
      // No account given = disconnect Gmail entirely (pre-multi-account behavior).
      db.prepare("DELETE FROM gmail_credentials").run();
    }
    // Keep the skill installed while any account remains connected.
    const remaining = db
      .prepare("SELECT COUNT(*) as n FROM gmail_credentials")
      .get() as { n: number };
    if (remaining.n === 0) {
      await uninstallGmailSkill();
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
