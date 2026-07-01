import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "@/lib/storage/path-utils";

export const dynamic = "force-dynamic";

/**
 * Local-first "I want this integration" ingestion. Fired when a user clicks a
 * coming-soon ("Soon") connector in the Integrations Hub, or types a name into
 * the "Don't see your integration?" box.
 *
 * Always writes to <DATA_DIR>/.cabinet-meta/integration-requests.jsonl so the
 * user (and a local operator) keeps a durable copy. The client ALSO best-effort
 * forwards to the cabinet-backend so it shows up for the team; that forward is
 * independent, so a network failure there still leaves this local row intact.
 * Mirrors the feedback route (src/app/api/system/feedback/route.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const integrationName =
      typeof body?.integrationName === "string" ? body.integrationName.trim().slice(0, 200) : "";
    if (!integrationName) {
      return NextResponse.json({ error: "integrationName is required" }, { status: 400 });
    }

    const source = body?.source === "request-box" ? "request-box" : "soon-tile";

    const row = {
      ts: new Date().toISOString(),
      kind: "integration-request" as const,
      integrationId:
        typeof body?.integrationId === "string" ? body.integrationId.slice(0, 100) : null,
      integrationName,
      category: typeof body?.category === "string" ? body.category.slice(0, 50) : null,
      source,
      appVersion: typeof body?.appVersion === "string" ? body.appVersion : null,
      platform: typeof body?.platform === "string" ? body.platform : null,
    };

    const metaDir = path.join(DATA_DIR, ".cabinet-meta");
    await fs.mkdir(metaDir, { recursive: true });
    await fs.appendFile(
      path.join(metaDir, "integration-requests.jsonl"),
      JSON.stringify(row) + "\n",
      "utf-8",
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
