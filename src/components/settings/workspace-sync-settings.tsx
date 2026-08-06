"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/i18n/use-locale";
import { showError } from "@/lib/ui/toast";

export function WorkspaceSyncSettings() {
  const { t } = useLocale();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/git/sync/settings", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<{ enabled: boolean }>;
      })
      .then((data) => {
        if (!cancelled) setEnabled(data.enabled);
      })
      .catch(() => {
        if (!cancelled) showError(t("settings:storage.syncLoadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const updateEnabled = useCallback(
    async (next: boolean) => {
      const previous = enabled;
      setEnabled(next);
      setSaving(true);
      try {
        const response = await fetch("/api/git/sync/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { enabled: boolean };
        setEnabled(data.enabled);
      } catch {
        setEnabled(previous);
        showError(t("settings:storage.syncSaveFailed"));
      } finally {
        setSaving(false);
      }
    },
    [enabled, t],
  );

  return (
    <div className="border-t border-border pt-6">
      <h3 className="mb-1 text-[14px] font-semibold">
        {t("settings:storage.automaticSync")}
      </h3>
      <p className="mb-4 text-[12px] text-muted-foreground">
        {t("settings:storage.automaticSyncDescription")}
      </p>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/30">
        <div>
          <span className="text-[13px] font-medium">
            {t("settings:storage.automaticSyncToggle")}
          </span>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("settings:storage.automaticSyncHint")}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          <input
            type="checkbox"
            checked={enabled === true}
            disabled={enabled === null || saving}
            onChange={(event) => void updateEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
        </span>
      </label>
    </div>
  );
}
