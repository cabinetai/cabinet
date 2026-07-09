"use client";
// Client-side tier check for gating AI runs at the moment of intent (composer Send). Cached from
// /api/cloud/status so it costs at most one request a minute. Inert off-cloud (tier is never "free"
// unless CABINET_CLOUD is set), so self-hosted builds never gate.

let cache: { free: boolean; panelUrl: string | null; at: number } | null = null;

async function cloudStatus(): Promise<{ free: boolean; panelUrl: string | null }> {
  const now = Date.now();
  if (cache && now - cache.at < 60_000) return cache;
  try {
    const r = await fetch("/api/cloud/status", { cache: "no-store" });
    const d = (await r.json()) as { cloud?: boolean; tier?: string; panelUrl?: string | null };
    cache = { free: d?.cloud === true && d?.tier === "free", panelUrl: d?.panelUrl ?? null, at: now };
  } catch {
    cache = { free: false, panelUrl: null, at: now };
  }
  return cache;
}

export const UPGRADE_GATE_EVENT = "cabinet:upgrade-gate";

/**
 * If this is a free cloud cabinet, pop the upgrade modal (via a window event the app shell listens
 * for) and return true so the caller can stop before making a run that the server would reject.
 */
export async function gateAiRun(): Promise<boolean> {
  const { free, panelUrl } = await cloudStatus();
  if (free && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UPGRADE_GATE_EVENT, { detail: { panelUrl } }));
    return true;
  }
  return false;
}
