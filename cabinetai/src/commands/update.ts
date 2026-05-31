import type { Command } from "commander";
import { log, success, warning, error } from "../lib/log.js";
import { ensureApp, listInstalledVersions } from "../lib/app-manager.js";
import { VERSION } from "../version.js";
const MANIFEST_URL =
  "https://github.com/hilash/cabinet/releases/latest/download/cabinet-release.json";

interface ReleaseManifest {
  version: string;
  gitTag: string;
  releaseNotesUrl: string;
  sourceTarballUrl: string;
}

export function registerUpdate(program: Command): void {
  program
    .command("update")
    .description("Download a newer Cabinet app version")
    .action(async () => {
      try {
        await runUpdate();
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
      }
    });
}

async function runUpdate(): Promise<void> {
  log("Checking for updates...");

  const manifest = await fetchManifest();
  if (!manifest) {
    warning("Could not fetch release manifest. Check your network connection.");
    return;
  }

  const latestVersion = manifest.version;
  const currentVersion = VERSION;

  log(`Current CLI version: ${currentVersion}`);
  log(`Latest release: ${latestVersion}`);

  if (compareVersions(latestVersion, currentVersion) <= 0) {
    success(`Cabinet is up to date (v${currentVersion}).`);
    listInstalled();
    return;
  }

  log(`Downloading Cabinet v${latestVersion}...`);
  await ensureApp(latestVersion);

  console.log("");
  success(`Cabinet v${latestVersion} installed.`);
  console.log(`  Restart "npx cabinetai run" to use the new version.`);
  console.log(`  Release notes: ${manifest.releaseNotesUrl}`);
  console.log("");

  listInstalled();
}

async function fetchManifest(): Promise<ReleaseManifest | null> {
  try {
    const response = await fetch(MANIFEST_URL, {
      headers: { "user-agent": "cabinetai" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    return (await response.json()) as ReleaseManifest;
  } catch {
    return null;
  }
}

function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, "").split(".").map(Number);
  const partsB = b.replace(/^v/, "").split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function listInstalled(): void {
  const versions = listInstalledVersions();
  if (versions.length > 0) {
    console.log(`  Installed versions: ${versions.map((v) => `v${v}`).join(", ")}`);
  }
}
