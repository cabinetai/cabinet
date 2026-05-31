import fs from "fs";
import os from "os";
import path from "path";

export const PROJECT_ROOT = process.cwd();
const DEFAULT_RELEASE_MANIFEST_URL =
  "https://github.com/hilash/cabinet/releases/latest/download/cabinet-release.json";

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

type RuntimePortsState = {
  app?: {
    port?: number;
    origin?: string;
    pid?: number;
    updatedAt?: string;
  };
  daemon?: {
    port?: number;
    origin?: string;
    wsOrigin?: string;
    pid?: number;
    updatedAt?: string;
  };
};

function defaultElectronDataDir(): string {
  // User-visible defaults: Cabinet stores user-owned content (cabinets, docs,
  // conversations), so we put it where users can find and back it up — not in
  // hidden app-data dirs. macOS/Windows → ~/Documents/Cabinet, Linux → ~/Cabinet
  // (Linux distros vary on whether ~/Documents exists; home-root is safer).
  if (process.platform === "darwin" || process.platform === "win32") {
    return path.join(os.homedir(), "Documents", "Cabinet");
  }
  return path.join(os.homedir(), "Cabinet");
}

export function getCabinetRuntime(): "source" | "electron" {
  return process.env.CABINET_RUNTIME === "electron" ? "electron" : "source";
}

export function isElectronRuntime(): boolean {
  return getCabinetRuntime() === "electron";
}

/** Path to the project-root config file that persists settings like dataDir. */
export const INSTALL_CONFIG_PATH = path.join(PROJECT_ROOT, ".cabinet-install.json");

function readPersistedDataDir(): string | null {
  try {
    const raw = fs.readFileSync(INSTALL_CONFIG_PATH, "utf-8");
    const json = JSON.parse(raw);
    const dir = json?.dataDir?.trim();
    return dir || null;
  } catch {
    return null;
  }
}

export function getManagedDataDir(): string {
  // 1. Env var takes highest priority
  const configured = process.env.CABINET_DATA_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }

  // 2. Persisted config file
  const persisted = readPersistedDataDir();
  if (persisted) {
    return path.resolve(persisted);
  }

  // 3. Platform defaults
  if (isElectronRuntime()) {
    return defaultElectronDataDir();
  }

  return path.join(PROJECT_ROOT, "data");
}

function getRuntimePortsPath(): string {
  return path.join(getManagedDataDir(), ".cabinet-state", "runtime-ports.json");
}

function readRuntimePorts(): RuntimePortsState {
  try {
    const raw = fs.readFileSync(getRuntimePortsPath(), "utf-8");
    const parsed = JSON.parse(raw) as RuntimePortsState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getAppPort(): number {
  const runtimePort = readRuntimePorts().app?.port;
  return parsePort(
    process.env.CABINET_APP_PORT || process.env.PORT,
    typeof runtimePort === "number" && Number.isFinite(runtimePort)
      ? runtimePort
      : 4000
  );
}

export function getDaemonPort(): number {
  const runtimePort = readRuntimePorts().daemon?.port;
  return parsePort(
    process.env.CABINET_DAEMON_PORT,
    typeof runtimePort === "number" && Number.isFinite(runtimePort)
      ? runtimePort
      : 4100
  );
}

export function getAppOrigin(): string {
  const runtimeOrigin = normalizeOrigin(readRuntimePorts().app?.origin);
  return (
    normalizeOrigin(process.env.CABINET_APP_ORIGIN) ||
    runtimeOrigin ||
    `http://127.0.0.1:${getAppPort()}`
  );
}

export function getPublicDaemonOrigin(): string {
  const runtimeOrigin = normalizeOrigin(readRuntimePorts().daemon?.origin);
  return (
    normalizeOrigin(process.env.CABINET_PUBLIC_DAEMON_ORIGIN) ||
    runtimeOrigin ||
    `http://127.0.0.1:${getDaemonPort()}`
  );
}

export function getPublicDaemonWsOrigin(): string {
  const runtimeWsOrigin = normalizeOrigin(readRuntimePorts().daemon?.wsOrigin);
  if (runtimeWsOrigin) {
    return runtimeWsOrigin;
  }
  const origin = getPublicDaemonOrigin();
  if (origin.startsWith("ws://") || origin.startsWith("wss://")) {
    return origin;
  }
  if (origin.startsWith("https://")) {
    return origin.replace(/^https:/, "wss:");
  }
  return origin.replace(/^http:/, "ws:");
}

/**
 * Browser-visible daemon WS origin: explicit public override wins; otherwise
 * use the request host with the daemon port so LAN/remote browsers connect to
 * the same hostname they reached the app on.
 */
export function getPublicDaemonWsOriginForRequest(
  request: { headers: Headers } | null | undefined
): string {
  const explicit = normalizeOrigin(process.env.CABINET_PUBLIC_DAEMON_ORIGIN);
  if (explicit) {
    if (explicit.startsWith("ws://") || explicit.startsWith("wss://")) return explicit;
    if (explicit.startsWith("https://")) return explicit.replace(/^https:/, "wss:");
    if (explicit.startsWith("http://")) return explicit.replace(/^http:/, "ws:");
    // Scheme-less value (e.g. "cabinet.example.com") would be rejected by the
    // browser's WebSocket constructor. Treat as malformed and fall through
    // to Host-derived defaulting below.
  }

  const rawHost = request?.headers.get("host")?.trim();
  if (rawHost) {
    try {
      const proto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
      // Use new URL() so IPv6 hosts like "[::1]:4000" parse correctly.
      const url = new URL(`${proto === "https" ? "https" : "http"}://${rawHost}`);
      url.protocol = proto === "https" ? "wss:" : "ws:";
      url.port = String(getDaemonPort());
      url.pathname = "";
      return url.origin;
    } catch {
      // Malformed Host — fall through to loopback fallback.
    }
  }

  return getPublicDaemonWsOrigin();
}

export function getDaemonUrl(): string {
  return (
    normalizeOrigin(process.env.CABINET_DAEMON_URL) ||
    normalizeOrigin(readRuntimePorts().daemon?.origin) ||
    getPublicDaemonOrigin()
  );
}

export function getReleaseManifestUrl(): string {
  return (
    normalizeOrigin(process.env.CABINET_RELEASE_MANIFEST_URL) ||
    DEFAULT_RELEASE_MANIFEST_URL
  );
}
