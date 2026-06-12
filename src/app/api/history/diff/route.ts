import { NextRequest, NextResponse } from "next/server";
import path from "path";
import simpleGit from "simple-git";
import fs from "fs";
import { DATA_DIR } from "@/lib/storage/path-utils";

export const dynamic = "force-dynamic";

/**
 * File-scoped diff for one commit (the timeline's vimdiff-style view).
 * Unlike /api/git/diff/<hash> (whole commit), this limits the patch to the
 * file the user is looking at.
 */
export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash") ?? "";
  const virtualPath = (req.nextUrl.searchParams.get("path") ?? "").replace(/^\/+|\/+$/g, "");
  if (!/^[0-9a-f]{6,40}$/i.test(hash) || !virtualPath || virtualPath.includes("..")) {
    return NextResponse.json(
      { ok: false, error: "hash and path are required" },
      { status: 400 }
    );
  }

  if (!fs.existsSync(path.join(DATA_DIR, ".git"))) {
    return NextResponse.json({ ok: true, diff: "" });
  }
  const git = simpleGit(DATA_DIR);
  const candidates = [
    path.join(virtualPath, "index.md"),
    `${virtualPath}.md`,
    virtualPath,
  ];

  let diff = "";
  try {
    diff = await git.diff([`${hash}~1`, hash, "--", ...candidates]);
  } catch {
    try {
      // First commit in the repo has no parent — show the whole snapshot.
      diff = await git.raw([
        "show",
        "--format=",
        hash,
        "--",
        ...candidates,
      ]);
    } catch {
      diff = "";
    }
  }
  if (!diff.trim()) {
    // Pathspec may not match what the commit touched (renames) — fall back
    // to the whole-commit patch rather than showing nothing.
    try {
      diff = await git.raw(["show", "--format=", hash]);
    } catch {
      diff = "";
    }
  }
  return NextResponse.json({ ok: true, diff });
}
