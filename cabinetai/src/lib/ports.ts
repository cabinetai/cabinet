import net from "net";
import fs from "fs";
import path from "path";

export function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  // Clamp to non-privileged port range
  if (parsed < 1024 || parsed > 65535) return fallback;
  return parsed;
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailablePort(startPort: number): Promise<number> {
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
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}

export interface RuntimePortEntry {
  port: number;
  origin: string;
  wsOrigin?: string;
  pid: number;
  updatedAt: string;
  cabinetDir?: string;
}

export interface RuntimePorts {
  app?: RuntimePortEntry;
  daemon?: RuntimePortEntry;
}

export function getRuntimePortsPath(cabinetDir: string): string {
  return path.join(cabinetDir, ".cabinet-state", "runtime-ports.json");
}

export function readRuntimePorts(cabinetDir: string): RuntimePorts {
  try {
    return JSON.parse(fs.readFileSync(getRuntimePortsPath(cabinetDir), "utf8"));
  } catch {
    return {};
  }
}

export function writeRuntimePorts(cabinetDir: string, state: RuntimePorts): void {
  const filePath = getRuntimePortsPath(cabinetDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function updateRuntimeService(
  cabinetDir: string,
  service: "app" | "daemon",
  payload: RuntimePortEntry
): void {
  const current = readRuntimePorts(cabinetDir);
  writeRuntimePorts(cabinetDir, {
    ...current,
    [service]: payload,
  });
}

export function clearRuntimeService(
  cabinetDir: string,
  service: "app" | "daemon",
  pid: number
): void {
  const current = readRuntimePorts(cabinetDir);
  const entry = current?.[service];
  if (!entry || (entry.pid && pid && entry.pid !== pid)) return;
  writeRuntimePorts(cabinetDir, {
    ...current,
    [service]: undefined,
  });
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function originResponds(origin: string): Promise<boolean> {
  const normalized = String(origin || "").replace(/\/+$/, "");
  if (!normalized) return false;

  // Only allow requests to localhost origins to prevent SSRF
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(normalized)) return false;
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
