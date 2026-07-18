import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { accountKey, searchEmails } from "@/lib/gmail/imap-client";

const DEFAULT_DAYS = 7;

export async function POST(request: NextRequest) {
  try {
    const db = getDb();

    let days = DEFAULT_DAYS;
    let account: string | undefined;
    try {
      const body = await request.json() as { days?: number; account?: string };
      if (typeof body.days === "number" && body.days > 0) days = body.days;
      if (typeof body.account === "string" && body.account.trim()) account = body.account;
    } catch {
      // no body or invalid JSON — use defaults
    }

    const row = (account
      ? db.prepare("SELECT id FROM gmail_credentials WHERE id = ?").get(accountKey(account))
      : db.prepare("SELECT id FROM gmail_credentials ORDER BY rowid LIMIT 1").get()) as
      | { id: string }
      | undefined;
    if (!row) {
      return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const emails = await searchEmails({ since }, row.id);

    const insert = db.prepare(
      `INSERT INTO gmail_index (message_id, thread_id, subject, sender, date, snippet, body_text, labels, account, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(message_id) DO UPDATE SET
         subject = excluded.subject,
         sender = excluded.sender,
         date = excluded.date,
         snippet = excluded.snippet,
         body_text = excluded.body_text,
         account = excluded.account,
         indexed_at = excluded.indexed_at`
    );

    const insertMany = db.transaction((items: typeof emails) => {
      for (const email of items) {
        insert.run(
          email.messageId,
          email.threadId,
          email.subject,
          email.sender,
          email.date,
          email.snippet,
          email.snippet, // body_text — snippet is the best we have from search
          "[]",
          row.id
        );
      }
    });

    insertMany(emails);

    return NextResponse.json({ indexed: emails.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
