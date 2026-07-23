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

async function runWrapper(
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; output: string }> {
  const child = spawn(
    process.execPath,
    [path.resolve("scripts/start-cabinet-supervised.mjs")],
    { cwd, env, stdio: "pipe" },
  );
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  const code = await new Promise<number | null>((resolve) => {
    child.once("exit", resolve);
  });
  return { code, output };
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

test("launchd template contains explicit no-tools state, no secrets, and no shell execution", () => {
  const template = fs.readFileSync(path.resolve("deploy/macos/ai.cabinet.plist.template"), "utf8");
  assert.match(template, /127\.0\.0\.1/);
  assert.match(template, /CABINET_HERMES_INTERVENTIONS_ENABLED/);
  assert.match(
    template,
    /<key>CABINET_HERMES_EXECUTION_NO_TOOLS<\/key>\s*<string>true<\/string>/,
  );
  assert.match(template, /CABINET_ENV_FILE/);
  assert.doesNotMatch(template, /API_KEY|TOKEN|PASSWORD|\/bin\/sh|-c<\/string>/);
});
