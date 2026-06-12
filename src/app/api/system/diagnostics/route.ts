import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  LOGS_DIR,
  getLogLevel,
  setLogLevel,
  readCrashMarker,
  clearCrashMarker,
  listLogFiles,
} from "@/lib/log/logger";
import { DATA_DIR } from "@/lib/storage/path-utils";

export const dynamic = "force-dynamic";

function dirSize(dir: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) total += dirSize(p);
        else total += fs.statSync(p).size;
      } catch {
        // unreadable entry
      }
    }
  } catch {
    // missing dir
  }
  return total;
}

/** Diagnostics status: level, crash marker, disk usage of observability state. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    logLevel: getLogLevel(),
    crashMarker: readCrashMarker(),
    files: listLogFiles().map((f) => {
      try {
        return { name: path.basename(f), bytes: fs.statSync(f).size };
      } catch {
        return { name: path.basename(f), bytes: 0 };
      }
    }),
    sizes: {
      logsBytes: dirSize(LOGS_DIR),
      gitBytes: dirSize(path.join(DATA_DIR, ".git")),
    },
  });
}

/** PATCH { level } — verbose-logging toggle for the Next process + config. */
export async function PATCH(req: NextRequest) {
  let body: { level?: string };
  try {
    body = (await req.json()) as { level?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const level = body.level;
  if (level !== "debug" && level !== "info" && level !== "warn" && level !== "error") {
    return NextResponse.json(
      { ok: false, error: "level must be debug|info|warn|error" },
      { status: 400 }
    );
  }
  setLogLevel(level);
  return NextResponse.json({ ok: true, logLevel: level });
}

/** DELETE — clear the crash-on-last-launch marker (user dismissed the prompt). */
export async function DELETE() {
  clearCrashMarker();
  return NextResponse.json({ ok: true });
}
