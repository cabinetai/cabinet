import path from "path";
import { spawn } from "child_process";
import { NextResponse } from "next/server";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import { writeUpdateStatus } from "@/lib/system/update-status";
import { getUpdateCheckResult } from "@/lib/system/update-service";

export const dynamic = "force-dynamic";

export async function POST() {
  const update = await getUpdateCheckResult();

  if (!update.updateAvailable || !update.latest) {
    return NextResponse.json(
      { error: "No newer Optale Observatory release is available right now." },
      { status: 409 }
    );
  }

  if (!update.canApplyUpdate) {
    return NextResponse.json(
      {
        error: "This install cannot apply updates automatically.",
        dirtyAppFiles: update.dirtyAppFiles,
        instructions: update.instructions,
      },
      { status: 409 }
    );
  }

  const cliEntry = path.join(PROJECT_ROOT, "cli", "index.cjs");
  await writeUpdateStatus({
    state: "starting",
    startedAt: new Date().toISOString(),
    currentVersion: update.current.version,
    targetVersion: update.latest.version,
    installKind: update.installKind,
    message: "Preparing Optale Observatory update...",
    log: [`Queueing Optale Observatory ${update.latest.version} upgrade`],
  });

  const child = spawn(
    process.execPath,
    [
      cliEntry,
      "upgrade",
      "--target",
      PROJECT_ROOT,
      "--version",
      update.latest.version,
      "--tarball-url",
      update.latest.sourceTarballUrl,
      "--release-notes-url",
      update.latest.releaseNotesUrl,
      "--manifest-url",
      update.manifestUrl,
    ],
    {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        CABINET_DATA_DIR: DATA_DIR,
        CABINET_INSTALL_KIND: "source-managed",
      },
    }
  );

  child.unref();

  return NextResponse.json({
    ok: true,
    status: "started",
    targetVersion: update.latest.version,
  });
}
