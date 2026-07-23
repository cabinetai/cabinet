#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const PORT = 4204;
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-launchd-e2e-")));
const label = `ai.cabinet.supervision-test.${process.pid}.${Date.now()}`;
const domain = `gui/${process.getuid()}`;
const service = `${domain}/${label}`;
const plistPath = path.join(root, `${label}.plist`);
const launchLog = path.join(root, "launches.jsonl");
const processLog = path.join(root, "process.log");
const overlapMarker = path.join(root, "overlap");
let loaded = false;

function launchctl(...args) {
  return execFileSync("/bin/launchctl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function canConnect() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: PORT });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function assertPortAvailable() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}

async function waitFor(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(typeof message === "function" ? message() : message);
}

function launchRecords() {
  if (!fs.existsSync(launchLog)) return [];
  return fs.readFileSync(launchLog, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
}

function renderFixture() {
  const data = path.join(root, "data");
  const envFile = path.join(root, "cabinet.env");
  const cli = path.join(root, "hermes");
  const standalone = path.join(root, ".next", "standalone");
  const scripts = path.join(root, "scripts");
  fs.mkdirSync(data);
  fs.mkdirSync(standalone, { recursive: true });
  fs.mkdirSync(scripts);
  fs.writeFileSync(envFile, "FIXTURE_ONLY=true\n", { mode: 0o600 });
  fs.writeFileSync(cli, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  fs.copyFileSync(
    path.resolve("scripts/start-cabinet-supervised.mjs"),
    path.join(scripts, "start-cabinet-supervised.mjs"),
  );
  fs.writeFileSync(
    path.join(standalone, "server.js"),
    `const fs = require("node:fs");
const net = require("node:net");
const lock = ${JSON.stringify(path.join(root, "child.lock"))};
let lockHandle;
try {
  lockHandle = fs.openSync(lock, "wx", 0o600);
} catch {
  fs.writeFileSync(${JSON.stringify(overlapMarker)}, "overlap");
  process.exit(70);
}
fs.appendFileSync(${JSON.stringify(launchLog)}, JSON.stringify({ at: Date.now(), pid: process.pid }) + "\\n");
const cleanup = () => {
  try { fs.closeSync(lockHandle); } catch {}
  try { fs.unlinkSync(lock); } catch {}
};
process.once("exit", cleanup);
const server = net.createServer();
server.listen(Number(process.env.PORT), process.env.HOSTNAME, () => {
  setTimeout(() => server.close(() => process.exit(64)), 250);
});`,
  );

  const template = fs.readFileSync(
    path.resolve("deploy/macos/ai.cabinet.plist.template"),
    "utf8",
  );
  const replacements = new Map([
    ["__SERVICE_LABEL__", label],
    ["__NODE_PATH__", process.execPath],
    ["__RUNTIME_ROOT__", root],
    ["__CABINET_DATA_DIR__", data],
    ["__CABINET_ENV_FILE__", envFile],
    ["__HERMES_EXECUTION_CLI_PATH__", cli],
    ["__HERMES_PROFILE__", "operator-os"],
    ["__CABINET_PORT__", String(PORT)],
  ]);
  let rendered = template;
  for (const [placeholder, value] of replacements) {
    rendered = rendered.replaceAll(placeholder, value);
  }
  rendered = rendered.replaceAll("<string>/dev/null</string>", `<string>${processLog}</string>`);
  assert.doesNotMatch(rendered, /__[A-Z0-9_]+__/);
  fs.writeFileSync(plistPath, rendered, { mode: 0o600 });
}

try {
  await assertPortAvailable();
  renderFixture();
  execFileSync("/usr/bin/plutil", ["-lint", plistPath], { stdio: "pipe" });
  launchctl("bootstrap", domain, plistPath);
  loaded = true;

  await waitFor(
    () => launchRecords().length >= 2,
    30_000,
    () => {
      let state = "unknown";
      try {
        const output = launchctl("print", service);
        state = output.match(/state = ([^\n]+)/)?.[1] ?? state;
        const lastExit = output.match(/last exit code = ([^\n]+)/)?.[1];
        if (lastExit) state += `, last exit ${lastExit}`;
      } catch {
        state = "not loaded";
      }
      const diagnostics = fs.existsSync(processLog)
        ? fs.readFileSync(processLog, "utf8").trim().replaceAll(root, "<fixture>")
        : "no process diagnostics";
      return `launchd did not restart the failed supervised child (observed ${launchRecords().length} starts; ${state}; ${diagnostics})`;
    },
  );
  const records = launchRecords();
  assert.equal(records.length, 2, "launchd started more than one replacement during the throttled interval");
  assert.ok(
    records[1].at - records[0].at >= 8_000,
    "launchd did not throttle the repeated child failure",
  );
  assert.equal(fs.existsSync(overlapMarker), false, "two supervised children overlapped");
  await waitFor(
    async () => !(await canConnect()),
    3_000,
    "failed child retained the supervision test listener",
  );

  const serviceState = launchctl("print", service);
  assert.match(serviceState, /last exit code = 64/);

  launchctl("bootout", service);
  loaded = false;
  await waitFor(() => {
    try {
      launchctl("print", service);
      return false;
    } catch {
      return true;
    }
  }, 5_000, "temporary launchd service remained loaded after bootout");
  await assertPortAvailable();

  const startsAfterBootout = launchRecords().length;
  await new Promise((resolve) => setTimeout(resolve, 11_000));
  assert.equal(
    launchRecords().length,
    startsAfterBootout,
    "temporary launchd service restarted after bootout",
  );

  console.log("supervised launchd e2e: passed");
} finally {
  if (loaded) {
    try {
      launchctl("bootout", service);
    } catch {
      // The service may already have been removed.
    }
  }
  fs.rmSync(root, { recursive: true, force: true });
}
