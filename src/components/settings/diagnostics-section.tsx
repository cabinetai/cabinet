"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Settings → Diagnostics (PRD §3.4, §4.7): export bundle, verbose logging
 * toggle, observability disk usage with a "compact now" action.
 */

interface DiagnosticsStatus {
  logLevel: string;
  crashMarker: { ts: string; proc: string; message: string } | null;
  files: Array<{ name: string; bytes: number }>;
  sizes: { logsBytes: number; gitBytes: number };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function DiagnosticsSection() {
  const [status, setStatus] = useState<DiagnosticsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [compacting, setCompacting] = useState(false);

  const [historyConfig, setHistoryConfig] = useState<{
    binaryThresholdMB: number;
    journalOnly: boolean;
  } | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/system/diagnostics")
      .then((res) => res.json())
      .then((data: DiagnosticsStatus & { ok?: boolean }) => setStatus(data))
      .catch(() => {});
    fetch("/api/history/config")
      .then((res) => res.json())
      .then((data: { config?: { binaryThresholdMB: number; journalOnly: boolean } }) => {
        if (data.config) setHistoryConfig(data.config);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const patchHistoryConfig = async (patch: {
    binaryThresholdMB?: number;
    journalOnly?: boolean;
  }) => {
    try {
      const res = await fetch("/api/history/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cabinetPath: "", ...patch }),
      });
      const data = (await res.json()) as {
        config?: { binaryThresholdMB: number; journalOnly: boolean };
      };
      if (data.config) setHistoryConfig(data.config);
    } catch {
      // leave as-is
    }
  };

  const verbose = status?.logLevel === "debug";

  const toggleVerbose = async () => {
    if (!status) return;
    setBusy(true);
    try {
      const res = await fetch("/api/system/diagnostics", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level: verbose ? "info" : "debug" }),
      });
      const data = (await res.json()) as { logLevel?: string };
      if (data.logLevel) setStatus({ ...status, logLevel: data.logLevel });
    } catch {
      // leave as-is
    } finally {
      setBusy(false);
    }
  };

  const compact = async () => {
    setCompacting(true);
    try {
      await fetch("/api/history/compact", { method: "POST" });
    } catch {
      // best-effort
    } finally {
      setCompacting(false);
      refresh();
    }
  };

  return (
    <div className="border-t border-border pt-6">
      <h3 className="text-[13px] font-semibold mb-1">Diagnostics</h3>
      <p className="text-[12px] text-muted-foreground mb-3">
        Logs stay on this machine. They leave only when you export them or
        attach them to a feedback report.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.open("/api/system/diagnostics/export", "_blank")}
        >
          <Download className="h-3.5 w-3.5 me-1.5" />
          Export diagnostics
        </Button>
        <Button size="sm" variant="outline" onClick={compact} disabled={compacting}>
          {compacting ? (
            <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5 me-1.5" />
          )}
          Compact now
        </Button>
        <label className="flex items-center gap-2 ms-2 cursor-pointer select-none text-[12px]">
          <input
            type="checkbox"
            checked={verbose}
            disabled={busy || !status}
            onChange={toggleVerbose}
            className="h-3.5 w-3.5 accent-primary"
          />
          Verbose logging
          <span className="text-muted-foreground">(debug level, this session)</span>
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-[12px]">
        <label className="flex items-center gap-2">
          Version small images up to
          <select
            value={String(historyConfig?.binaryThresholdMB ?? 0)}
            disabled={!historyConfig}
            onChange={(e) => void patchHistoryConfig({ binaryThresholdMB: Number(e.target.value) })}
            className="rounded-md border border-border bg-background px-1.5 py-1 text-[12px]"
          >
            <option value="0">off (text only)</option>
            <option value="2">2 MB</option>
            <option value="5">5 MB</option>
          </select>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={historyConfig?.journalOnly ?? false}
            disabled={!historyConfig}
            onChange={(e) => void patchHistoryConfig({ journalOnly: e.target.checked })}
            className="h-3.5 w-3.5 accent-primary"
          />
          History journal only
          <span className="text-muted-foreground">(record who changed what, skip version snapshots)</span>
        </label>
      </div>

      {status ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
          <div className="rounded-md border border-border px-2.5 py-2">
            <div className="text-muted-foreground text-[10.5px] uppercase tracking-wide">
              Logs
            </div>
            <div className="font-medium tabular-nums">
              {formatBytes(status.sizes.logsBytes)}
            </div>
          </div>
          <div className="rounded-md border border-border px-2.5 py-2">
            <div className="text-muted-foreground text-[10.5px] uppercase tracking-wide">
              History (.git)
            </div>
            <div className="font-medium tabular-nums">
              {formatBytes(status.sizes.gitBytes)}
            </div>
          </div>
          <div className="rounded-md border border-border px-2.5 py-2 col-span-2">
            <div className="text-muted-foreground text-[10.5px] uppercase tracking-wide">
              Log level
            </div>
            <div className="font-medium">{status.logLevel}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
