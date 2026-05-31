"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/lib/ui/confirm";
import {
  CLIENT_DATA_LOCATIONS,
  listMatchingLocalStorageKeys,
} from "@/lib/data-locations/client-registry";
import type { DataLocation, DataLocationSnapshot } from "@/lib/data-locations/types";
import { ONBOARDING_RESET_MARKER_KEY } from "@/components/layout/app-shell";
import { useLocale } from "@/i18n/use-locale";

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface ClientRow {
  location: DataLocation;
  matches: string[];
}

export function DataLocationsSection() {
  const { t } = useLocale();
  const [serverRows, setServerRows] = useState<DataLocationSnapshot[] | null>(null);
  const [clientRows, setClientRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/data-locations", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load");
        if (!cancelled) setServerRows(data.locations);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setClientRows(
      CLIENT_DATA_LOCATIONS.map((loc) => ({
        location: loc,
        matches: listMatchingLocalStorageKeys(loc),
      }))
    );
  }, []);

  const reveal = async (absPath: string) => {
    try {
      await fetch("/api/system/open-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: absPath }),
      });
    } catch {
      // ignore — fallback below
    }
  };

  const onboardingRows = CLIENT_DATA_LOCATIONS.filter((l) => l.onboarding);
  const onboardingMatchSummary = onboardingRows
    .map((loc) => {
      const keys = listMatchingLocalStorageKeys(loc);
      return keys.length === 0
        ? null
        : `• ${loc.label} (${keys.length} key${keys.length === 1 ? "" : "s"})`;
    })
    .filter((s): s is string => s !== null)
    .join("\n");

  const handleResetOnboarding = async () => {
    const ok = await confirmDialog({
      title: "Reset onboarding?",
      message:
        "Cabinet will forget that you've completed onboarding and the welcome wizard, and will treat the next launch as a first run. " +
        "Your cabinets, conversations, agents, and data folder will NOT be touched.\n\n" +
        "This will clear:\n" +
        (onboardingMatchSummary ||
          "• (no onboarding flags currently set — nothing to clear)"),
      confirmText: "Reset onboarding",
      cancelText: "Cancel",
      destructive: true,
    });
    if (!ok) return;

    // Set the reset marker BEFORE clearing localStorage. app-shell reads this
    // on the next reload to (a) re-show the data-dir picker and (b) suppress
    // the agents-config self-correction that would otherwise re-write
    // wizard-done="1" within a second and silently undo the reset.
    try {
      window.sessionStorage.setItem(ONBOARDING_RESET_MARKER_KEY, "1");
    } catch {
      // ignore — fall back to best-effort clear-only behavior
    }

    let cleared = 0;
    for (const loc of onboardingRows) {
      const keys = listMatchingLocalStorageKeys(loc);
      for (const k of keys) {
        try {
          window.localStorage.removeItem(k);
          cleared += 1;
        } catch {
          // ignore
        }
      }
    }

    fetch("/api/system/audit-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: `onboarding reset; cleared ${cleared} key(s); dataDir preserved`,
      }),
    }).catch(() => {});

    window.dispatchEvent(
      new CustomEvent("cabinet:toast", {
        detail: {
          kind: "success",
          message: `Reset onboarding — cleared ${cleared} key(s). Reloading…`,
        },
      })
    );

    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <h3 className="text-[14px] font-semibold">{t("dataLocations:title")}</h3>
          <button
            type="button"
            onClick={() => setPrivacyOpen((v) => !v)}
            aria-label={t("dataLocations:whyThisMatters")}
            aria-expanded={privacyOpen}
            title={t("dataLocations:whyThisMatters")}
            className={cn(
              "rounded-full p-0.5 transition-colors cursor-pointer",
              privacyOpen
                ? "text-foreground bg-accent"
                : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/60"
            )}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Cabinet keeps everything on your computer. No cloud, no analytics,
          no shadow copies. Here&apos;s exactly where each piece is stored.
        </p>
        {privacyOpen && (
          <div className="mt-3 rounded-md border border-border/60 bg-muted/30 px-3.5 py-3 text-[12.5px] leading-relaxed">
            <p className="font-medium mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              Why we show you all of this
            </p>
            <p className="text-muted-foreground">
              Privacy and security aren&apos;t features we tack on; they&apos;re
              the default. Most apps treat storage as an implementation detail
              you don&apos;t need to know about. We treat it as a contract:
              every byte Cabinet keeps about your work lives in a place you
              can see, open, back up, copy, or delete yourself. If something
              on this list ever changes, this page changes with it. If we
              ever do start sending something off your machine, it&apos;ll
              show up here clearly marked, before any data leaves.
            </p>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-500">
          {error}
        </div>
      )}

      {serverRows && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">{t("dataLocations:location")}</th>
                <th className="px-3 py-2 font-medium">{t("dataLocations:contains")}</th>
                <th className="px-3 py-2 font-medium w-[100px]">Size</th>
                <th className="px-3 py-2 font-medium w-[100px]">{t("dataLocations:network")}</th>
                <th className="px-3 py-2 font-medium w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {serverRows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-t border-border/60",
                    row.leavesDevice && "bg-amber-500/5"
                  )}
                >
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{row.label}</div>
                    <div className="font-mono text-[11px] text-muted-foreground/80 break-all">
                      {row.pathOrKey}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {row.contains}
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground/80">
                    {row.stats?.exists === false
                      ? "—"
                      : row.stats?.sizeBytes !== undefined
                        ? formatBytes(row.stats.sizeBytes) +
                          (row.stats?.itemCount
                            ? ` · ${row.stats.itemCount} files`
                            : "")
                        : ""}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.leavesDevice ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Globe className="h-3 w-3" /> Network
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <ShieldCheck className="h-3 w-3" /> Local
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {!row.leavesDevice && row.stats?.exists !== false && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        title={t("dataLocations:revealInFinder")}
                        aria-label={t("dataLocations:revealInFinder")}
                        onClick={() => reveal(row.pathOrKey)}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pt-2">
        <button
          type="button"
          onClick={() => setBrowserOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-left text-[12px] hover:bg-muted/40 transition-colors"
          aria-expanded={browserOpen}
        >
          <span className="flex items-center gap-1.5">
            {browserOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="font-medium">Browser storage (localStorage)</span>
            <span className="ml-1 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/80">
              <Code2 className="h-2.5 w-2.5" /> for developers
            </span>
          </span>
          <span className="text-[11px] text-muted-foreground/70">
            {clientRows.length} entries
          </span>
        </button>
        {browserOpen && (
          <div className="mt-2 rounded-lg border border-border overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Key / prefix</th>
                  <th className="px-3 py-2 font-medium">{t("dataLocations:contains")}</th>
                  <th className="px-3 py-2 font-medium w-[110px]">Type</th>
                  <th className="px-3 py-2 font-medium w-[80px]">{t("dataLocations:stored")}</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.map((row) => (
                  <tr key={row.location.id} className="border-t border-border/60">
                    <td className="px-3 py-2 align-top">
                      <div className="font-mono text-[11px]">
                        {row.location.pathOrKey}
                        {row.location.prefix ? "*" : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-muted-foreground">
                      {row.location.contains}
                    </td>
                    <td className="px-3 py-2 align-top text-muted-foreground/80">
                      {row.location.onboarding ? "Onboarding flag" : "Preference"}
                    </td>
                    <td className="px-3 py-2 align-top text-muted-foreground/80">
                      {row.matches.length === 0
                        ? "—"
                        : `${row.matches.length} key${row.matches.length === 1 ? "" : "s"}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-5">
        <h4 className="text-[12.5px] font-medium mb-1">{t("dataLocations:resetOnboarding")}</h4>
        <p className="text-[12px] text-muted-foreground mb-3">
          Wipe the flags that say you&apos;ve seen the welcome wizard, the tour,
          and the per-page intro cards. Cabinet will treat your next launch as
          a first run. Your data folder is left alone.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="text-red-600 border-red-500/40 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
          onClick={handleResetOnboarding}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reset onboarding
        </Button>
      </div>
    </div>
  );
}
