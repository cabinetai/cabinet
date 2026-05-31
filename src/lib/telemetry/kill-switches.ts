import { readState } from "./state";

let cached: boolean | null = null;

export function isTelemetryEnabled(): boolean {
  if (cached !== null) return cached;
  cached = evaluate();
  return cached;
}

export function invalidateKillSwitchCache(): void {
  cached = null;
}

function evaluate(): boolean {
  if (process.env.CABINET_TELEMETRY_DISABLED === "1") return false;
  const state = readState();
  if (state.enabled === false) return false;
  return true;
}
