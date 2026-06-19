import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { detectDriveDesktop } from "@/lib/google-drive/detect-desktop";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

export async function GET() {
  try {
    const db = getDb();
    const mounts = db
      .prepare("SELECT id, abs_path, folder_name, enabled, added_at FROM google_drive_mounts ORDER BY added_at ASC")
      .all();
    return NextResponse.json({ mounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { absPath, folderName } = await request.json() as { absPath: string; folderName: string };

    if (!absPath || !folderName) {
      return NextResponse.json({ error: "absPath and folderName are required" }, { status: 400 });
    }

    // Verify the path exists and is a directory
    try {
      const stat = await fs.stat(absPath);
      if (!stat.isDirectory()) {
        return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Path does not exist" }, { status: 400 });
    }

    // Constrain mounts to within the detected Drive root, so arbitrary host
    // directories can't be mounted and exposed through the Drive APIs. Compare
    // realpaths to defeat symlinks pointing outside the mount.
    const detection = await detectDriveDesktop();
    if (!detection.mountPath) {
      return NextResponse.json({ error: "Google Drive for Desktop not detected" }, { status: 400 });
    }
    let realMountPath: string;
    let realAbsPath: string;
    try {
      realMountPath = await fs.realpath(detection.mountPath);
      realAbsPath = await fs.realpath(absPath);
    } catch {
      return NextResponse.json({ error: "Path does not exist" }, { status: 400 });
    }
    const within =
      realAbsPath === realMountPath ||
      realAbsPath.startsWith(realMountPath + path.sep);
    if (!within) {
      return NextResponse.json({ error: "Path is outside the Google Drive mount" }, { status: 400 });
    }

    const db = getDb();
    const id = randomUUID();
    try {
      db.prepare(
        "INSERT INTO google_drive_mounts (id, abs_path, folder_name, enabled, added_at) VALUES (?, ?, ?, 1, datetime('now'))"
      ).run(id, absPath, folderName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("UNIQUE constraint failed")) {
        return NextResponse.json({ error: "This folder is already mounted" }, { status: 409 });
      }
      throw err;
    }

    return NextResponse.json({ id, absPath, folderName }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
