import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { spawnSync } from "node:child_process";
import { CABINET_HOME, appVersionDir, ensureCabinetHome } from "./paths.js";
import { log, success } from "./log.js";
import { fetchReleaseManifest, resolveAppBundle, type ReleaseAppBundle } from "./release-manifest.js";

function hasProductionRuntime(appDir: string): boolean {
  return (
    fs.existsSync(path.join(appDir, "server.js")) &&
    fs.existsSync(path.join(appDir, "server", "cabinet-daemon.cjs")) &&
    fs.existsSync(path.join(appDir, ".next", "static")) &&
    fs.existsSync(path.join(appDir, ".native", "node-pty", "package.json"))
  );
}

export function isAppInstalled(version: string): boolean {
  return hasProductionRuntime(appVersionDir(version));
}

export function getAppDir(version: string): string | null {
  if (!isAppInstalled(version)) return null;
  return appVersionDir(version);
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

    fs.rmSync(appDir, { recursive: true, force: true });
    fs.mkdirSync(appDir, { recursive: true });

    const result = spawnSync("tar", ["-xzf", archivePath, "-C", appDir, "--no-same-owner"], {
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error("Failed to extract app bundle");
    }

    const missing = [
      "server.js",
      path.join("server", "cabinet-daemon.cjs"),
      path.join(".next", "static"),
      path.join(".native", "node-pty", "package.json"),
    ].filter((f) => !fs.existsSync(path.join(appDir, f)));

    if (missing.length > 0) {
      throw new Error(`App bundle missing runtime files in ${appDir}: ${missing.join(", ")}`);
    }
  } catch (err) {
    fs.rmSync(appDir, { recursive: true, force: true });
    throw err;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function ensureApp(version: string): Promise<string> {
  ensureCabinetHome();

  const appDir = appVersionDir(version);
  if (isAppInstalled(version)) {
    return appDir;
  }

  log(`Installing Cabinet v${version}...`);
  const manifest = await fetchReleaseManifest(version);
  if (!manifest) {
    throw new Error("Could not fetch release manifest");
  }

  const bundle = resolveAppBundle(manifest);
  if (!bundle) {
    throw new Error(`No prebuilt app bundle available for ${process.platform}/${process.arch}`);
  }

  await downloadAndExtractBundle(appDir, bundle);
  success(`Cabinet v${version} installed.`);
  return appDir;
}

export function listInstalledVersions(): string[] {
  const appParent = path.join(CABINET_HOME, "app");
  if (!fs.existsSync(appParent)) return [];

  return fs
    .readdirSync(appParent, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("v"))
    .map((e) => e.name.slice(1))
    .sort();
}
