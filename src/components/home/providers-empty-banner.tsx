"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useLocale } from "@/i18n/use-locale";
import { useHermesMode } from "@/hooks/use-cabinet-runtime-mode";

// Loud first-run state: with zero installed+logged-in providers, agents can't
// run at all — that deserves a prominent CTA on the home screen, not just a
// color in the footer status pill. One click opens the setup dialog.
export function ProvidersEmptyBanner() {
  const hermesMode = useHermesMode();
  const { t } = useLocale();
  const openProviderSetup = useAppStore((s) => s.openProviderSetup);
  const setSection = useAppStore((s) => s.setSection);
  const [state, setState] = useState<"loading" | "ok" | "empty">("loading");

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/agents/providers/status", { cache: "no-store" });
        if (!r.ok || !alive) return;
        const data = (await r.json()) as { anyReady?: boolean };
        if (alive) setState(data.anyReady ? "ok" : "empty");
      } catch { /* leave as loading; footer pill still covers it */ }
    };
    void check();
    // Re-check when the tab regains focus (e.g. after installing/logging in).
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; window.removeEventListener("focus", onFocus); };
  }, []);

  if (hermesMode || state !== "empty") return null;

  return (
    <div className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="flex-1 space-y-2">
          <div>
            <p className="text-sm font-medium text-foreground">{t("home:providersEmpty.title")}</p>
            <p className="text-[12px] text-muted-foreground">{t("home:providersEmpty.body")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openProviderSetup("claude-code")}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              {t("home:providersEmpty.cta")}
            </button>
            <button
              onClick={() => setSection({ type: "settings", slug: "providers" })}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
            >
              {t("home:providersEmpty.seeAll")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
