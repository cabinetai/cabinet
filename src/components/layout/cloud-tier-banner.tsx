"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { track } from "@/components/analytics/posthog-provider";

// Hosted-edition free-tier affordance: a free cabinet is a real, full workspace with AI paused and
// a storage cap. This is the in-app conversion surface — an enticing (not naggy) upgrade nudge plus
// a live storage meter. Renders nothing outside cloud mode, and nothing for pro cabinets under 90%
// storage, so it's inert for every local/desktop install and quiet for paying users.

interface CloudStatus {
  cloud: boolean;
  tier?: "free" | "pro";
  panelUrl: string | null;
  storageCapMb?: number | null;
  storageUsedBytes?: number | null;
}

export function CloudTierBanner() {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const shown = useRef(false);
  const warned = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/cloud/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as CloudStatus;
        if (!cancelled) setStatus(data);
      } catch {
        /* not cloud / offline — stay hidden */
      }
    };
    void check();
    const id = setInterval(check, 30_000); // keep the meter live-ish
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const free = status?.cloud && status.tier === "free";
  const cap = status?.storageCapMb ?? null;
  const used = status?.storageUsedBytes ?? null;
  const pct = cap && used != null ? Math.min(100, Math.round((used / (cap * 1024 * 1024)) * 100)) : null;

  useEffect(() => {
    if (free && !shown.current) {
      shown.current = true;
      track("ai_gate_shown", { surface: "banner" });
    }
    if (pct != null && pct >= 90 && !warned.current) {
      warned.current = true;
      track("storage_warn", { pct });
    }
  }, [free, pct]);

  // Show for free cabinets, or for anyone who's near their storage cap.
  if (!status || !status.cloud) return null;
  const nearCap = pct != null && pct >= 90;
  if (!free && !nearCap) return null;

  const upgradeHref = status.panelUrl ? `${status.panelUrl.replace(/\/$/, "")}/billing` : null;
  const meterTone = pct == null ? "" : pct >= 100 ? "bg-destructive" : pct >= 90 ? "bg-amber-500" : "bg-primary";

  return (
    <div
      role="status"
      className="ms-2.5 mt-2 mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-3.5 py-2.5 text-[12px] text-foreground shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 ease-out"
    >
      {/* Sparkle + copy as one group that takes the full width on mobile, so the meter + Upgrade
          button wrap to their own row below instead of crushing the text one-word-per-line. */}
      <div className="flex w-full items-center gap-2.5 min-w-0 sm:w-auto sm:flex-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/cloud/sparkles.png"
          alt=""
          className="h-[18px] w-[18px] shrink-0 object-contain"
        />
        <div className="min-w-0">
          {free ? (
            <>
              <span className="font-medium">Free plan · AI is paused</span>
              <span className="ms-2 text-muted-foreground">
                Upgrade to run agents{cap ? ` and lift the ${cap} MB cap` : ""}.
              </span>
            </>
          ) : (
            <span className="font-medium">
              {pct != null && pct >= 100 ? "Storage full. Writes are paused." : "You're almost out of storage."}
            </span>
          )}
        </div>
      </div>

      <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
        {cap != null && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${meterTone}`}
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {used != null ? (used / (1024 * 1024)).toFixed(1) : "–"}/{cap} MB
            </span>
          </div>
        )}

        {upgradeHref && (
          <a
            href={upgradeHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("upgrade_click", { surface: "banner" })}
            className="-my-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Upgrade
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}
