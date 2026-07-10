"use client";

import { useEffect, useState } from "react";
import { cloudTierStatus, type CloudTier } from "./client-tier";

export interface CloudTierState {
  isCloud: boolean;
  tier: CloudTier;
  /** Cloud free-tier: AI/agent runs are paused. False until status resolves, so
   *  pro/self-host never flash the gated UI (and never gate at all). */
  aiPaused: boolean;
}

// Render-time companion to gateAiRun(): lets components branch their layout on the
// tenant's tier. Reads the same cached /api/cloud/status, so it costs at most one
// request a minute across the app. Inert off-cloud (aiPaused stays false) — self-hosted
// and pro cloud builds get the default AI-first UI, byte-identical to today.
export function useCloudTier(): CloudTierState {
  const [state, setState] = useState<CloudTierState>({
    isCloud: false,
    tier: "pro",
    aiPaused: false,
  });

  useEffect(() => {
    let cancelled = false;
    void cloudTierStatus().then(({ cloud, tier }) => {
      if (cancelled) return;
      setState({ isCloud: cloud, tier, aiPaused: cloud && tier === "free" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
