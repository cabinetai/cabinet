import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "@/lib/storage/path-utils";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const event = typeof body?.event === "string" ? body.event.trim() : "";
    if (!event) {
      return NextResponse.json({ error: "Missing event" }, { status: 400 });
    }
    const metaDir = path.join(DATA_DIR, ".cabinet-meta");
    await fs.mkdir(metaDir, { recursive: true });
    const logPath = path.join(metaDir, "audit.log");
    const line = `${new Date().toISOString()} — ${event.replace(/\n/g, " ")}\n`;
    await fs.appendFile(logPath, line, "utf-8");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
