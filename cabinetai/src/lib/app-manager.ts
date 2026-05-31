import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";
import { CABINET_HOME, appVersionDir, ensureCabinetHome, ensureDir, validateVersion } from "./paths.js";
import { log, success, warning } from "./log.js";
import { npmCommand } from "./process.js";

const REPO_URL = "https://github.com/hilash/cabinet";

function releaseTagFor(version: string): string {
  const clean = validateVersion(version);
  return `v${clean}`;
}

function defaultTarballUrl(version: string): string {
  return `${REPO_URL}/archive/refs/tags/${releaseTagFor(version)}.tar.gz`;
}

/**
 * Check if the app is installed for a given version.
 */
export function isAppInstalled(version: string): boolean {
  const appDir = appVersionDir(version);
  return (
    fs.existsSync(path.join(appDir, "package.json")) &&
    fs.existsSync(path.join(appDir, "node_modules", "next"))
  );
}

/**
 * Get the app directory for a version, checking if deps are installed.
 * Returns null if the app is not ready.
 */
export function getAppDir(version: string): string | null {
  if (!isAppInstalled(version)) return null;
  return appVersionDir(version);
}

/**
 * Ensure the app is installed for a given version.
 * Downloads and installs if not present.
 * Returns the app directory path.
 */
export async function ensureApp(version: string): Promise<string> {
  ensureCabinetHome();

  const appDir = appVersionDir(version);

  // Check if already fully installed
  if (isAppInstalled(version)) {
    return appDir;
  }

  // Check if partially installed (files exist but no node_modules)
  const hasPackageJson = fs.existsSync(path.join(appDir, "package.json"));

  if (!hasPackageJson) {
    log(`Installing Cabinet v${version}...`);
    await downloadAndExtract(version, appDir);
  }

  // Run npm install if deps are missing
  if (!fs.existsSync(path.join(appDir, "node_modules", "next"))) {
    log("Installing dependencies...");
    const result = spawnSync(npmCommand(), ["install"], {
      cwd: appDir,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error("Failed to install dependencies");
    }
  }

  // Copy .env.example to .env.local if missing
  const envExample = path.join(appDir, ".env.example");
  const envLocal = path.join(appDir, ".env.local");
  if (fs.existsSync(envExample) && !fs.existsSync(envLocal)) {
    fs.copyFileSync(envExample, envLocal);
  }

  success(`Cabinet v${version} installed.`);
  return appDir;
}

async function downloadAndExtract(version: string, appDir: string): Promise<void> {
  const tarballUrl = defaultTarballUrl(version);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-app-"));
  const archivePath = path.join(tempDir, "cabinet.tgz");

  try {
    // Download
    log(`Downloading Cabinet v${version}...`);
    const response = await fetch(tarballUrl, {
      headers: { "user-agent": "cabinetai" },
      signal: AbortSignal.timeout(120_000), // 2 minute timeout
    });

    if (!response.ok) {
      // Try clone fallback
      warning(`Release tarball unavailable (${response.status}), falling back to git clone...`);
      await cloneFallback(version, appDir, tempDir);
      return;
    }

    // Reject suspiciously large tarballs (> 500MB)
    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    if (contentLength > 500 * 1024 * 1024) {
      throw new Error(`Release tarball too large: ${contentLength} bytes`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(archivePath, bytes);

    // Extract
    log("Extracting...");
    spawnSync("tar", ["-xzf", archivePath, "-C", tempDir, "--no-same-owner"], { stdio: "inherit" });

    // Find extracted root (GitHub tarballs have a single root dir like "cabinet-0.2.12/")
    const entries = fs
      .readdirSync(tempDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "." && e.name !== "..");

    if (entries.length === 0) {
      throw new Error("Empty release archive");
    }

    const extractedRoot = path.join(tempDir, entries[0].name);

    // Copy to app dir
    ensureDir(appDir);
    const sourceEntries = fs.readdirSync(extractedRoot, { withFileTypes: true });
    for (const entry of sourceEntries) {
      // Skip data dir and git — we don't need them in the app install
      if (entry.name === "data" || entry.name === ".git") continue;

      const src = path.join(extractedRoot, entry.name);
      const dest = path.join(appDir, entry.name);
      fs.cpSync(src, dest, { recursive: true });
    }
  } catch (err) {
    // Clean up partial install on failure
    fs.rmSync(appDir, { recursive: true, force: true });
    throw err;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function cloneFallback(version: string, appDir: string, tempDir: string): Promise<void> {
  const cloneDir = path.join(tempDir, "cabinet-clone");
  const tag = releaseTagFor(version);

  const result = spawnSync("git", ["clone", "--depth", "1", "--branch", tag, "--", `${REPO_URL}.git`, cloneDir], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    // Try without tag (HEAD)
    warning("Tagged release not found, cloning HEAD...");
    const headResult = spawnSync("git", ["clone", "--depth", "1", "--", `${REPO_URL}.git`, cloneDir], {
      stdio: "inherit",
    });
    if (headResult.status !== 0) {
      throw new Error("Failed to clone Cabinet repository");
    }
  }

  ensureDir(appDir);
  const entries = fs.readdirSync(cloneDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "data" || entry.name === ".git") continue;
    const src = path.join(cloneDir, entry.name);
    const dest = path.join(appDir, entry.name);
    fs.cpSync(src, dest, { recursive: true });
  }
}

/**
 * List installed app versions.
 */
export function listInstalledVersions(): string[] {
  const appParent = path.join(CABINET_HOME, "app");
  if (!fs.existsSync(appParent)) return [];

  return fs
    .readdirSync(appParent, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("v"))
    .map((e) => e.name.slice(1))
    .sort();
}
