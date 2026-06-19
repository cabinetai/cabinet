import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { uninstallGmailSkill } from "@/lib/gmail/skill";

export async function DELETE() {
  try {
    const db = getDb();
    db.prepare("DELETE FROM gmail_credentials WHERE id = 'default'").run();
    await uninstallGmailSkill();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
