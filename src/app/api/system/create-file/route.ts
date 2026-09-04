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
import { slugifyFileName } from "@/lib/markdown/wiki-links";
import { blankOffice, type BlankOfficeKind } from "@/lib/storage/office-templates";
import { appendOrder, setEntryOrder } from "@/lib/storage/order-store";

export const dynamic = "force-dynamic";

// Types that become a *page* (standalone .md file) rather than a flat file.
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
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "-")
    .replace(/\.\.+/g, "-")
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
      const slug = slugifyFileName(rawName);
      if (!slug) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      const virtualPath = parentPath ? `${parentPath}/${slug}` : slug;
      const resolved = resolveContentPath(virtualPath);
      const mdPath = `${resolved}.md`;
      if (await fileExists(mdPath)) {
        return NextResponse.json(
          { error: `A page named "${slug}" already exists here.` },
          { status: 409 }
        );
      }

      if (type === "markdown") {
        await createPage(virtualPath, rawName);
      } else {
        const kind = GOOGLE_KIND[type];
        const url = (body.googleUrl || "").trim();
        const order = await appendOrder(parentPath);
        const fm = {
          type: "Untyped",
          title: rawName,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          tags: [] as string[],
          order,
          google: { kind, ...(url ? { url } : { url: "" }) },
        };
        const content = url
          ? `\n# ${rawName}\n`
          : `\n# ${rawName}\n\n> Paste a shareable Google link in this page's settings to embed it.\n`;
        const mdPath = `${resolved}.md`;
        await ensureDirectory(path.dirname(mdPath));
        await writeFileContent(
          mdPath,
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
    try {
      const order = await appendOrder(parentPath);
      await setEntryOrder(parentPath, filename, order);
    } catch (err) {
      console.error("Failed to assign order to created file:", err);
    }
    invalidateTreeCache();
    autoCommit(virtualPath, "Add");
    return NextResponse.json({ ok: true, path: virtualPath, isPage: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
