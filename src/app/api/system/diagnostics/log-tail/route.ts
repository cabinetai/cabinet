import { NextRequest, NextResponse } from "next/server";
import { getLogTail, type LogProcess } from "@/lib/log/logger";
import { redactSecrets } from "@/lib/log/redact";

export const dynamic = "force-dynamic";

const PROCS: LogProcess[] = ["next", "daemon", "electron", "renderer"];
const MAX_TAIL_BYTES = 1024 * 1024; // 1 MB hard cap (PRD §3.5)

/**
 * Redacted recent-log tail. Powers both the "Attach recent logs" preview
 * and the actual feedback attachment, so what the user previews is exactly
 * what gets sent.
 */
export async function GET(req: NextRequest) {
  const lines = Math.min(
    2000,
    Math.max(50, Number(req.nextUrl.searchParams.get("lines")) || 500)
  );
  const sections: string[] = [];
  for (const proc of PROCS) {
    const tail = getLogTail(proc, lines);
    if (tail) sections.push(`===== ${proc}.log (last ${lines} lines) =====\n${tail}`);
  }
  let text = redactSecrets(sections.join("\n\n"));
  if (Buffer.byteLength(text, "utf-8") > MAX_TAIL_BYTES) {
    text = text.slice(-MAX_TAIL_BYTES);
  }
  return NextResponse.json({ ok: true, tail: text });
}
