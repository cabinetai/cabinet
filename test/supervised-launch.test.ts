import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  supervisedChildEnvironment,
  validateSupervisedEnvironment,
} from "../scripts/start-cabinet-supervised.mjs";

const SUPERVISION_PORT = 4204;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-launch-test-"));
  const data = path.join(root, "data");
  const cli = path.join(root, "hermes");
  const envFile = path.join(root, "cabinet.env");
  fs.mkdirSync(path.join(root, ".next", "standalone"), { recursive: true });
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(root, ".next", "standalone", "server.js"), "");
  fs.writeFileSync(cli, "");
  fs.chmodSync(cli, 0o700);
  fs.writeFileSync(envFile, "CABINET_AUTH_SALT=fixture\n", { mode: 0o600 });
  return { root, data, cli, envFile };
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function assertPortAvailable(port: number): Promise<void> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("Timed out waiting for supervised process state");
}

function wrapperEnvironment(item: ReturnType<typeof fixture>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CABINET_DATA_DIR: item.data,
    CABINET_RUNTIME_MODE: "hermes",
    CABINET_HERMES_EXECUTION_CLI_PATH: item.cli,
    CABINET_HERMES_EXECUTION_NO_TOOLS: "true",
    CABINET_HERMES_PROFILE: "operator-os",
    CABINET_ENV_FILE: item.envFile,
    CABINET_HERMES_INTERVENTIONS_ENABLED: "false",
    HOSTNAME: "127.0.0.1",
    PORT: String(SUPERVISION_PORT),
  };
}

function writeFixtureServer(item: ReturnType<typeof fixture>, source: string): void {
  fs.writeFileSync(path.join(item.root, ".next", "standalone", "server.js"), source);
}

function spawnWrapper(cwd: string, env: NodeJS.ProcessEnv) {
  return spawn(
    process.execPath,
    [path.resolve("scripts/start-cabinet-supervised.mjs")],
    { cwd, env, stdio: "pipe" },
  );
}

async function exitResult(child: ReturnType<typeof spawnWrapper>): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
}> {
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve) => {
    child.once("exit", (exitCode, exitSignal) => resolve([exitCode, exitSignal]));
  });
  return { code, signal, output };
}

async function runWrapper(
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string }> {
  return exitResult(spawnWrapper(cwd, env));
}

test("supervised launch accepts only the private Hermes production contract", () => {
  const item = fixture();
  try {
    const result = validateSupervisedEnvironment({
      CABINET_DATA_DIR: item.data,
      CABINET_RUNTIME_MODE: "hermes",
      CABINET_HERMES_EXECUTION_CLI_PATH: item.cli,
      CABINET_HERMES_EXECUTION_NO_TOOLS: "true",
      CABINET_HERMES_PROFILE: "operator-os",
      CABINET_ENV_FILE: item.envFile,
      CABINET_HERMES_INTERVENTIONS_ENABLED: "false",
      HOSTNAME: "127.0.0.1",
      PORT: "4012",
    }, item.root);
    assert.equal(result.port, 4012);
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("supervised launch rejects public listeners and enabled interventions", () => {
  const item = fixture();
  const base = {
    CABINET_DATA_DIR: item.data,
    CABINET_RUNTIME_MODE: "hermes",
    CABINET_HERMES_EXECUTION_CLI_PATH: item.cli,
    CABINET_HERMES_EXECUTION_NO_TOOLS: "true",
    CABINET_HERMES_PROFILE: "operator-os",
    CABINET_ENV_FILE: item.envFile,
    CABINET_HERMES_INTERVENTIONS_ENABLED: "false",
    HOSTNAME: "127.0.0.1",
    PORT: "4012",
  };
  try {
    assert.throws(() => validateSupervisedEnvironment({ ...base, HOSTNAME: "0.0.0.0" }, item.root), /loopback-only/);
    assert.throws(() => validateSupervisedEnvironment({ ...base, CABINET_HERMES_INTERVENTIONS_ENABLED: "true" }, item.root), /interventions disabled/);
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("supervised launch rejects missing, false, and malformed no-tools state", () => {
  const item = fixture();
  const base = {
    CABINET_DATA_DIR: item.data,
    CABINET_RUNTIME_MODE: "hermes",
    CABINET_HERMES_EXECUTION_CLI_PATH: item.cli,
    CABINET_HERMES_PROFILE: "operator-os",
    CABINET_ENV_FILE: item.envFile,
    CABINET_HERMES_INTERVENTIONS_ENABLED: "false",
    HOSTNAME: "127.0.0.1",
    PORT: "4012",
  };
  try {
    for (const value of [undefined, "false", "1", " true ", "TRUE", "unexpected"]) {
      assert.throws(
        () => validateSupervisedEnvironment({
          ...base,
          CABINET_HERMES_EXECUTION_NO_TOOLS: value,
        }, item.root),
        /CABINET_HERMES_EXECUTION_NO_TOOLS=true/,
      );
    }
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("supervised child environment cannot weaken no-tools mode", () => {
  assert.equal(supervisedChildEnvironment({
    CABINET_HERMES_EXECUTION_NO_TOOLS: "false",
    CABINET_RUNTIME_MODE: "cabinet",
  }).CABINET_HERMES_EXECUTION_NO_TOOLS, "true");
});

test("normal child stop exits the wrapper with zero and returns the listener", async () => {
  await assertPortAvailable(SUPERVISION_PORT);
  const item = fixture();
  writeFixtureServer(
    item,
    `const server = require("node:http").createServer((_, response) => response.end("ok"));
server.listen(process.env.PORT, process.env.HOSTNAME, () => {
  setTimeout(() => server.close(() => process.exit(0)), 100);
});`,
  );
  try {
    const result = await runWrapper(item.root, wrapperEnvironment(item));
    assert.equal(result.code, 0);
    assert.equal(result.signal, null);
    await waitFor(async () => !(await canConnect(SUPERVISION_PORT)));
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("child crash exits the wrapper with the same failure and returns the listener", async () => {
  await assertPortAvailable(SUPERVISION_PORT);
  const item = fixture();
  writeFixtureServer(
    item,
    `const server = require("node:http").createServer();
server.listen(process.env.PORT, process.env.HOSTNAME, () => {
  server.close(() => process.exit(23));
});`,
  );
  try {
    const result = await runWrapper(item.root, wrapperEnvironment(item));
    assert.equal(result.code, 23);
    assert.equal(result.signal, null);
    await waitFor(async () => !(await canConnect(SUPERVISION_PORT)));
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("wrapper termination forwards SIGTERM and leaves no port owner", async () => {
  await assertPortAvailable(SUPERVISION_PORT);
  const item = fixture();
  const marker = path.join(item.root, "sigterm-forwarded");
  writeFixtureServer(
    item,
    `const fs = require("node:fs");
const server = require("node:http").createServer();
process.once("SIGTERM", () => {
  fs.writeFileSync(${JSON.stringify(marker)}, "forwarded");
  server.close(() => process.exit(0));
});
server.listen(process.env.PORT, process.env.HOSTNAME);`,
  );
  const child = spawnWrapper(item.root, wrapperEnvironment(item));
  try {
    await waitFor(() => canConnect(SUPERVISION_PORT));
    child.kill("SIGTERM");
    const result = await exitResult(child);
    assert.equal(result.code, 0);
    assert.equal(result.signal, null);
    assert.equal(fs.readFileSync(marker, "utf8"), "forwarded");
    await waitFor(async () => !(await canConnect(SUPERVISION_PORT)));
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("terminal SIGINT is forwarded and the wrapper exits by the same signal", async () => {
  await assertPortAvailable(SUPERVISION_PORT);
  const item = fixture();
  writeFixtureServer(
    item,
    `require("node:http").createServer().listen(process.env.PORT, process.env.HOSTNAME);`,
  );
  const child = spawnWrapper(item.root, wrapperEnvironment(item));
  try {
    await waitFor(() => canConnect(SUPERVISION_PORT));
    child.kill("SIGINT");
    const result = await exitResult(child);
    assert.equal(result.code, null);
    assert.equal(result.signal, "SIGINT");
    await waitFor(async () => !(await canConnect(SUPERVISION_PORT)));
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("port conflict fails once without a second child or lost port ownership", async () => {
  await assertPortAvailable(SUPERVISION_PORT);
  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(SUPERVISION_PORT, "127.0.0.1", resolve));
  const item = fixture();
  const marker = path.join(item.root, "starts");
  writeFixtureServer(
    item,
    `require("node:fs").appendFileSync(${JSON.stringify(marker)}, "start\\n");
require("node:http").createServer().listen(process.env.PORT, process.env.HOSTNAME);`,
  );
  try {
    const result = await runWrapper(item.root, wrapperEnvironment(item));
    assert.notEqual(result.code, 0);
    assert.equal(fs.readFileSync(marker, "utf8"), "start\n");
    assert.equal(await canConnect(SUPERVISION_PORT), true);
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    fs.rmSync(item.root, { recursive: true, force: true });
  }
  await assertPortAvailable(SUPERVISION_PORT);
});

test("rejected no-tools startup never spawns Next or opens its listener", async () => {
  const item = fixture();
  const marker = path.join(item.root, "server-started");
  const server = path.join(item.root, ".next", "standalone", "server.js");
  const port = await freePort();
  fs.writeFileSync(
    server,
    `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "started");
require("node:http").createServer((_, response) => response.end("ok")).listen(process.env.PORT, "127.0.0.1");`,
  );
  const base: NodeJS.ProcessEnv = {
    ...process.env,
    CABINET_DATA_DIR: item.data,
    CABINET_RUNTIME_MODE: "hermes",
    CABINET_HERMES_EXECUTION_CLI_PATH: item.cli,
    CABINET_HERMES_PROFILE: "operator-os",
    CABINET_ENV_FILE: item.envFile,
    CABINET_HERMES_INTERVENTIONS_ENABLED: "false",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
  };
  try {
    for (const value of [undefined, "false", "unexpected"]) {
      const env = { ...base };
      if (value === undefined) delete env.CABINET_HERMES_EXECUTION_NO_TOOLS;
      else env.CABINET_HERMES_EXECUTION_NO_TOOLS = value;
      const result = await runWrapper(item.root, env);
      assert.notEqual(result.code, 0);
      assert.match(result.output, /CABINET_HERMES_EXECUTION_NO_TOOLS=true/);
      assert.equal(fs.existsSync(marker), false);
      assert.equal(await canConnect(port), false);
    }
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("invalid environment fails closed without echoing private path values", async () => {
  const item = fixture();
  const privateMissingPath = path.join(item.root, "private-missing-data");
  try {
    const result = await runWrapper(item.root, {
      ...wrapperEnvironment(item),
      CABINET_DATA_DIR: privateMissingPath,
    });
    assert.notEqual(result.code, 0);
    assert.match(result.output, /Cabinet data directory is unavailable/);
    assert.doesNotMatch(result.output, new RegExp(privateMissingPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("enabled interventions fail closed before Next starts", async () => {
  const item = fixture();
  const marker = path.join(item.root, "server-started");
  writeFixtureServer(item, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "started");`);
  try {
    const result = await runWrapper(item.root, {
      ...wrapperEnvironment(item),
      CABINET_HERMES_INTERVENTIONS_ENABLED: "true",
    });
    assert.notEqual(result.code, 0);
    assert.match(result.output, /interventions disabled/);
    assert.equal(fs.existsSync(marker), false);
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("launchd template defines one throttled restart owner with bounded output", () => {
  const template = fs.readFileSync(path.resolve("deploy/macos/ai.cabinet.plist.template"), "utf8");
  assert.match(template, /127\.0\.0\.1/);
  assert.match(template, /CABINET_HERMES_INTERVENTIONS_ENABLED/);
  assert.match(
    template,
    /<key>CABINET_HERMES_EXECUTION_NO_TOOLS<\/key>\s*<string>true<\/string>/,
  );
  assert.match(template, /CABINET_ENV_FILE/);
  assert.match(template, /<key>SuccessfulExit<\/key>\s*<false\/>/);
  assert.match(template, /<key>ThrottleInterval<\/key>\s*<integer>10<\/integer>/);
  assert.equal((template.match(/<key>KeepAlive<\/key>/g) ?? []).length, 1);
  assert.equal((template.match(/<key>ProgramArguments<\/key>/g) ?? []).length, 1);
  assert.equal((template.match(/<string>\/dev\/null<\/string>/g) ?? []).length, 2);
  assert.doesNotMatch(template, /__LOG_DIR__/);
  assert.doesNotMatch(template, /API_KEY|TOKEN|PASSWORD|\/bin\/sh|-c<\/string>/);
});
