"use client";

import { useEffect, useState } from "react";
import { Sparkles, X, ArrowUpRight } from "lucide-react";
import { track } from "@/components/analytics/posthog-provider";
import { UPGRADE_GATE_EVENT } from "@/lib/cloud/client-tier";

// Shown when a free-tier cloud user tries to run an agent — the upsell at the exact moment of
// intent. Mounted once in the app shell; opens on the UPGRADE_GATE_EVENT window event. Inert
// everywhere else (the event only fires for free cloud tenants).
export function CloudUpgradeModal() {
  const [open, setOpen] = useState(false);
  const [panelUrl, setPanelUrl] = useState<string | null>(null);

  useEffect(() => {
    const onGate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { panelUrl?: string | null } | undefined;
      setPanelUrl(detail?.panelUrl ?? null);
      setOpen(true);
      track("ai_gate_shown", { surface: "modal" });
    };
    window.addEventListener(UPGRADE_GATE_EVENT, onGate);
    return () => window.removeEventListener(UPGRADE_GATE_EVENT, onGate);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const href = panelUrl ? `${panelUrl.replace(/\/$/, "")}/billing` : null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "cabinet-upgrade-in .22s cubic-bezier(.2,.8,.2,1) both" }}
      >
        <style>{`@keyframes cabinet-upgrade-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}`}</style>
        <button
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Unlock your AI team</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          Your free cabinet is a full workspace — files, notes, rooms, all yours. AI is paused. Upgrade
          to Pro to let agents run for you 24/7, connect your own Claude, and lift the 20&nbsp;MB cap.
        </p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            Maybe later
          </button>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("upgrade_click", { surface: "modal" })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Upgrade to Pro
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
