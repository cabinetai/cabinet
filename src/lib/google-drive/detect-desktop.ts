import fs from "fs/promises";
import path from "path";
import os from "os";

export interface DriveDesktopResult {
  detected: boolean;
  mountPath: string | null;
}

const HOME = os.homedir();

// Candidate paths in priority order.
// macOS: Drive for Desktop uses CloudStorage with the account email in the dir name.
// macOS legacy: older "Backup and Sync" used ~/Google Drive.
// Windows: %USERPROFILE%\Google Drive\My Drive
const CANDIDATE_GLOBS = [
  // macOS — Drive for Desktop (current)
  path.join(HOME, "Library", "CloudStorage"),
  // macOS — legacy Backup and Sync / Windows — Google Drive for Desktop
  path.join(HOME, "Google Drive", "My Drive"),
  path.join(HOME, "Google Drive"),
  // Windows — alternate install path used by some Drive for Desktop versions
  path.join(HOME, "My Drive"),
  // Linux — rclone default mount or manual mount
  path.join(HOME, "GoogleDrive"),
];

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Resolve the first valid Google Drive mount path.
export async function detectDriveDesktop(): Promise<DriveDesktopResult> {
  // macOS: scan ~/Library/CloudStorage for GoogleDrive-* directories
  const cloudStoragePath = path.join(HOME, "Library", "CloudStorage");
  if (await exists(cloudStoragePath)) {
    try {
      const entries = await fs.readdir(cloudStoragePath);
      const driveEntry = entries.find((e) => e.startsWith("GoogleDrive-"));
      if (driveEntry) {
        const myDrive = path.join(cloudStoragePath, driveEntry, "My Drive");
        if (await exists(myDrive)) {
          return { detected: true, mountPath: myDrive };
        }
        // Some setups mount without "My Drive" subdirectory
        const root = path.join(cloudStoragePath, driveEntry);
        return { detected: true, mountPath: root };
      }
    } catch {
      // ignore readdir errors
    }
  }

  // Remaining static candidates
  for (const candidate of CANDIDATE_GLOBS.slice(1)) {
    if (await exists(candidate)) {
      return { detected: true, mountPath: candidate };
    }
  }

  return { detected: false, mountPath: null };
}

// Return all top-level subdirectories at a given path (for the folder picker).
export async function listSubdirectories(
  dirPath: string
): Promise<{ name: string; path: string }[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: path.join(dirPath, e.name) }));
  } catch {
    return [];
  }
}
