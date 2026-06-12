import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getPageHistory } from "@/lib/git/git-service";
import {
  readHistoryEvents,
  cabinetRootForVirtualPath,
} from "@/lib/history/engine";
import { DATA_DIR } from "@/lib/storage/path-utils";

export const dynamic = "force-dynamic";

/**
 * Everything known about one file's history, for the shared timeline UI:
 * git commits (attributed), journal events, and OS-level stat — so the
 * timeline is never empty even for files that predate history capture.
 */

function resolveExisting(virtualPath: string): string | null {
  // Same candidate order as getPageHistory: dir page, standalone .md, raw file.
  const candidates = [
    path.join(virtualPath, "index.md"),
    `${virtualPath}.md`,
    virtualPath,
  ];
  for (const candidate of candidates) {
    const abs = path.join(DATA_DIR, candidate);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
    } catch {
      // keep trying
    }
  }
  // Directory page without index.md (folders, embedded apps)
  const absDir = path.join(DATA_DIR, virtualPath);
  try {
    if (fs.existsSync(absDir)) return absDir;
  } catch {
    // gone
  }
  return null;
}

export async function GET(req: NextRequest) {
  const virtualPath = (req.nextUrl.searchParams.get("path") ?? "").replace(/^\/+|\/+$/g, "");
  if (!virtualPath || virtualPath.includes("..")) {
    return NextResponse.json({ ok: false, error: "path is required" }, { status: 400 });
  }

  const commits = await getPageHistory(virtualPath);
  const cabinetPath = cabinetRootForVirtualPath(virtualPath);
  const events = readHistoryEvents(cabinetPath, 50, { path: virtualPath });

  let stat: { createdAt: string; modifiedAt: string; sizeBytes: number } | null = null;
  const abs = resolveExisting(virtualPath);
  if (abs) {
    try {
      const s = fs.statSync(abs);
      stat = {
        createdAt: s.birthtime.toISOString(),
        modifiedAt: s.mtime.toISOString(),
        sizeBytes: s.size,
      };
    } catch {
      // stat unavailable — timeline falls back to commits/events only
    }
  }

  return NextResponse.json({ ok: true, commits, events, stat });
}
