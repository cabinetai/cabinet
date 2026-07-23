"use client";

import { AlertTriangle, CircleDot, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { nextHermesHealthPollDelay } from "@/components/layout/hermes-health-polling";
import { hermesHealthDisplay, type HermesHealthDisplay } from "@/lib/hermes/health-status";
import type { HermesHealthSnapshot } from "@/lib/hermes/types";

export function useHermesConnectionStatus(enabled = true): {
  snapshot: HermesHealthSnapshot | null;
  display: HermesHealthDisplay;
  connecting: boolean;
  refresh: () => Promise<void>;
} {
  const [snapshot, setSnapshot] = useState<HermesHealthSnapshot | null>(null);
  const [lastConfirmed, setLastConfirmed] = useState<HermesHealthSnapshot | null>(null);
  const [connecting, setConnecting] = useState(true);
  const inFlight = useRef<Promise<HermesHealthSnapshot> | null>(null);

  const refreshSnapshot = useCallback(async (): Promise<HermesHealthSnapshot> => {
    try {
      const response = await fetch("/api/hermes/health", { cache: "no-store" });
      if (!response.ok) throw new Error("health projection failed");
      const data = (await response.json()) as HermesHealthSnapshot;
      setSnapshot(data);
      if (data.status === "online") setLastConfirmed(data);
      return data;
    } catch {
      const unavailable: HermesHealthSnapshot = {
        enabled: true,
        status: "probe_unavailable",
        version: null,
        profile: null,
        profileSource: null,
        gatewayState: null,
        checkedAt: new Date().toISOString(),
        observationSource: "GET /api/hermes/health",
        message: "Cabinet could not obtain a Hermes health projection.",
      };
      setSnapshot(unavailable);
      return unavailable;
    } finally {
      setConnecting(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (!inFlight.current) {
      inFlight.current = refreshSnapshot().finally(() => {
        inFlight.current = null;
      });
    }
    await inFlight.current;
  }, [enabled, refreshSnapshot]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: number | null = null;
    let consecutiveUnconfirmed = 0;
    const poll = async () => {
      const result = await refreshSnapshot();
      if (cancelled) return;
      consecutiveUnconfirmed =
        result.status === "online" ? 0 : consecutiveUnconfirmed + 1;
      timer = window.setTimeout(
        () => void poll(),
        nextHermesHealthPollDelay(result.status, consecutiveUnconfirmed),
      );
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [enabled, refreshSnapshot]);

  const display = hermesHealthDisplay(connecting ? null : snapshot, lastConfirmed);
  return { snapshot, display, connecting, refresh };
}

export function HermesConnectionStatus({
  controller,
}: {
  controller: ReturnType<typeof useHermesConnectionStatus>;
}) {
  const { snapshot, display, connecting, refresh } = controller;
  if (snapshot?.enabled === false) return null;

  const online = display.tone === "healthy";
  const failure = display.tone === "failure";
  const title = [display.detail, snapshot?.version && `Version ${snapshot.version}`, snapshot?.profile && `Profile ${snapshot.profile}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => {
        void refresh();
      }}
      className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors ${
        connecting
          ? "text-muted-foreground hover:bg-muted/40"
          : online
            ? "text-green-500 hover:bg-green-500/10"
            : failure
              ? "text-red-500 hover:bg-red-500/10"
              : "text-amber-500 hover:bg-amber-500/10"
      }`}
      title={title}
      aria-label={`${display.label}. ${title}`}
      data-hermes-probe-source={display.currentSource}
      data-hermes-probe-observed-at={display.currentObservedAt}
      data-hermes-last-confirmed-at={display.lastConfirmedAt ?? undefined}
    >
      {connecting ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : online ? (
        <CircleDot className="h-3 w-3" aria-hidden="true" />
      ) : failure ? (
        <XCircle className="h-3 w-3" aria-hidden="true" />
      ) : (
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      )}
      <span className="@max-[920px]:hidden">{display.label}</span>
    </button>
  );
}
