import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildGoogleDriveTree } from "@/lib/google-drive/tree-builder";

export async function GET() {
  try {
    const db = getDb();
    const mounts = db
      .prepare("SELECT id, abs_path, folder_name FROM google_drive_mounts WHERE enabled = 1 ORDER BY added_at ASC")
      .all() as { id: string; abs_path: string; folder_name: string }[];

    if (mounts.length === 0) {
      return NextResponse.json({ sections: [] });
    }

    const sections = await buildGoogleDriveTree(mounts);
    return NextResponse.json({ sections });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
