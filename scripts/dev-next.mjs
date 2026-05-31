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

function getNextDevLockPath() {
  return path.join(PROJECT_ROOT, ".next", "dev", "lock");
}

function readNextDevLock() {
  try {
    const raw = fs.readFileSync(getNextDevLockPath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function originResponds(origin) {
  const normalized = String(origin || "").replace(/\/+$/, "");
  if (!normalized) return false;
  try {
    const response = await fetch(`${normalized}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    try {
      const response = await fetch(`${normalized}/`, {
        method: "HEAD",
        signal: AbortSignal.timeout(1500),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

async function maybeReuseExistingNextDevServer() {
  const lock = readNextDevLock();
  if (!lock?.pid || !lock?.port) return null;

  if (!isProcessAlive(lock.pid)) {
    fs.rmSync(getNextDevLockPath(), { force: true });
    return null;
  }

  const lockOrigin = typeof lock.appUrl === "string" && lock.appUrl.trim()
    ? lock.appUrl.replace(/\/+$/, "")
    : `http://127.0.0.1:${lock.port}`;
  const preferredOrigin = `http://127.0.0.1:${lock.port}`;

  if (await originResponds(lockOrigin) || await originResponds(preferredOrigin)) {
    return {
      pid: lock.pid,
      port: lock.port,
      origin: preferredOrigin,
    };
  }

  return null;
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
  const existingServer = await maybeReuseExistingNextDevServer();
  if (existingServer) {
    updateRuntimeService("app", {
      port: existingServer.port,
      origin: existingServer.origin,
      pid: existingServer.pid,
      updatedAt: new Date().toISOString(),
    });
    console.log(
      `[cabinet] Reusing existing Next dev server at ${existingServer.origin}.`
    );
    return;
  }

  const preferredPort = parsePort(
    process.env.CABINET_APP_PORT || process.env.PORT,
    4000
  );
  const port = await findAvailablePort(preferredPort);
  const origin = `http://127.0.0.1:${port}`;

  updateRuntimeService("app", {
    port,
    origin,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
  });

  if (port !== preferredPort) {
    console.log(
      `[cabinet] App port ${preferredPort} is busy, using ${port} instead.`
    );
  }

  const nextBin = path.join(
    PROJECT_ROOT,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "-p", String(port), ...process.argv.slice(2)],
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      env: {
        // Audit #107: telemetry off by default in dev. Explicit user opt-in
        // via CABINET_TELEMETRY_DISABLED=0 is honored (process.env spread
        // happens after the default).
        CABINET_TELEMETRY_DISABLED: "1",
        // Default CABINET_APP_ORIGIN to loopback, but let process.env spread
        // below override when an operator pinned a public hostname so
        // next.config.ts can auto-allow it through Next 15's dev origin guard.
        CABINET_APP_ORIGIN: origin,
        ...process.env,
        PORT: String(port),
        CABINET_APP_PORT: String(port),
      },
    }
  );

  const cleanup = () => clearRuntimeService("app", process.pid);
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
  console.error("[cabinet] Failed to start Next dev server:", error);
  process.exit(1);
});
