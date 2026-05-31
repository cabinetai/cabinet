"use client";

import { useState } from "react";
import { AlertTriangle, CloudDownload, FolderOpen, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UpdateCheckResult } from "@/types";
import { useLocale } from "@/i18n/use-locale";

export interface CreateBackupOptions {
  includeEnvKeys?: boolean;
  includeSkills?: boolean;
}

interface UpdateSummaryProps {
  update: UpdateCheckResult;
  loading?: boolean;
  refreshing?: boolean;
  applyPending?: boolean;
  backupPending?: boolean;
  backupPath?: string | null;
  actionError?: string | null;
  onRefresh: () => void;
  onApply: () => Promise<void> | void;
  onCreateBackup: (options: CreateBackupOptions) => Promise<void> | void;
  onOpenDataDir: () => Promise<void> | void;
}

function statusLabel(update: UpdateCheckResult): string {
  const state = update.updateStatus.state;
  if (state === "restart-required") return "Restart required";
  if (state === "failed") return "Update failed";
  if (state === "starting") return "Starting update";
  if (state === "backing-up") return "Creating backup";
  if (state === "downloading") return "Downloading";
  if (state === "applying") return "Applying update";
  if (update.updateAvailable) return "Update available";
  return "Up to date";
}

export function UpdateSummary({
  update,
  loading,
  refreshing,
  applyPending,
  backupPending,
  backupPath,
  actionError,
  onRefresh,
  onApply,
  onCreateBackup,
  onOpenDataDir,
}: UpdateSummaryProps) {
  const { t } = useLocale();
  const state = update.updateStatus.state;
  const [includeEnvKeys, setIncludeEnvKeys] = useState(false);
  const [includeSkills, setIncludeSkills] = useState(false);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CloudDownload className="h-4 w-4" />
            <h3 className="text-sm font-semibold">{t("updateSummary:cabinetUpdates")}</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Current {update.current.version}
            {update.latest ? ` • Latest ${update.latest.version}` : ""}
            {` • ${update.installKind}`}
          </p>
        </div>
        <div className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {loading ? "Checking..." : statusLabel(update)}
        </div>
      </div>

      <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="rounded-lg border border-border/70 bg-background/60 p-3">
          <p className="font-medium text-foreground">{t("updateSummary:dataDirectory")}</p>
          <p className="mt-1 break-all font-mono text-[11px]">{update.dataDir}</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/60 p-3">
          <p className="font-medium text-foreground">{t("updateSummary:backups")}</p>
          <p className="mt-1 break-all font-mono text-[11px]">{update.backupRoot}</p>
        </div>
      </div>

      {update.updateAvailable && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Cabinet is experimental and evolving fast. Keep a copy of your data before updating.
            </p>
          </div>
        </div>
      )}

      {update.instructions.length > 0 && (
        <div className="space-y-2">
          {update.instructions.map((instruction) => (
            <p key={instruction} className="text-xs text-muted-foreground">
              {instruction}
            </p>
          ))}
        </div>
      )}

      {update.dirtyAppFiles.length > 0 && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="font-medium">{t("updateSummaryPlus:dirtyDetected")}</p>
          <p className="mt-1 break-all font-mono text-[11px]">
            {update.dirtyAppFiles.slice(0, 8).join(", ")}
            {update.dirtyAppFiles.length > 8 ? ` +${update.dirtyAppFiles.length - 8} more` : ""}
          </p>
        </div>
      )}

      {(update.updateStatus.message || update.updateStatus.error || backupPath || actionError) && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {update.updateStatus.message && <p>{update.updateStatus.message}</p>}
          {update.updateStatus.backupPath && (
            <p className="break-all font-mono text-[11px]">Backup: {update.updateStatus.backupPath}</p>
          )}
          {backupPath && <p className="break-all font-mono text-[11px]">Latest backup: {backupPath}</p>}
          {update.updateStatus.error && <p className="text-destructive">{update.updateStatus.error}</p>}
          {actionError && <p className="text-destructive">{actionError}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="font-medium uppercase tracking-wide text-[10px] text-muted-foreground/70">
          Backup includes
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeEnvKeys}
            onChange={(e) => setIncludeEnvKeys(e.target.checked)}
            className="h-3.5 w-3.5 accent-foreground"
          />
          <span>
            API keys (<code className="text-[10.5px]">.cabinet.env</code>)
          </span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeSkills}
            onChange={(e) => setIncludeSkills(e.target.checked)}
            className="h-3.5 w-3.5 accent-foreground"
          />
          <span>
            Skills (<code className="text-[10.5px]">.agents/skills/</code>)
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-[12px]"
          onClick={() => {
            onRefresh();
          }}
          disabled={refreshing}
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Check now
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-[12px]"
          onClick={() => {
            void onOpenDataDir();
          }}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Open data folder
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-[12px]"
          onClick={() => {
            void onCreateBackup({ includeEnvKeys, includeSkills });
          }}
          disabled={backupPending}
        >
          {backupPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
          Create backup copy
        </Button>
        {update.canApplyUpdate && state !== "restart-required" && (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
            onClick={() => {
              void onApply();
            }}
            disabled={applyPending}
          >
            {applyPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
            Update now
          </Button>
        )}
      </div>
    </div>
  );
}
