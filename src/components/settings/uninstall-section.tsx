"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type CabinetDesktopBridge = {
  runtime: "electron";
  platform: NodeJS.Platform;
  uninstallApp: () => Promise<{ ok: boolean; dataPath?: string; error?: string }>;
};

declare global {
  interface Window {
    CabinetDesktop?: CabinetDesktopBridge;
  }
}

/**
 * Settings → About → Uninstall Optale Observatory (macOS Electron only).
 *
 * Removes the .app bundle, caches, prefs, saved state, web storage, and
 * logs. Does NOT touch user data at `~/Library/Application Support/Optale
 * Observatory/data` — your space content is preserved and the path is shown
 * in the confirmation so you know where to find it.
 */
export function UninstallSection() {
  const [bridge, setBridge] = useState<CabinetDesktopBridge | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const b = window.CabinetDesktop;
    if (b && b.runtime === "electron" && b.platform === "darwin") {
      const timer = window.setTimeout(() => setBridge(b), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  if (!bridge) return null;

  const dataPath = "~/Library/Application Support/Optale Observatory/data";

  const handleUninstall = async () => {
    const ok = window.confirm(
      `Uninstall Optale Observatory?\n\n` +
        `This removes the app from /Applications and clears caches, ` +
        `preferences, saved state, web storage, and logs.\n\n` +
        `Your space content at\n  ${dataPath}\nwill be preserved. ` +
        `Open that folder in Finder if you want to back it up before reinstalling later.\n\n` +
        `Optale Observatory will quit immediately after you confirm.`
    );
    if (!ok) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await bridge.uninstallApp();
      if (!result.ok) {
        setError(result.error || "Uninstall failed.");
        setSubmitting(false);
      }
      // On success, the app quits and a detached shell removes the .app a
      // moment later. Nothing more to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t border-border pt-6">
      <h3 className="text-[14px] font-semibold mb-1">Uninstall Optale Observatory</h3>
      <p className="text-[12px] text-muted-foreground mb-3">
        Remove the Optale Observatory app and Library caches/preferences/state/logs from your
        Mac. Your space content at{" "}
        <span className="font-mono text-[11px] rounded bg-muted px-1 py-0.5">
          {dataPath}
        </span>{" "}
        is <strong>not</strong> deleted — open that folder in Finder if you
        want to back it up before reinstalling.
      </p>
      <Button
        variant="destructive"
        size="sm"
        className="h-8 gap-1.5 text-[12px]"
        disabled={submitting}
        onClick={handleUninstall}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {submitting ? "Uninstalling…" : "Uninstall Optale Observatory"}
      </Button>
      {error && (
        <p className="mt-2 text-[11px] text-destructive">{error}</p>
      )}
    </div>
  );
}
