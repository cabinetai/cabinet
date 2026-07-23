#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOOPBACK = "127.0.0.1";

export function validateSupervisedEnvironment(env, runtimeRoot) {
  const required = [
    "CABINET_DATA_DIR",
    "CABINET_HERMES_EXECUTION_CLI_PATH",
    "CABINET_HERMES_PROFILE",
    "CABINET_ENV_FILE",
    "PORT",
  ];
  for (const name of required) {
    if (!env[name]?.trim()) throw new Error(`Missing supervised Cabinet setting: ${name}`);
  }
  if (env.CABINET_RUNTIME_MODE !== "hermes") {
    throw new Error("Supervised Cabinet requires CABINET_RUNTIME_MODE=hermes");
  }
  if (env.HOSTNAME !== LOOPBACK) {
    throw new Error("Supervised Cabinet requires loopback-only HOSTNAME=127.0.0.1");
  }
  if (env.CABINET_HERMES_INTERVENTIONS_ENABLED?.trim().toLowerCase() === "true") {
    throw new Error("Supervised Cabinet requires Hermes interventions disabled");
  }
  if (env.CABINET_HERMES_EXECUTION_NO_TOOLS !== "true") {
    throw new Error(
      "Supervised Cabinet requires CABINET_HERMES_EXECUTION_NO_TOOLS=true",
    );
  }
  if (!path.isAbsolute(env.CABINET_DATA_DIR) || !path.isAbsolute(env.CABINET_HERMES_EXECUTION_CLI_PATH) || !path.isAbsolute(env.CABINET_ENV_FILE)) {
    throw new Error("Supervised Cabinet paths must be absolute");
  }
  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Supervised Cabinet PORT must be an integer from 1024 to 65535");
  }
  const server = path.join(runtimeRoot, ".next", "standalone", "server.js");
  if (!fs.statSync(server).isFile()) throw new Error("Cabinet production build is missing");
  if (!fs.statSync(env.CABINET_DATA_DIR).isDirectory()) throw new Error("Cabinet data directory is unavailable");
  fs.accessSync(env.CABINET_HERMES_EXECUTION_CLI_PATH, fs.constants.X_OK);
  const envInfo = fs.lstatSync(env.CABINET_ENV_FILE);
  if (!envInfo.isFile() || envInfo.isSymbolicLink()) throw new Error("Cabinet environment file must be a regular file");
  if (typeof process.getuid === "function" && envInfo.uid !== process.getuid()) throw new Error("Cabinet environment file must be user-owned");
  if ((envInfo.mode & 0o077) !== 0) throw new Error("Cabinet environment file must be owner-only");
  return { server, port };
}

export function supervisedChildEnvironment(env) {
  return {
    ...env,
    CABINET_RUNTIME_MODE: "hermes",
    CABINET_HERMES_EXECUTION_NO_TOOLS: "true",
    CABINET_HERMES_INTERVENTIONS_ENABLED: "false",
    HOSTNAME: LOOPBACK,
  };
}

async function main() {
  const runtimeRoot = process.cwd();
  const { server } = validateSupervisedEnvironment(process.env, runtimeRoot);
  const child = spawn(process.execPath, [server], {
    cwd: runtimeRoot,
    env: supervisedChildEnvironment(process.env),
    shell: false,
    stdio: "inherit",
  });
  const forward = (signal) => {
    if (child.exitCode === null) child.kill(signal);
  };
  process.once("SIGTERM", () => forward("SIGTERM"));
  process.once("SIGINT", () => forward("SIGINT"));
  child.once("error", () => { process.exitCode = 1; });
  child.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Cabinet supervised startup failed");
    process.exitCode = 1;
  });
}
