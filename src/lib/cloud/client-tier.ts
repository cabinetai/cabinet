"use client";
// Client-side tier check for gating AI runs at the moment of intent (composer Send). Cached from
// /api/cloud/status so it costs at most one request a minute. Inert off-cloud (tier is never "free"
// unless CABINET_CLOUD is set), so self-hosted builds never gate.
import { useEffect, useState } from "react";

export type CloudTier = "free" | "pro";

let cache: {
  cloud: boolean;
  tier: CloudTier;
  free: boolean;
  panelUrl: string | null;
  at: number;
} | null = null;

async function cloudStatus(): Promise<{
  cloud: boolean;
  tier: CloudTier;
  free: boolean;
  panelUrl: string | null;
}> {
  const now = Date.now();
  if (cache && now - cache.at < 60_000) return cache;
  try {
    const r = await fetch("/api/cloud/status", { cache: "no-store" });
    const d = (await r.json()) as { cloud?: boolean; tier?: string; panelUrl?: string | null };
    const cloud = d?.cloud === true;
    const tier: CloudTier = d?.tier === "free" ? "free" : "pro";
    cache = { cloud, tier, free: cloud && tier === "free", panelUrl: d?.panelUrl ?? null, at: now };
  } catch {
    cache = { cloud: false, tier: "pro", free: false, panelUrl: null, at: now };
  }
  return cache;
}

/** Full cached status for render-time consumers (the `useCloudTier` hook). */
export async function cloudTierStatus(): Promise<{
  cloud: boolean;
  tier: CloudTier;
  panelUrl: string | null;
}> {
  const { cloud, tier, panelUrl } = await cloudStatus();
  return { cloud, tier, panelUrl };
}

/**
 * Client twin of `isCloud()` (server tier.ts) for gating desktop-only UI surfaces in the hosted
 * edition. Returns `undefined` until the first /api/cloud/status resolves so callers can avoid a
 * flash of the wrong surface, then `true` only when CABINET_CLOUD is set. Inert off-cloud.
 */
export function useIsCloud(): boolean | undefined {
  const [cloud, setCloud] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void cloudStatus().then((s) => {
      if (alive) setCloud(s.cloud);
    });
    return () => {
      alive = false;
    };
  }, []);
  return cloud;
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
