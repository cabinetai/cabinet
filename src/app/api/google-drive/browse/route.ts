import { NextRequest, NextResponse } from "next/server";
import { listSubdirectories, detectDriveDesktop } from "@/lib/google-drive/detect-desktop";
import fs from "fs/promises";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const detection = await detectDriveDesktop();
    if (!detection.mountPath) {
      return NextResponse.json({ error: "Google Drive for Desktop not detected" }, { status: 404 });
    }

    // Resolve the Drive root's real path once — used as the containment boundary.
    let realMountPath: string;
    try {
      realMountPath = await fs.realpath(detection.mountPath);
    } catch {
      return NextResponse.json({ error: "Google Drive for Desktop not detected" }, { status: 404 });
    }

    const { searchParams } = request.nextUrl;
    const rawPath = searchParams.get("path");

    // Resolve the requested path lexically (absolute) against the mount root.
    // An absolute rawPath overrides the base; a relative one resolves inside it.
    const requestedAbs = rawPath
      ? path.resolve(realMountPath, rawPath)
      : realMountPath;

    const within = (p: string) =>
      p === realMountPath || p.startsWith(realMountPath + path.sep);

    // Containment is checked BEFORE touching the filesystem, so we never
    // realpath() an arbitrary host path — doing so would leak whether it exists
    // via a differing status code. Out-of-bounds inputs are rejected here with
    // the same 404 returned for non-existent paths.
    let realRequestedPath: string | null = null;
    if (within(requestedAbs)) {
      try {
        // Resolve symlinks, then re-check containment to catch links that
        // point outside the mount.
        const resolved = await fs.realpath(requestedAbs);
        if (within(resolved)) realRequestedPath = resolved;
      } catch {
        // falls through to the uniform 404 below
      }
    }

    if (!realRequestedPath) {
      return NextResponse.json({ error: "Path not found" }, { status: 404 });
    }

    const dirs = await listSubdirectories(realRequestedPath);
    return NextResponse.json({ path: realRequestedPath, dirs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
