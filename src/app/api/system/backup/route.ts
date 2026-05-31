import { NextRequest, NextResponse } from "next/server";
import {
  createDataBackup,
  createProjectSnapshotBackup,
  type BackupOptions,
} from "@/lib/system/backup";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      scope?: "data" | "project";
      includeEnvKeys?: boolean;
      includeSkills?: boolean;
    };
    const scope = body.scope === "project" ? "project" : "data";
    const options: BackupOptions = {
      includeEnvKeys: body.includeEnvKeys === true,
      includeSkills: body.includeSkills === true,
    };
    const backupPath =
      scope === "project"
        ? await createProjectSnapshotBackup("manual-project-backup", options)
        : await createDataBackup("manual-data-backup", options);

    return NextResponse.json({ ok: true, scope, backupPath, options });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
