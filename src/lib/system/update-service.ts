import { BACKUP_ROOT, DATA_DIR } from "@/lib/storage/path-utils";
import { detectInstallState } from "@/lib/system/install-metadata";
import { fetchLatestReleaseManifest, readBundledReleaseManifest } from "@/lib/system/release-manifest";
import { compareVersions } from "@/lib/system/version-utils";
import { readUpdateStatus } from "@/lib/system/update-status";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import type { InstallKind, UpdateCheckResult } from "@/types";

function buildInstructions(installKind: InstallKind, updateAvailable: boolean, dirtyAppFiles: string[]): string[] {
  if (!updateAvailable) {
    return ["You already have the latest Cabinet release this install can see."];
  }

  if (installKind === "electron-macos") {
    return [
      "Electron downloads supported updates in the background.",
      "When the update is ready, Cabinet will ask the user to restart the desktop app.",
    ];
  }

  if (installKind === "electron-windows") {
    return [
      "Windows portable Electron builds do not auto-update yet.",
      "Download the latest portable zip and replace the desktop app files manually after backing up your data.",
    ];
  }

  if (installKind === "source-custom") {
    return [
      "This install is not recognized as a managed Cabinet source install.",
      "Create a backup of your `data/` folder, then upgrade manually from the latest release notes.",
    ];
  }

  if (dirtyAppFiles.length > 0) {
    return [
      "Cabinet found local app-code changes and will not overwrite them automatically.",
      "Back up your project, review the changed files, then upgrade manually or clean the working tree first.",
    ];
  }

  return [
    "Back up your data before applying the update.",
    "Cabinet will preserve `data/`, create a project snapshot backup, and ask for a restart when done.",
  ];
}

export async function getUpdateCheckResult(): Promise<UpdateCheckResult> {
  const [current, latestResult, installState, updateStatus] = await Promise.all([
    readBundledReleaseManifest(),
    fetchLatestReleaseManifest(),
    detectInstallState(),
    readUpdateStatus(),
  ]);

  const latest = latestResult.manifest;
  const updateAvailable = compareVersions(latest.version, current.version) > 0;
  const canApplyUpdate =
    updateAvailable &&
    installState.installKind === "source-managed" &&
    installState.dirtyAppFiles.length === 0;

  return {
    current,
    latest,
    manifestUrl: latestResult.manifestUrl,
    installKind: installState.installKind,
    managed: installState.managed,
    updateAvailable,
    canApplyUpdate,
    dirtyAppFiles: installState.dirtyAppFiles,
    dataDir: DATA_DIR,
    projectRoot: PROJECT_ROOT,
    backupRoot: BACKUP_ROOT,
    instructions: buildInstructions(
      installState.installKind,
      updateAvailable,
      installState.dirtyAppFiles
    ),
    latestReleaseNotesUrl: latest.releaseNotesUrl,
    updateStatus,
  };
}
