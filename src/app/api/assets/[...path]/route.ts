import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { resolveContentPath } from "@/lib/storage/path-utils";
import { fileExists } from "@/lib/storage/fs-operations";
import { autoCommit } from "@/lib/git/git-service";
import fs from "fs/promises";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".css": "text/css",
  ".js": "application/javascript",
  ".html": "text/html",
  ".csv": "text/csv",
  ".json": "application/json",
  ".xml": "application/xml",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".txt": "text/plain",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ipynb": "application/json",
};

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { path: segments } = await params;
    const virtualPath = segments.join("/");
    const resolved = resolveContentPath(virtualPath);

    if (!(await fileExists(resolved))) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const stat = await fs.stat(resolved);
    const totalSize = stat.size;
    // HTML assets back in-Cabinet apps/websites that the user re-generates
    // (audit slideshows, dashboards, etc.). A 1h max-age served stale builds
    // until the cache expired. Force revalidation on every fetch — the
    // payload is small and the win on developer/UX feedback is large.
    // Binary assets (images, fonts, video) keep the long cache.
    const cacheControl = ext === ".html"
      ? "no-cache, must-revalidate"
      : "public, max-age=3600";

    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (match) {
        const startRaw = match[1];
        const endRaw = match[2];
        const start = startRaw === "" ? Math.max(0, totalSize - Number(endRaw || 0)) : Number(startRaw);
        const end = startRaw === "" ? totalSize - 1 : endRaw === "" ? totalSize - 1 : Number(endRaw);
        if (
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          start >= 0 &&
          end < totalSize &&
          start <= end
        ) {
          const fh = await fs.open(resolved, "r");
          try {
            const size = end - start + 1;
            const buf = Buffer.alloc(size);
            await fh.read(buf, 0, size, start);
            return new NextResponse(buf, {
              status: 206,
              headers: {
                "Content-Type": contentType,
                "Content-Length": String(size),
                "Content-Range": `bytes ${start}-${end}/${totalSize}`,
                "Accept-Ranges": "bytes",
                "Cache-Control": cacheControl,
              },
            });
          } finally {
            await fh.close();
          }
        }
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${totalSize}` },
        });
      }
    }

    const buffer = await fs.readFile(resolved);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(totalSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": cacheControl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { path: segments } = await params;
    const virtualPath = segments.join("/");
    const resolved = resolveContentPath(virtualPath);
    const body = await req.text();
    await fs.writeFile(resolved, body, "utf-8");
    autoCommit(virtualPath, "Update");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
