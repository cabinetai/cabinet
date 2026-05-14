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
      ? "Quit and relaunch Cabinet to restart the agent daemon."
      : "Run `npm run dev:daemon` (or restart `npm run dev:all`) to bring the agent daemon back up.";

  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[12px] text-amber-700 dark:text-amber-200"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">The agent daemon isn&apos;t responding.</span>
        <span className="ml-2 text-amber-700/80 dark:text-amber-200/80">
          Agents, jobs, and AI requests will fail until it&apos;s back. {fixHint}
        </span>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 rounded p-1 hover:bg-amber-500/20"
        aria-label={t("daemonHealth:dismiss")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
