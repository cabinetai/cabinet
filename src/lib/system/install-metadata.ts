import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { simpleGit } from "simple-git";
import {
  DATA_DIR,
  DATA_INSTALL_METADATA_PATH,
  ROOT_INSTALL_METADATA_PATH,
} from "@/lib/storage/path-utils";
import {
  isElectronRuntime,
  PROJECT_ROOT,
} from "@/lib/runtime/runtime-config";
import type { InstallKind, InstallMetadata } from "@/types";

const APP_PATH_IGNORES = [
  ".git/",
  ".next/",
  "data/",
  "node_modules/",
  ".cabinet-backups/",
];

export function inferElectronInstallKind(platform: NodeJS.Platform = process.platform): InstallKind {
  return platform === "win32" ? "electron-windows" : "electron-macos";
}

export async function readInstallMetadata(): Promise<InstallMetadata | null> {
  const candidates = [ROOT_INSTALL_METADATA_PATH, DATA_INSTALL_METADATA_PATH];

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, "utf-8");
      return JSON.parse(raw) as InstallMetadata;
    } catch {
      // try next candidate
    }
  }

  return null;
}

export async function writeInstallMetadata(metadata: InstallMetadata): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(path.dirname(DATA_INSTALL_METADATA_PATH), { recursive: true });

  const payload = JSON.stringify(metadata, null, 2);
  await fs.writeFile(ROOT_INSTALL_METADATA_PATH, payload, "utf-8");
  await fs.writeFile(DATA_INSTALL_METADATA_PATH, payload, "utf-8");
}

export function detectInstallKind(metadata: InstallMetadata | null): InstallKind {
  if (process.env.CABINET_INSTALL_KIND === "electron-macos") return "electron-macos";
  if (process.env.CABINET_INSTALL_KIND === "electron-windows") return "electron-windows";
  if (process.env.CABINET_INSTALL_KIND === "source-managed") return "source-managed";
  if (process.env.CABINET_INSTALL_KIND === "source-custom") return "source-custom";

  if (isElectronRuntime()) return inferElectronInstallKind();
  if (metadata?.installKind === "source-managed" && metadata.managed) {
    return "source-managed";
  }
  return "source-custom";
}

export async function listDirtyAppFiles(): Promise<string[]> {
  if (!fsSync.existsSync(path.join(PROJECT_ROOT, ".git"))) {
    return [];
  }

  try {
    const git = simpleGit(PROJECT_ROOT);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return [];

    const status = await git.status();
    return status.files
      .map((entry) => entry.path)
      .filter(
        (filePath) =>
          !APP_PATH_IGNORES.some((prefix) => filePath === prefix.slice(0, -1) || filePath.startsWith(prefix))
      )
      .sort();
  } catch {
    return [];
  }
}

export async function detectInstallState(): Promise<{
  installKind: InstallKind;
  metadata: InstallMetadata | null;
  dirtyAppFiles: string[];
  managed: boolean;
}> {
  const metadata = await readInstallMetadata();
  const installKind = detectInstallKind(metadata);
  const dirtyAppFiles = installKind === "source-managed" ? await listDirtyAppFiles() : [];

  return {
    installKind,
    metadata,
    dirtyAppFiles,
    managed:
      metadata?.managed === true ||
      installKind === "electron-macos" ||
      installKind === "electron-windows",
  };
}
