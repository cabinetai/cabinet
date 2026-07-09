import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { resolveContentPath } from "@/lib/storage/path-utils";
import { ensureDirectory, fileExists } from "@/lib/storage/fs-operations";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";
import { autoCommit } from "@/lib/git/git-service";
import { assertWritablePath, ReadOnlySourceError } from "@/lib/knowledge-sources/store";
import fs from "fs/promises";
import { storageOverCap } from "@/lib/cloud/tier";

type RouteParams = { params: Promise<{ path: string[] }> };

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB
const EXECUTABLE_EXTENSIONS = new Set([
  ".exe",
  ".msi",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".dmg",
  ".app",
  ".pkg",
  ".deb",
  ".rpm",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
]);

function hasExecutableExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return EXECUTABLE_EXTENSIONS.has(ext);
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    if (await storageOverCap()) {
      return NextResponse.json(
        { error: "Storage full — the free plan is capped. Upgrade for more room.", errorKind: "storage" },
        { status: 402 },
      );
    }
    const { path: segments } = await params;
    const virtualPath = segments.join("/");
    // Block uploading into a read-only mount (the new child sits under it).
    await assertWritablePath(`${virtualPath}/upload`);
    const resolved = resolveContentPath(virtualPath);
    const { searchParams } = new URL(req.url);
    const skipCommit = searchParams.get("commit") === "0";

    await ensureDirectory(resolved);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024}MB size limit`,
        },
        { status: 413 }
      );
    }

    if (hasExecutableExtension(file.name)) {
      return NextResponse.json(
        { error: "Executable files are not allowed" },
        { status: 415 }
      );
    }

    let filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let filePath = path.join(resolved, filename);
    let counter = 1;

    while (await fileExists(filePath)) {
      filename = `${base}-${counter}${ext}`;
      filePath = path.join(resolved, filename);
      counter++;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    if (!skipCommit) {
      autoCommit(`${virtualPath}/${filename}`, "Add");
    }

    // Refresh the tree for visible imports (sidebar Import File). Skip hidden
    // targets (e.g. conversation attachments) so editor pastes don't thrash
    // the 5s buildTree cache.
    if (!virtualPath.split("/").some((seg) => seg.startsWith("."))) {
      invalidateTreeCache();
    }

    const mimeType = file.type || "";
    let markdown: string;
    if (mimeType.startsWith("image/")) {
      markdown = `![${file.name}](./${filename})`;
    } else if (mimeType.startsWith("video/")) {
      markdown = `<video src="./${filename}" controls></video>`;
    } else {
      markdown = `[${file.name}](./${filename})`;
    }

    return NextResponse.json({
      ok: true,
      filename,
      markdown,
      url: `/api/assets/${virtualPath}/${filename}`,
    });
  } catch (error) {
    if (error instanceof ReadOnlySourceError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { path: segments } = await params;
    const virtualPath = segments.join("/");

    // Scope guard: DELETE is only allowed for conversation attachments.
    // Prevents this endpoint from being a generic file-deletion vector.
    if (!virtualPath.includes(".agents/.conversations/")) {
      return NextResponse.json(
        { error: "DELETE only allowed for conversation attachments" },
        { status: 403 }
      );
    }

    const resolved = resolveContentPath(virtualPath);
    try {
      await fs.unlink(resolved);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json({ ok: true, alreadyGone: true });
      }
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
