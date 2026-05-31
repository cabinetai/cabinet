import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import matter from "gray-matter";
import { resolveContentPath } from "@/lib/storage/path-utils";
import {
  ensureDirectory,
  fileExists,
  writeFileContent,
} from "@/lib/storage/fs-operations";
import { createPage } from "@/lib/storage/page-io";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";
import { autoCommit } from "@/lib/git/git-service";
import { slugifyPageName } from "@/lib/markdown/wiki-links";
import { blankOffice, type BlankOfficeKind } from "@/lib/storage/office-templates";

export const dynamic = "force-dynamic";

// Types that become a *page* (directory + index.md) rather than a flat file.
const PAGE_TYPES = new Set(["markdown", "gdoc", "gsheet", "gslides"]);
const GOOGLE_KIND: Record<string, "docs" | "sheets" | "slides"> = {
  gdoc: "docs",
  gsheet: "sheets",
  gslides: "slides",
};
const OFFICE_EXT: Record<string, BlankOfficeKind> = {
  docx: "docx",
  xlsx: "xlsx",
  pptx: "pptx",
};
// Starter content so a freshly created file isn't a confusing blank slate.
const TEXT_STARTERS: Record<string, string> = {
  mermaid: "graph TD\n  A[Start] --> B[End]\n",
  csv: "",
};

interface CreateFileRequest {
  parentPath?: string;
  type?: string;
  name?: string;
  ext?: string;
  googleUrl?: string;
}

function sanitizeBaseName(name: string): string {
  return name
    .trim()
    .replace(/[/\\]+/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function uniqueFilePath(
  parentResolved: string,
  base: string,
  ext: string
): Promise<{ filename: string; abs: string }> {
  let filename = `${base}${ext}`;
  let abs = path.join(parentResolved, filename);
  let counter = 1;
  while (await fileExists(abs)) {
    filename = `${base}-${counter}${ext}`;
    abs = path.join(parentResolved, filename);
    counter++;
  }
  return { filename, abs };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateFileRequest;
    const type = (body.type || "").trim();
    const parentPath = (body.parentPath || "").trim().replace(/^\/+|\/+$/g, "");
    const rawName = (body.name || "").trim();
    if (!type) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }
    if (!rawName) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // ── Page types: markdown + Google embeds ──────────────────────────────
    if (PAGE_TYPES.has(type)) {
      const slug = slugifyPageName(rawName);
      if (!slug) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      const virtualPath = parentPath ? `${parentPath}/${slug}` : slug;
      const resolved = resolveContentPath(virtualPath);
      if (await fileExists(path.join(resolved, "index.md"))) {
        return NextResponse.json(
          { error: `A page named "${slug}" already exists here.` },
          { status: 409 }
        );
      }

      if (type === "markdown") {
        await createPage(virtualPath, rawName);
      } else {
        // Google embed page: write index.md with google: frontmatter.
        const kind = GOOGLE_KIND[type];
        const url = (body.googleUrl || "").trim();
        await ensureDirectory(resolved);
        const now = new Date().toISOString();
        const fm = {
          title: rawName,
          created: now,
          modified: now,
          tags: [] as string[],
          google: { kind, ...(url ? { url } : { url: "" }) },
        };
        const content = url
          ? `\n# ${rawName}\n`
          : `\n# ${rawName}\n\n> Paste a shareable Google link in this page's settings to embed it.\n`;
        await writeFileContent(
          path.join(resolved, "index.md"),
          matter.stringify(content, fm)
        );
      }

      invalidateTreeCache();
      autoCommit(virtualPath, "Add");
      return NextResponse.json({ ok: true, path: virtualPath, isPage: true });
    }

    // ── Flat file types: code, mermaid, csv, office ───────────────────────
    const base = sanitizeBaseName(rawName.replace(/\.[^.]+$/, "")) || "untitled";
    let ext = "";
    if (type === "code") {
      ext = (body.ext || ".txt").trim();
      if (!ext.startsWith(".")) ext = `.${ext}`;
      ext = ext.toLowerCase().replace(/[^a-z0-9.]/g, "");
      if (ext === ".") ext = ".txt";
    } else if (type === "mermaid") {
      ext = ".mermaid";
    } else if (type === "csv") {
      ext = ".csv";
    } else if (OFFICE_EXT[type]) {
      ext = `.${type}`;
    } else {
      return NextResponse.json({ error: `Unknown type "${type}"` }, { status: 400 });
    }

    const parentResolved = parentPath ? resolveContentPath(parentPath) : resolveContentPath("");
    await ensureDirectory(parentResolved);
    const { filename, abs } = await uniqueFilePath(parentResolved, base, ext);

    if (OFFICE_EXT[type]) {
      const buffer = await blankOffice(OFFICE_EXT[type]);
      await fs.writeFile(abs, buffer);
    } else {
      await writeFileContent(abs, TEXT_STARTERS[type] ?? "");
    }

    const virtualPath = parentPath ? `${parentPath}/${filename}` : filename;
    invalidateTreeCache();
    autoCommit(virtualPath, "Add");
    return NextResponse.json({ ok: true, path: virtualPath, isPage: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
