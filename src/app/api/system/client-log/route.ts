import { NextRequest, NextResponse } from "next/server";
import { appendRendererEntries } from "@/lib/log/logger";

export const dynamic = "force-dynamic";

/**
 * Renderer-side log ingestion (PRD §3.3). The browser batches window.onerror /
 * unhandledrejection / console.error entries and posts them here; they land
 * in .cabinet-state/logs/renderer.log through the same rotating writer as
 * every other stream. Rate-limited so a render-loop error can't flood disk.
 */

const WINDOW_MS = 10_000;
const MAX_ENTRIES_PER_WINDOW = 120;
let windowStart = 0;
let windowCount = 0;

export async function POST(req: NextRequest) {
  let body: { entries?: unknown };
  try {
    body = (await req.json()) as { entries?: unknown };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!entries.length) return NextResponse.json({ ok: true, accepted: 0 });

  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  const room = Math.max(0, MAX_ENTRIES_PER_WINDOW - windowCount);
  const accepted = entries.slice(0, Math.min(room, 50));
  windowCount += accepted.length;

  if (accepted.length) {
    appendRendererEntries(
      accepted.filter(
        (e): e is Record<string, string> => typeof e === "object" && e !== null
      )
    );
  }
  return NextResponse.json({ ok: true, accepted: accepted.length });
}
