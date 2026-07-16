import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { createWriteStream } from "fs";
import { resolveContentPath } from "@/lib/storage/path-utils";
import { ensureDirectory, fileExists } from "@/lib/storage/fs-operations";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";
import { autoCommit } from "@/lib/git/git-service";
import { assertWritablePath, ReadOnlySourceError } from "@/lib/knowledge-sources/store";
import fs from "fs/promises";
import { storageOverCap } from "@/lib/cloud/tier";
import { requireApiAuth } from "@/lib/auth/request-gate";

type RouteParams = { params: Promise<{ path: string[] }> };

// POST buffers the whole multipart body in memory, so it stays small-only
// (editor paste). Large files go through PUT, which streams to disk.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB
const MAX_STREAM_BYTES = 1024 * 1024 * 1024; // 1GB
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

async function uniqueFilename(dir: string, rawName: string) {
  let filename = rawName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let filePath = path.join(dir, filename);
  let counter = 1;
  while (await fileExists(filePath)) {
    filename = `${base}-${counter}${ext}`;
    filePath = path.join(dir, filename);
    counter++;
  }
  return { filename, filePath };
}

function uploadResponse(
  virtualPath: string,
  originalName: string,
  filename: string,
  mimeType: string
) {
  let markdown: string;
  if (mimeType.startsWith("image/")) {
    markdown = `![${originalName}](./${filename})`;
  } else if (mimeType.startsWith("video/")) {
    markdown = `<video src="./${filename}" controls></video>`;
  } else {
    markdown = `[${originalName}](./${filename})`;
  }
  return NextResponse.json({
    ok: true,
    filename,
    markdown,
    url: `/api/assets/${virtualPath}/${filename}`,
  });
}

function finishUpload(virtualPath: string, filename: string, skipCommit: boolean) {
  if (!skipCommit) {
    autoCommit(`${virtualPath}/${filename}`, "Add");
  }
  // Refresh the tree for visible imports (sidebar Import File). Skip hidden
  // targets (e.g. conversation attachments) so editor pastes don't thrash
  // the 5s buildTree cache.
  if (!virtualPath.split("/").some((seg) => seg.startsWith("."))) {
    invalidateTreeCache();
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    // This route sits outside the proxy matcher (large bodies must not be
    // cloned/truncated by it), so the auth gate runs here instead.
    const denied = await requireApiAuth(req);
    if (denied) return denied;
    if (await storageOverCap()) {
      return NextResponse.json(
        { error: "Storage full: the free plan is capped. Upgrade for more room.", errorKind: "storage" },
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

    const { filename, filePath } = await uniqueFilename(resolved, file.name);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    finishUpload(virtualPath, filename, skipCommit);
    return uploadResponse(virtualPath, file.name, filename, file.type || "");
  } catch (error) {
    if (error instanceof ReadOnlySourceError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Streaming upload for large files: raw body piped to disk in chunks, so
// memory stays flat regardless of file size. ?name=<filename> is required;
// ?type=<mime> and ?commit=0 are optional.
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const denied = await requireApiAuth(req);
    if (denied) return denied;
    if (await storageOverCap()) {
      return NextResponse.json(
        { error: "Storage full: the free plan is capped. Upgrade for more room.", errorKind: "storage" },
        { status: 402 },
      );
    }
    const { path: segments } = await params;
    const virtualPath = segments.join("/");
    await assertWritablePath(`${virtualPath}/upload`);
    const resolved = resolveContentPath(virtualPath);
    const { searchParams } = new URL(req.url);
    const skipCommit = searchParams.get("commit") === "0";
    const rawName = searchParams.get("name") || "";
    const mimeType = searchParams.get("type") || "";

    if (!rawName) {
      return NextResponse.json({ error: "Missing name parameter" }, { status: 400 });
    }
    if (hasExecutableExtension(rawName)) {
      return NextResponse.json(
        { error: "Executable files are not allowed" },
        { status: 415 }
      );
    }
    const sizeError = NextResponse.json(
      { error: `File exceeds ${MAX_STREAM_BYTES / 1024 / 1024 / 1024}GB size limit` },
      { status: 413 }
    );
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > MAX_STREAM_BYTES) return sizeError;
    if (!req.body) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    await ensureDirectory(resolved);
    const { filename, filePath } = await uniqueFilename(resolved, rawName);

    const ws = createWriteStream(filePath);
    const reader = req.body.getReader();
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_STREAM_BYTES) {
          ws.destroy();
          await fs.unlink(filePath).catch(() => {});
          return sizeError;
        }
        await new Promise<void>((resolve, reject) =>
          ws.write(value, (err) => (err ? reject(err) : resolve()))
        );
      }
      await new Promise<void>((resolve, reject) => {
        ws.on("error", reject);
        ws.end(resolve);
      });
    } catch (err) {
      ws.destroy();
      await fs.unlink(filePath).catch(() => {});
      throw err;
    }

    finishUpload(virtualPath, filename, skipCommit);
    return uploadResponse(virtualPath, rawName, filename, mimeType);
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
    const denied = await requireApiAuth(req);
    if (denied) return denied;
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
