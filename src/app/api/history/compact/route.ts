import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import simpleGit from "simple-git";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { discoverCabinetPaths } from "@/lib/cabinets/discovery";

export const dynamic = "force-dynamic";

const JOURNAL_TRIM_BYTES = 1024 * 1024; // compact journals down to ~1 MB

/** Settings "compact now" (PRD §4.7): git gc + journal trims, best-effort. */
export async function POST() {
  const results: Record<string, string> = {};

  try {
    if (fs.existsSync(path.join(DATA_DIR, ".git"))) {
      await simpleGit(DATA_DIR).raw(["gc", "--auto"]);
      results.gc = "ok";
    }
  } catch (err) {
    results.gc = err instanceof Error ? err.message : "failed";
  }

  try {
    const cabinets = await discoverCabinetPaths();
    let trimmed = 0;
    for (const cabinetPath of cabinets) {
      const file = path.join(
        DATA_DIR,
        cabinetPath === "." ? "" : cabinetPath,
        ".cabinet-state",
        "file-history.jsonl"
      );
      try {
        const stat = fs.statSync(file);
        if (stat.size <= JOURNAL_TRIM_BYTES) continue;
        const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
        fs.writeFileSync(
          file,
          lines.slice(Math.floor(lines.length / 2)).join("\n") + "\n"
        );
        trimmed++;
      } catch {
        // no journal in this room
      }
    }
    results.journals = `trimmed ${trimmed}`;
  } catch (err) {
    results.journals = err instanceof Error ? err.message : "failed";
  }

  return NextResponse.json({ ok: true, results });
}
