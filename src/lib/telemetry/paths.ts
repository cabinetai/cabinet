import os from "node:os";
import path from "node:path";

export function getTelemetryDir(): string {
  const override = process.env.CABINET_TELEMETRY_DIR?.trim();
  if (override) return path.resolve(override);

  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "cabinet-telemetry");
  }
  if (process.platform === "win32") {
    const roaming = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(roaming, "cabinet-telemetry");
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdgConfig, "cabinet");
}

export function getStateFilePath(): string {
  return path.join(getTelemetryDir(), "telemetry.json");
}

export function getQueueFilePath(): string {
  return path.join(getTelemetryDir(), "telemetry-queue.ndjson");
}

export function getDrainingDir(): string {
  return path.join(getTelemetryDir(), "draining");
}

export function getSessionFilePath(): string {
  return path.join(getTelemetryDir(), "current-session.json");
}
