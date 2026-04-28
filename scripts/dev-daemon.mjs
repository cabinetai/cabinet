import fs from "fs";
import net from "net";
import path from "path";
import { spawn } from "child_process";

const PROJECT_ROOT = process.cwd();

function parsePort(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getManagedDataDir() {
  const configured = process.env.CABINET_DATA_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(PROJECT_ROOT, "data");
}

function getRuntimePortsPath() {
  return path.join(getManagedDataDir(), ".cabinet-state", "runtime-ports.json");
}

function readRuntimePorts() {
  try {
    return JSON.parse(fs.readFileSync(getRuntimePortsPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeRuntimePorts(nextState) {
  const filePath = getRuntimePortsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
}

function updateRuntimeService(service, payload) {
  const current = readRuntimePorts();
  writeRuntimePorts({
    ...current,
    [service]: payload,
  });
}

function clearRuntimeService(service, pid) {
  const current = readRuntimePorts();
  const entry = current?.[service];
  if (!entry || (entry.pid && pid && entry.pid !== pid)) {
    return;
  }
  writeRuntimePorts({
    ...current,
    [service]: undefined,
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 200; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }

  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen({ port: 0 }, () => {
      const address = server.address();
      const port =
        typeof address === "object" && address && "port" in address
          ? address.port
          : startPort;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function main() {
  const preferredPort = parsePort(process.env.CABINET_DAEMON_PORT, 4100);
  const port = await findAvailablePort(preferredPort);
  const origin = `http://127.0.0.1:${port}`;
  const wsOrigin = `ws://127.0.0.1:${port}`;

  updateRuntimeService("daemon", {
    port,
    origin,
    wsOrigin,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
  });

  if (port !== preferredPort) {
    console.log(
      `[cabinet] Daemon port ${preferredPort} is busy, using ${port} instead.`
    );
  }

  const tsxCli = path.join(
    PROJECT_ROOT,
    "node_modules",
    "tsx",
    "dist",
    "cli.mjs"
  );
  const child = spawn(
    process.execPath,
    [
      tsxCli,
      "watch",
      "--clear-screen=false",
      "server/cabinet-daemon.ts",
      ...process.argv.slice(2),
    ],
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      env: {
        // Audit #107: dev:all should not report telemetry by default —
        // contributors, CI, and audit pipelines on localhost shouldn't be
        // emitting "anonymous usage" signals. Explicit user opt-in
        // (`CABINET_TELEMETRY_DISABLED=0`) is honored if set; otherwise
        // we default to off in dev. Packaged builds keep their own
        // onboarding prompt.
        CABINET_TELEMETRY_DISABLED: "1",
        ...process.env,
        CABINET_DAEMON_PORT: String(port),
        CABINET_DAEMON_URL: origin,
        CABINET_PUBLIC_DAEMON_ORIGIN: origin,
      },
    }
  );

  const cleanup = () => clearRuntimeService("daemon", process.pid);
  process.on("exit", cleanup);
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));

  child.on("exit", (code, signal) => {
    cleanup();
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error("[cabinet] Failed to start daemon:", error);
  process.exit(1);
});
