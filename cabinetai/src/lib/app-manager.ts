import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { spawnSync } from "node:child_process";
import {
  CABINET_HOME,
  appVersionDir,
  ensureCabinetHome,
  ensureDir,
  validateVersion,
} from "./paths.js";
import { log, success, warning } from "./log.js";
import { npmCommand } from "./process.js";
import { fetchReleaseManifest, resolveAppBundle, type ReleaseAppBundle } from "./release-manifest.js";

const REPO_URL = "https://github.com/cabinetai/cabinet";

// A prebuilt app bundle is a ready-to-run standalone Next build — no npm install.
// `npx cabinetai run` boots server.js + cabinet-daemon.cjs directly from it.
function hasProductionRuntime(appDir: string): boolean {
  return (
    fs.existsSync(path.join(appDir, "server.js")) &&
    fs.existsSync(path.join(appDir, "server", "cabinet-daemon.cjs")) &&
    fs.existsSync(path.join(appDir, ".next", "static")) &&
    fs.existsSync(path.join(appDir, ".native", "node-pty", "package.json"))
  );
}

// The legacy source install: a checked-out source tree with node_modules. Still
// used on platforms that have no prebuilt bundle yet (e.g. Windows).
function hasSourceRuntime(appDir: string): boolean {
  return (
    fs.existsSync(path.join(appDir, "package.json")) &&
    fs.existsSync(path.join(appDir, "node_modules", "next"))
  );
}

/**
 * Check if the app is installed for a given version (either a prebuilt bundle
 * or a legacy source install).
 */
export function isAppInstalled(version: string): boolean {
  const appDir = appVersionDir(version);
  return hasProductionRuntime(appDir) || hasSourceRuntime(appDir);
}

/**
 * Get the app directory for a version, checking if it is ready.
 * Returns null if the app is not installed.
 */
export function getAppDir(version: string): string | null {
  if (!isAppInstalled(version)) return null;
  return appVersionDir(version);
}

/**
 * Ensure the app is installed for a given version.
 *
 * Prefers a prebuilt app bundle for the current platform (zero-install, no npm).
 * Falls back to the source tarball + npm install when no bundle exists for this
 * platform/arch (e.g. Windows) or the bundle download fails.
 */
export async function ensureApp(version: string): Promise<string> {
  ensureCabinetHome();

  const appDir = appVersionDir(version);
  if (isAppInstalled(version)) {
    return appDir;
  }

  log(`Installing Cabinet v${version}...`);

  const manifest = await fetchReleaseManifest(version);
  const bundle = manifest ? resolveAppBundle(manifest) : null;

  if (bundle) {
    try {
      await downloadAndExtractBundle(appDir, bundle);
      success(`Cabinet v${version} installed.`);
      return appDir;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warning(`Prebuilt bundle install failed (${message}), falling back to source install...`);
    }
  } else {
    log(`No prebuilt bundle for ${process.platform}/${process.arch}; using source install.`);
  }

  await installFromSource(version, appDir);
  success(`Cabinet v${version} installed.`);
  return appDir;
}

async function resolveExpectedSha256(bundle: ReleaseAppBundle): Promise<string | null> {
  if (bundle.sha256) return bundle.sha256;
  try {
    const r = await fetch(`${bundle.url}.sha256`, {
      headers: { "user-agent": "cabinetai" },
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      const text = (await r.text()).trim().split(/\s+/)[0];
      if (text && /^[0-9a-f]{64}$/i.test(text)) return text;
    }
  } catch {
    // sidecar not available, skip verification
  }
  return null;
}

async function downloadAndExtractBundle(appDir: string, bundle: ReleaseAppBundle): Promise<void> {
  // Use a sibling temp dir so rename is on the same filesystem (avoids EXDEV).
  const stagingDir = `${appDir}.installing-${process.pid}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-app-"));
  const archivePath = path.join(tempDir, "cabinet-app.tgz");

  try {
    log(`Downloading app bundle from ${bundle.url}...`);
    const response = await fetch(bundle.url, {
      headers: { "user-agent": "cabinetai" },
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      throw new Error(`App bundle request failed (${response.status})`);
    }
    if (!response.body) {
      throw new Error("App bundle response has no body");
    }

    // Stream to disk, hashing in-flight to avoid buffering the whole bundle in memory.
    const hash = createHash("sha256");
    const hashTransform = new Transform({
      transform(chunk, _enc, cb) { hash.update(chunk); cb(null, chunk); },
    });
    await pipeline(
      response.body as unknown as NodeJS.ReadableStream,
      hashTransform,
      fs.createWriteStream(archivePath),
    );

    const actualHash = hash.digest("hex");
    const expectedHash = await resolveExpectedSha256(bundle);
    if (expectedHash && actualHash !== expectedHash) {
      throw new Error(`Bundle SHA-256 mismatch (expected ${expectedHash}, got ${actualHash})`);
    }

    fs.mkdirSync(stagingDir, { recursive: true });

    // Windows ships bsdtar at %SystemRoot%\System32\tar.exe, which handles `C:\…`
    // paths and does NOT understand GNU's `--no-same-owner` (ownership is moot on
    // Windows). Invoking it explicitly also avoids a GNU `tar` earlier on PATH
    // (Git Bash / MSYS / WSL) misreading the `C:\…` archive path as a remote
    // `host:path` SSH spec and failing with "Cannot connect to C:".
    const isWin = process.platform === "win32";
    const winTar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    const tarBin = isWin && fs.existsSync(winTar) ? winTar : "tar";
    const tarArgs = isWin
      ? ["-xf", archivePath, "-C", stagingDir]
      : ["-xzf", archivePath, "-C", stagingDir, "--no-same-owner"];
    const result = spawnSync(tarBin, tarArgs, { stdio: "inherit" });
    if (result.error || result.status !== 0) {
      throw new Error(
        `Failed to extract app bundle: ${result.error?.message ?? `exited with code ${result.status}`}`
      );
    }

    const missing = [
      "server.js",
      path.join("server", "cabinet-daemon.cjs"),
      path.join(".next", "static"),
      path.join(".native", "node-pty", "package.json"),
    ].filter((f) => !fs.existsSync(path.join(stagingDir, f)));

    if (missing.length > 0) {
      throw new Error(`App bundle missing runtime files in ${appDir}: ${missing.join(", ")}`);
    }

    // Atomic promotion: rename staging dir into place. If another process
    // already finished installing, the existing appDir is replaced atomically.
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.renameSync(stagingDir, appDir);
  } catch (err) {
    fs.rmSync(appDir, { recursive: true, force: true });
    throw err;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ─── Legacy source install (fallback: no prebuilt bundle for this platform) ───

function releaseTagFor(version: string): string {
  const clean = validateVersion(version);
  return `v${clean}`;
}

function defaultTarballUrl(version: string): string {
  return `${REPO_URL}/archive/refs/tags/${releaseTagFor(version)}.tar.gz`;
}

async function installFromSource(version: string, appDir: string): Promise<void> {
  if (!fs.existsSync(path.join(appDir, "package.json"))) {
    await downloadAndExtractSource(version, appDir);
  }

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
}

async function downloadAndExtractSource(version: string, appDir: string): Promise<void> {
  const tarballUrl = defaultTarballUrl(version);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-app-"));
  const archivePath = path.join(tempDir, "cabinet.tgz");

  try {
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

    // Extract. Windows ships bsdtar at %SystemRoot%\System32\tar.exe, which handles
    // `C:\…` paths and does NOT understand GNU's `--no-same-owner` (ownership is moot
    // on Windows anyway). Invoking it explicitly also avoids a GNU `tar` earlier on
    // PATH (Git Bash / MSYS / WSL) misreading the `C:\…` archive path as a remote
    // `host:path` SSH spec and failing with "Cannot connect to C:".
    log("Extracting...");
    const isWin = process.platform === "win32";
    const winTar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    const tarBin = isWin && fs.existsSync(winTar) ? winTar : "tar";
    const tarArgs = isWin
      ? ["-xf", archivePath, "-C", tempDir]
      : ["-xzf", archivePath, "-C", tempDir, "--no-same-owner"];
    const tarResult = spawnSync(tarBin, tarArgs, { stdio: "inherit" });
    if (tarResult.error || tarResult.status !== 0) {
      throw new Error(
        `tar extraction failed: ${tarResult.error?.message ?? `exited with code ${tarResult.status}`}`
      );
    }

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
