#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOOPBACK = "127.0.0.1";
const SHUTDOWN_GRACE_MS = 10_000;

function requireFile(filePath, message) {
  try {
    if (!fs.statSync(filePath).isFile()) throw new Error();
  } catch {
    throw new Error(message);
  }
}

function requireDirectory(directoryPath, message) {
  try {
    if (!fs.statSync(directoryPath).isDirectory()) throw new Error();
  } catch {
    throw new Error(message);
  }
}

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
  requireFile(server, "Cabinet production build is missing");
  requireDirectory(env.CABINET_DATA_DIR, "Cabinet data directory is unavailable");
  try {
    fs.accessSync(env.CABINET_HERMES_EXECUTION_CLI_PATH, fs.constants.X_OK);
  } catch {
    throw new Error("Hermes execution CLI is unavailable");
  }
  let envInfo;
  try {
    envInfo = fs.lstatSync(env.CABINET_ENV_FILE);
  } catch {
    throw new Error("Cabinet environment file is unavailable");
  }
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

  let finished = false;
  let shutdownTimer;
  const signalHandlers = new Map();
  const removeSignalHandlers = () => {
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
  };
  const finish = (code, signal) => {
    if (finished) return;
    finished = true;
    if (shutdownTimer) clearTimeout(shutdownTimer);
    removeSignalHandlers();
    if (signal) {
      try {
        process.kill(process.pid, signal);
        return;
      } catch {
        process.exit(1);
      }
    }
    process.exit(code ?? 1);
  };
  const forward = (signal) => {
    if (finished || child.exitCode !== null || child.signalCode !== null) return;
    child.kill(signal);
    if (!shutdownTimer) {
      shutdownTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, SHUTDOWN_GRACE_MS);
    }
  };
  for (const signal of ["SIGTERM", "SIGINT"]) {
    const handler = () => forward(signal);
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }
  child.once("error", () => finish(1, null));
  child.once("exit", (code, signal) => {
    finish(code, signal);
  });
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Cabinet supervised startup failed");
    process.exitCode = 1;
  });
}
