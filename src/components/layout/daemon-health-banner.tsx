"use client";

import { AlertTriangle, X } from "lucide-react";
import { useLocale } from "@/i18n/use-locale";
import {
  selectShowDaemonDownBanner,
  useHealthStore,
} from "@/stores/health-store";

export function DaemonHealthBanner() {
  const { t } = useLocale();
  const show = useHealthStore(selectShowDaemonDownBanner);
  const installKind = useHealthStore((s) => s.installKind);
  const dismiss = useHealthStore((s) => s.dismissBanner);

  if (!show) return null;

  const fixHint =
    installKind === "electron-macos"
      ? t("chrome:daemon.fixHintElectron")
      : t("chrome:daemon.fixHintDev");

  // Manila Arc: a rounded card floating on the desk, aligned to the content
  // sheet below it (ms-2.5 matches the sheet's inline-start inset; the right
  // edge sits flush to the column like the sheet). Colors come from the
  // theme's `--destructive` semantic token so it adapts to the active theme
  // instead of a hardcoded amber.
  return (
    <div
      role="alert"
      className="ms-2.5 mt-2 mb-1.5 flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/[0.08] px-3.5 py-2.5 text-[12px] text-foreground shadow-sm"
    >
      <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-destructive">{t("chrome:daemon.notResponding")}</span>
        <span className="ms-2 text-muted-foreground">
          {t("chrome:daemon.willFail", { fixHint })}
        </span>
      </div>
      <button
        onClick={dismiss}
        className="-me-1 -mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-foreground"
        aria-label={t("daemonHealth:dismiss")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
