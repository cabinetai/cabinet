import { NextResponse } from "next/server";
import { detectDriveDesktop } from "@/lib/google-drive/detect-desktop";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const detection = await detectDriveDesktop();
    const db = getDb();
    const mounts = db
      .prepare("SELECT id, abs_path, folder_name, enabled, added_at FROM google_drive_mounts ORDER BY added_at ASC")
      .all() as { id: string; abs_path: string; folder_name: string; enabled: number; added_at: string }[];

    return NextResponse.json({
      desktopDetected: detection.detected,
      mountPath: detection.mountPath,
      mounts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
