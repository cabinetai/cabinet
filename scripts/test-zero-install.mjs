#!/usr/bin/env node
/**
 * Self-contained zero-install smoke test.
 *
 * No Next build, no real app bundle required. Creates a minimal stub bundle
 * with the exact 4 files hasProductionRuntime() checks, serves it over a
 * local HTTP server, then exercises the real download → extract → validate
 * path via a tsx harness against the TypeScript source.
 *
 * Usage:
 *   node scripts/test-zero-install.mjs
 *
 * What this tests:
 *   - Manifest fetch (CABINET_RELEASE_MANIFEST_URL override)
 *   - Bundle URL resolution for current platform
 *   - Streaming download + SHA-256 verification
 *   - tar extraction + atomic staging → rename
 *   - Runtime file validation (hasProductionRuntime check)
 *
 * What this does NOT test:
 *   - The app actually booting (server.js is a stub)
 *   - Cabinet data-dir bootstrapping
 *
 * Note: CABINET_HOME is hardcoded in paths.ts as ~/.cabinet.
 * Installs to ~/.cabinet/app/v0.0.0-test (won't conflict with real releases).
 * Clean up afterwards: rm -rf ~/.cabinet/app/v0.0.0-test
 */

import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import { spawn, spawnSync } from "child_process";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CABINETAI_DIR = path.join(ROOT, "cabinetai");

const TEST_VERSION = "0.0.0-test";
const PORT = 19999;
const WORK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-zero-install-test-"));
const HARNESS_PATH = path.join(CABINETAI_DIR, "__zero-install-test-harness__.ts");

process.on("exit", () => {
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  fs.rmSync(HARNESS_PATH, { force: true });
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function step(msg) { console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`); }
function ok(msg)   { console.log(`\x1b[32m✓ ${msg}\x1b[0m`); }
function fail(msg) { console.error(`\x1b[31m✗ FAIL: ${msg}\x1b[0m`); process.exit(1); }
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) fail(`${cmd} ${args.join(" ")} exited ${r.status}`);
}

// ─── 1. Create stub app bundle ───────────────────────────────────────────────

step("Creating stub app bundle...");

// These are the exact paths hasProductionRuntime() requires.
const RUNTIME_FILES = [
  "server.js",
  path.join("server", "cabinet-daemon.cjs"),
  path.join(".next", "static", ".keep"),
  path.join(".native", "node-pty", "package.json"),
];

const stubDir = path.join(WORK_DIR, "stub-app");
for (const f of RUNTIME_FILES) {
  const full = path.join(stubDir, f);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `// stub: ${f}\n`);
}

// Determine the bundle key for this machine.
const platformMap = {
  "linux-x64":    "linux-x64",
  "linux-arm64":  "linux-arm64",
  "darwin-x64":   "darwin-x64",
  "darwin-arm64": "darwin-arm64",
};
const bundleKey = platformMap[`${process.platform}-${process.arch}`];
if (!bundleKey) fail(`Unsupported platform: ${process.platform}-${process.arch}`);

const bundleName = `cabinet-app-${bundleKey}-v${TEST_VERSION}.tgz`;
const bundlePath = path.join(WORK_DIR, bundleName);

run("tar", ["-czf", bundlePath, "-C", stubDir, "."]);
ok(`Stub bundle: ${bundleName}`);

// SHA-256 sidecar so the CLI's hash check path is exercised too.
const sha256 = createHash("sha256").update(fs.readFileSync(bundlePath)).digest("hex");
fs.writeFileSync(`${bundlePath}.sha256`, sha256 + "\n");
ok(`SHA-256: ${sha256}`);

// ─── 2. Write local manifest ─────────────────────────────────────────────────

step("Writing local release manifest...");

const manifest = {
  manifestVersion: 1,
  version: TEST_VERSION,
  channel: "stable",
  releaseDate: new Date().toISOString(),
  gitTag: `v${TEST_VERSION}`,
  repositoryUrl: "https://github.com/hilash/cabinet",
  releaseNotesUrl: `https://github.com/hilash/cabinet/releases/tag/v${TEST_VERSION}`,
  sourceTarballUrl: `https://github.com/hilash/cabinet/archive/refs/tags/v${TEST_VERSION}.tar.gz`,
  appBundles: {
    [bundleKey]: {
      assetName: bundleName,
      url: `http://127.0.0.1:${PORT}/${bundleName}`,
    },
  },
  npmPackage: "create-cabinet",
  createCabinetVersion: TEST_VERSION,
  cabinetaiPackage: "cabinetai",
  cabinetaiVersion: TEST_VERSION,
};

const manifestPath = path.join(WORK_DIR, "cabinet-release.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
ok("Manifest written");

// ─── 3. Serve bundle ─────────────────────────────────────────────────────────

step(`Starting HTTP server on port ${PORT}...`);

const server = http.createServer((req, res) => {
  const filePath = path.join(WORK_DIR, decodeURIComponent(req.url ?? ""));
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    console.error(`  [server] 404: ${req.url}`);
    res.writeHead(404); res.end(); return;
  }
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "Content-Length": stat.size,
    "Content-Type": "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
ok(`Serving at http://127.0.0.1:${PORT}`);

// ─── 4. Run install harness via tsx (async spawn — keeps event loop alive) ───

step("Running ensureApp() via tsx harness...");

// IMPORTANT: use async spawn(), not spawnSync().
// spawnSync() blocks the Node.js event loop so the parent's HTTP server
// cannot accept connections from the child. The fetch inside the child
// would time out or hang indefinitely.

const appDir = path.join(os.homedir(), ".cabinet", "app", `v${TEST_VERSION}`);
fs.rmSync(appDir, { recursive: true, force: true }); // wipe previous test run

fs.writeFileSync(HARNESS_PATH, `
import { ensureApp } from "./src/lib/app-manager.js";
(async () => {
  const appDir = await ensureApp(${JSON.stringify(TEST_VERSION)});
  console.log("Installed to:", appDir);
})().catch((e) => { console.error(e.message); process.exit(1); });
`);

const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
if (!fs.existsSync(tsx)) fail(`tsx not found at ${tsx} — run npm ci first`);

const exitCode = await new Promise((resolve) => {
  const child = spawn(tsx, [HARNESS_PATH], {
    cwd: CABINETAI_DIR,
    stdio: "inherit",
    env: {
      ...process.env,
      CABINET_RELEASE_MANIFEST_URL: `http://127.0.0.1:${PORT}/cabinet-release.json`,
    },
  });
  child.on("close", resolve);
  // Safety timeout: kill the child if it takes too long.
  setTimeout(() => { child.kill("SIGTERM"); }, 60_000);
});

server.close();
fs.rmSync(HARNESS_PATH, { force: true });

if (exitCode !== 0) fail(`ensureApp() harness exited with code ${exitCode}`);

// ─── 5. Verify extracted files ───────────────────────────────────────────────

step("Verifying extracted bundle contents...");

if (!fs.existsSync(appDir)) fail(`App dir not created: ${appDir}`);

const checks = [
  "server.js",
  path.join("server", "cabinet-daemon.cjs"),
  path.join(".next", "static"),
  path.join(".native", "node-pty", "package.json"),
];

let allOk = true;
for (const f of checks) {
  if (fs.existsSync(path.join(appDir, f))) {
    ok(f);
  } else {
    console.error(`\x1b[31m✗ Missing: ${f}\x1b[0m`);
    allOk = false;
  }
}

if (!allOk) fail("Extracted bundle missing required runtime files");

console.log(`\n\x1b[32m✓ Zero-install smoke test passed.\x1b[0m`);
console.log(`\x1b[90m  Stub install at: ${appDir}`);
console.log(`  Clean up: rm -rf ${appDir}\x1b[0m\n`);
