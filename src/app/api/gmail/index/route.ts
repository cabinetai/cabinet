import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { searchEmails } from "@/lib/gmail/imap-client";

const DEFAULT_DAYS = 7;

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT email FROM gmail_credentials WHERE id = 'default'")
      .get() as { email: string } | undefined;
    if (!row) {
      return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
    }

    let days = DEFAULT_DAYS;
    try {
      const body = await request.json() as { days?: number };
      if (typeof body.days === "number" && body.days > 0) days = body.days;
    } catch {
      // no body or invalid JSON — use default
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const emails = await searchEmails({ since });

    const insert = db.prepare(
      `INSERT INTO gmail_index (message_id, thread_id, subject, sender, date, snippet, body_text, labels, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(message_id) DO UPDATE SET
         subject = excluded.subject,
         sender = excluded.sender,
         date = excluded.date,
         snippet = excluded.snippet,
         body_text = excluded.body_text,
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
          "[]"
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
