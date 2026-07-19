import { execFile } from "node:child_process";

export type OpenCliDiagnostics = {
  available: boolean;
  version: string | null;
  daemon: "running" | "stopped" | "unknown";
  extension: "connected" | "disconnected" | "unknown";
  profiles: Array<{ name: string; status: "connected" | "disconnected" | "unknown"; version: string | null }>;
  invocation: "terminal";
  message: string;
};

type Runner = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const DIAGNOSTIC_CACHE_MS = 15_000;
let cachedDiagnostic: { expiresAt: number; value: OpenCliDiagnostics } | null = null;

const defaultRunner: Runner = (command, args) => new Promise((resolve, reject) => {
  execFile(command, args, { timeout: 4_000, maxBuffer: 256_000 }, (error, stdout, stderr) => {
    if (error) { reject(error); return; }
    resolve({ stdout, stderr });
  });
});

export function parseOpenCliDoctor(output: string): OpenCliDiagnostics {
  const version = output.match(/opencli\s+v?([0-9]+(?:\.[0-9]+){1,3})/i)?.[1] ?? null;
  const daemon = /\[OK\]\s+Daemon:\s+running/i.test(output) ? "running" : /Daemon:\s+stopped/i.test(output) ? "stopped" : "unknown";
  const extension = /\[OK\]\s+Extension:\s+connected/i.test(output) ? "connected" : /Extension:\s+disconnected/i.test(output) ? "disconnected" : "unknown";
  const profiles = [...output.matchAll(/^\s*[•*-]\s+([^:\s]+):\s+(connected|disconnected)(?:\s+v?([^\s]+))?/gim)].map((match) => ({
    name: match[1]!,
    status: match[2]!.toLowerCase() as "connected" | "disconnected",
    version: match[3] ?? null,
  }));
  const available = Boolean(version);
  const connected = daemon === "running" && extension === "connected" && profiles.some((profile) => profile.status === "connected");
  return {
    available,
    version,
    daemon,
    extension,
    profiles,
    invocation: "terminal",
    message: connected
      ? `OpenCLI ${version} is available through the enabled Hermes Terminal toolset with ${profiles.filter((profile) => profile.status === "connected").length} connected browser profile.`
      : available
        ? `OpenCLI ${version} is installed, but its browser bridge is not fully connected.`
        : "OpenCLI is not available on the Cabinet server PATH.",
  };
}

export async function readOpenCliDiagnostics(runner: Runner = defaultRunner): Promise<OpenCliDiagnostics> {
  if (runner === defaultRunner && cachedDiagnostic && cachedDiagnostic.expiresAt > Date.now()) {
    return cachedDiagnostic.value;
  }
  try {
    const result = await runner("opencli", ["doctor"]);
    const value = parseOpenCliDoctor(`${result.stdout}\n${result.stderr}`);
    if (runner === defaultRunner) cachedDiagnostic = { expiresAt: Date.now() + DIAGNOSTIC_CACHE_MS, value };
    return value;
  } catch {
    const value: OpenCliDiagnostics = { available: false, version: null, daemon: "unknown", extension: "unknown", profiles: [], invocation: "terminal", message: "OpenCLI is not available on the Cabinet server PATH." };
    if (runner === defaultRunner) cachedDiagnostic = { expiresAt: Date.now() + DIAGNOSTIC_CACHE_MS, value };
    return value;
  }
}
