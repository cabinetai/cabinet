import { NextRequest, NextResponse } from "next/server";
import { undoRename } from "@/lib/storage/rename-undo";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }
    const outcome = await undoRename(token);
    if (!outcome.ok) {
      return NextResponse.json(
        { ok: false, reason: outcome.reason ?? "failed" },
        { status: 410 }
      );
    }
    invalidateTreeCache();
    return NextResponse.json(outcome);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
