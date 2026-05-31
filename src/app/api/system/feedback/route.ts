import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "@/lib/storage/path-utils";

export const dynamic = "force-dynamic";

/**
 * Local-first feedback ingestion. Always writes to
 * <DATA_DIR>/.cabinet-meta/feedback.jsonl so the user has their own copy.
 * The backend POST is best-effort and runs from the client; if it fails
 * (network down, endpoint missing, etc.), the local row is still durable.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rating = Number(body?.rating);
    const promptedAt = Number(body?.promptedAt);
    const q1 = typeof body?.q1 === "string" ? body.q1.trim() : "";
    const q2 = typeof body?.q2 === "string" ? body.q2.trim() : "";

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "rating must be 1..5" }, { status: 400 });
    }
    if (![2, 6].includes(promptedAt)) {
      return NextResponse.json({ error: "promptedAt must be 2 or 6" }, { status: 400 });
    }

    const row = {
      ts: new Date().toISOString(),
      rating,
      q1,
      q2,
      promptedAt,
      appVersion: typeof body?.appVersion === "string" ? body.appVersion : null,
      platform: typeof body?.platform === "string" ? body.platform : null,
      launchCount: Number.isInteger(body?.launchCount) ? body.launchCount : null,
    };

    const metaDir = path.join(DATA_DIR, ".cabinet-meta");
    await fs.mkdir(metaDir, { recursive: true });
    const target = path.join(metaDir, "feedback.jsonl");
    await fs.appendFile(target, JSON.stringify(row) + "\n", "utf-8");

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
