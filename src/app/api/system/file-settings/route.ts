import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { resolveContentPath } from "@/lib/storage/path-utils";
import { fileExists } from "@/lib/storage/fs-operations";
import { readPage, writePage } from "@/lib/storage/page-io";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";
import { autoCommit } from "@/lib/git/git-service";
import type { GoogleFrontmatter } from "@/types";

export const dynamic = "force-dynamic";

interface FileSettingsRequest {
  path?: string;
  op?: "google" | "appMode";
  // google
  kind?: GoogleFrontmatter["kind"];
  url?: string;
  // appMode
  app?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as FileSettingsRequest;
    const virtualPath = body.path?.trim().replace(/^\/+|\/+$/g, "");
    if (!virtualPath) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    // ── Google embed settings: rewrite the page's google: frontmatter ──────
    if (body.op === "google") {
      const page = await readPage(virtualPath);
      const google: GoogleFrontmatter = {
        ...(body.kind ? { kind: body.kind } : {}),
        url: (body.url || "").trim(),
        ...(page.frontmatter.google?.embedUrl
          ? { embedUrl: page.frontmatter.google.embedUrl }
          : {}),
      };
      await writePage(virtualPath, page.content, {
        ...page.frontmatter,
        google,
      });
      invalidateTreeCache();
      autoCommit(virtualPath, "Update");
      return NextResponse.json({ ok: true });
    }

    // ── Web-app mode: toggle the `.app` full-screen marker ─────────────────
    if (body.op === "appMode") {
      const dir = resolveContentPath(virtualPath);
      const stat = await fs.stat(dir).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        return NextResponse.json(
          { error: "This item is not an app/website folder." },
          { status: 400 }
        );
      }
      if (!(await fileExists(path.join(dir, "index.html")))) {
        return NextResponse.json(
          { error: "Folder has no index.html, so it is not a web app." },
          { status: 400 }
        );
      }
      const marker = path.join(dir, ".app");
      if (body.app) {
        if (!(await fileExists(marker))) await fs.writeFile(marker, "");
      } else {
        await fs.unlink(marker).catch(() => {});
      }
      invalidateTreeCache();
      autoCommit(virtualPath, "Update");
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
