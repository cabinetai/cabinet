import { NextRequest, NextResponse } from "next/server";
import { restoreFileFromCommit } from "@/lib/git/git-service";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { hash, pagePath } = await req.json();
    if (!hash || !pagePath) {
      return NextResponse.json(
        { error: "hash and pagePath are required" },
        { status: 400 }
      );
    }

    // Directory index.md, standalone .md, or the exact file (non-markdown
    // viewers — CSV, source, assets — restore too).
    const candidates = [
      path.join(pagePath, "index.md"),
      `${pagePath}.md`,
      pagePath,
    ];

    let restored = false;
    for (const candidate of candidates) {
      restored = await restoreFileFromCommit(hash, candidate);
      if (restored) break;
    }

    if (!restored) {
      return NextResponse.json(
        { error: "Failed to restore. The file may not exist at that commit" },
        { status: 404 }
      );
    }

    try {
      const { emit } = await import("@/lib/telemetry");
      emit("history.restored", { source: "panel" });
    } catch {
      // telemetry optional
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
