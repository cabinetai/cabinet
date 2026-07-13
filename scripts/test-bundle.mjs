#!/usr/bin/env node
/**
 * End-to-end boot smoke test for `cabinetai run`.
 *
 * Unlike test-zero-install.mjs (which stubs server.js and only exercises the
 * download → extract → validate plumbing), this test boots the REAL built
 * bundle the way `npx cabinetai run` does, and asserts the app and daemon
 * actually come up and serve health.
 *
 * Prerequisite: a runnable bundle must already exist at .next/standalone.
 *   npm run build && npm run electron:prep
 *
 * What this tests:
 *   - `cabinetai run` resolves/bootstraps a cabinet dir
 *   - ensureApp() short-circuits on an already-installed runtime (no download)
 *   - the standalone Next server boots and serves GET /api/health → 200
 *   - the daemon boots and serves GET /health → 200
 *   - the native-module / bundled-node ABI contract holds (better-sqlite3,
 *     node-pty) — the exact thing the stub test cannot catch
 *
 * Isolation: installs the bundle as version v0.0.0-bundle-test under the real
 * CABINET_HOME (~/.cabinet) via a symlink to .next/standalone (never copies,
 * never touches the build output), uses a throwaway temp cabinet data dir, and
 * picks free ports. Everything is cleaned up on exit.
 *
 * Usage:
 *   node scripts/test-bundle.mjs
 */

import fs from "fs";
import os from "os";
import net from "net";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { runChecks } from "./smoke-checks.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CABINETAI_DIR = path.join(ROOT, "cabinetai");
const STANDALONE = path.join(ROOT, ".next", "standalone");

const TEST_VERSION = "0.0.0-bundletest";
const APP_DIR = path.join(os.homedir(), ".cabinet", "app", `v${TEST_VERSION}`);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-bundle-test-"));

let child = null;
let cleanedUp = false;
let childOutput = "";

// ─── helpers ─────────────────────────────────────────────────────────────────

function step(msg) { console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`); }
function ok(msg)   { console.log(`\x1b[32m✓ ${msg}\x1b[0m`); }
function info(msg) { console.log(`\x1b[90m  ${msg}\x1b[0m`); }

function removeAppDir() {
  // APP_DIR is our symlink to the build output — unlink the LINK, never recurse
  // into the target (that would delete .next/standalone).
  try {
    const st = fs.lstatSync(APP_DIR);
    if (st.isSymbolicLink()) fs.unlinkSync(APP_DIR);
    else fs.rmSync(APP_DIR, { recursive: true, force: true });
  } catch {
    // not present — fine
  }
}

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  if (child && child.pid) {
    // child is a detached group leader; signal the whole group so the app and
    // daemon it spawned die too.
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
  }
  removeAppDir();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

function fail(msg) {
  console.error(`\n\x1b[31m✗ FAIL: ${msg}\x1b[0m`);
  if (childOutput) {
    if (/NODE_MODULE_VERSION/.test(childOutput)) {
      console.error(
        "\x1b[33m  Hint: native-module ABI mismatch. The bundled bin/node and the\n" +
        "  traced better-sqlite3/node-pty were built against different Node\n" +
        "  versions. Rebuild with a single Node: `npm rebuild better-sqlite3`\n" +
        "  then re-run `npm run build && npm run electron:prep`.\x1b[0m"
      );
    }
    console.error("\x1b[90m─── last of `cabinetai run` output ───\x1b[0m");
    console.error(childOutput.slice(-4000));
  }
  cleanup();
  process.exit(1);
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function pollHealth(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (cleanedUp) return null; // child died — stop polling
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return r.status;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

// ─── 1. Require a runnable bundle ─────────────────────────────────────────────

step("Checking for a built bundle at .next/standalone...");

const REQUIRED = [
  "server.js",
  path.join("server", "cabinet-daemon.cjs"),
  path.join(".next", "static"),
  path.join(".native", "node-pty", "package.json"),
];
const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(STANDALONE, f)));
if (!fs.existsSync(STANDALONE) || missing.length > 0) {
  fail(
    `No runnable bundle (missing: ${missing.join(", ") || ".next/standalone"}).\n` +
    "  Build one first:  npm run build && npm run electron:prep"
  );
}
ok("Found server.js, daemon, .next/static, and bundled node-pty");

// ─── 2. Stage as an installed version so ensureApp() skips the download ───────

step(`Staging bundle as installed v${TEST_VERSION} (symlink → .next/standalone)...`);
removeAppDir();
fs.mkdirSync(path.dirname(APP_DIR), { recursive: true });
fs.symlinkSync(STANDALONE, APP_DIR, "dir");
ok(`Linked ${APP_DIR}`);

// ─── 3. Boot via `cabinetai run` (the real npx entrypoint) ────────────────────

const appPort = await freePort();
const daemonPort = await freePort();

step(`Booting \`cabinetai run\` (app:${appPort}, daemon:${daemonPort})...`);

const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
if (!fs.existsSync(tsx)) fail(`tsx not found at ${tsx} — run npm ci first`);

child = spawn(
  tsx,
  [
    path.join(CABINETAI_DIR, "src", "index.ts"),
    "run",
    "--app-version", TEST_VERSION,
    "--no-open",
    "--data-dir", DATA_DIR,
  ],
  {
    cwd: ROOT,
    detached: true, // own process group → we can kill app+daemon together
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      CABINET_APP_PORT: String(appPort),
      CABINET_DAEMON_PORT: String(daemonPort),
    },
  }
);
child.stdout.on("data", (d) => { childOutput += d; });
child.stderr.on("data", (d) => { childOutput += d; });
child.on("exit", (code) => {
  // `cabinetai run` only exits when one of its children dies. If that happens
  // before we observed health, the boot failed.
  if (!cleanedUp) fail(`\`cabinetai run\` exited early (code ${code}) before becoming healthy`);
});

// ─── 4. Assert health ─────────────────────────────────────────────────────────

step("Waiting for the app server to become healthy...");
const appStatus = await pollHealth(`http://127.0.0.1:${appPort}/api/health`, 90_000);
if (appStatus !== 200) fail(`app GET /api/health never returned 200 (got ${appStatus ?? "no response"})`);
ok("app GET /api/health → 200");

step("Waiting for the daemon to become healthy...");
const daemonStatus = await pollHealth(`http://127.0.0.1:${daemonPort}/health`, 30_000);
if (daemonStatus !== 200) fail(`daemon GET /health never returned 200 (got ${daemonStatus ?? "no response"})`);
ok("daemon GET /health → 200");

// ─── 5. Sanity: the app serves real HTML ──────────────────────────────────────

step("Verifying the app serves HTML...");
try {
  const html = await (await fetch(`http://127.0.0.1:${appPort}/`, { signal: AbortSignal.timeout(5000) })).text();
  if (/<title>/i.test(html)) ok("app serves an HTML document");
  else info("app responded but no <title> seen (continuing)");
} catch {
  info("could not fetch / for HTML check (continuing — health already passed)");
}

// ─── 6. Journey checks against the live pair ──────────────────────────────────

try {
  await runChecks({
    appUrl: `http://127.0.0.1:${appPort}`,
    daemonUrl: `http://127.0.0.1:${daemonPort}`,
  });
} catch (err) {
  fail(`journey check failed: ${err.message}`);
}

console.log(`\n\x1b[32m✓ Bundle boot smoke test passed — \`cabinetai run\` boots the real bundle.\x1b[0m`);
cleanup();
process.exit(0);
