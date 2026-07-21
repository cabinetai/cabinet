"use client";

import { AlertTriangle, CircleDot, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { HermesHealthSnapshot } from "@/lib/hermes/types";

type ViewState = "connecting" | HermesHealthSnapshot["status"];

function label(status: ViewState): string {
  switch (status) {
    case "connecting":
      return "Hermes connecting";
    case "online":
      return "Hermes online";
    case "authentication_failure":
      return "Hermes authentication failed";
    case "unavailable_profile":
      return "Hermes profile unavailable";
    case "misconfigured":
      return "Hermes setup incomplete";
    case "offline":
      return "Hermes offline";
  }
}

export function HermesConnectionStatus() {
  const [snapshot, setSnapshot] = useState<HermesHealthSnapshot | null>(null);
  const [connecting, setConnecting] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/hermes/health", { cache: "no-store" });
      const data = (await response.json()) as HermesHealthSnapshot;
      setSnapshot(data);
    } catch {
      setSnapshot({
        enabled: true,
        status: "offline",
        version: null,
        profile: null,
        gatewayState: null,
        checkedAt: new Date().toISOString(),
        message: "Cabinet could not reach the Hermes health bridge.",
      });
    } finally {
      setConnecting(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (snapshot?.enabled === false) return null;

  const state: ViewState = connecting ? "connecting" : snapshot?.status ?? "offline";
  const online = state === "online";
  const failure = state === "offline" || state === "authentication_failure";
  const title = connecting
    ? "Checking Hermes connectivity"
    : [snapshot?.message, snapshot?.version && `Version ${snapshot.version}`, snapshot?.profile && `Profile ${snapshot.profile}`]
        .filter(Boolean)
        .join(" · ");

  return (
    <button
      type="button"
      onClick={() => {
        setConnecting(true);
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
      aria-label={`${label(state)}. ${title}`}
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
      <span className="@max-[920px]:hidden">{label(state)}</span>
    </button>
  );
}
