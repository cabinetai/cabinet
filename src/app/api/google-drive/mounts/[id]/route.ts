import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const result = db.prepare("DELETE FROM google_drive_mounts WHERE id = ?").run(id);
    if (result.changes === 0) {
      return NextResponse.json({ error: "Mount not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
