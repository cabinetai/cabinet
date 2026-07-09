// Cloud free/pro tier awareness for the hosted edition. host-agent injects CABINET_TIER and
// CABINET_STORAGE_CAP_MB at container launch (and recreates the container on change). All of this is
// inert unless CABINET_CLOUD === "1", so self-hosted / OSS builds are unaffected.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export function isCloud(): boolean {
  return process.env.CABINET_CLOUD === "1";
}

// Free only when explicitly "free"; anything else (including unset) is pro. Fail open — never block a
// paying tenant because an env var went missing.
export function cabinetTier(): "free" | "pro" {
  return process.env.CABINET_TIER === "free" ? "free" : "pro";
}

/** This cloud tenant should have AI / agent runs disabled. */
export function aiDisabled(): boolean {
  return isCloud() && cabinetTier() === "free";
}

export class TierGateError extends Error {
  readonly errorKind = "tier";
  constructor() {
    super("AI is disabled on the free plan. Upgrade to run agents.");
  }
}
/** Backstop for lib-level run chokepoints; HTTP routes return a 402 directly for nicer client UX. */
export function assertAiAllowed(): void {
  if (aiDisabled()) throw new TierGateError();
}

export function storageCapMb(): number | null {
  const n = Number(process.env.CABINET_STORAGE_CAP_MB);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Pure threshold check (kept separate so it's testable without touching the disk). */
export function isOverCap(usedBytes: number | null, capMb: number | null): boolean {
  if (usedBytes == null || capMb == null) return false;
  return usedBytes >= capMb * 1024 * 1024;
}

const DATA_DIR = process.env.CABINET_DATA_DIR || "/data";
let duCache: { bytes: number; at: number } | null = null;
/** Whole /data usage in bytes (the cap measure), cached ~20s so the meter is live-ish. */
export async function storageUsedBytes(): Promise<number | null> {
  const now = Date.now();
  if (duCache && now - duCache.at < 20_000) return duCache.bytes;
  try {
    const { stdout } = await exec("du", ["-sb", DATA_DIR], { maxBuffer: 1 << 20 });
    const n = parseInt(stdout.split(/\s+/)[0], 10);
    if (Number.isFinite(n)) {
      duCache = { bytes: n, at: now };
      return n;
    }
  } catch {
    /* du unavailable — treat as unknown, never block */
  }
  return null;
}

/** Over the cap → block content writes (reads/exports always stay allowed). Free plan only —
 *  pro cabinets are uncapped (the host-agent du stays a coarse abuse backstop). */
export async function storageOverCap(): Promise<boolean> {
  if (cabinetTier() !== "free") return false;
  return isOverCap(await storageUsedBytes(), storageCapMb());
}
