"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { installRendererLogCapture } from "@/lib/log/client";

/**
 * Mounted once in the app shell: installs renderer error capture (PRD §3.3)
 * and, when the last session ended in a crash, shows a small recovery
 * prompt offering the diagnostics export (PRD §3.4).
 */

interface CrashMarker {
  ts: string;
  proc: string;
  message: string;
}

export function DiagnosticsBoot() {
  const [crash, setCrash] = useState<CrashMarker | null>(null);

  useEffect(() => {
    installRendererLogCapture();
    fetch("/api/system/diagnostics")
      .then((res) => res.json())
      .then((data: { crashMarker?: CrashMarker | null }) => {
        if (data?.crashMarker) setCrash(data.crashMarker);
      })
      .catch(() => {});
  }, []);

  if (!crash) return null;

  const dismiss = () => {
    setCrash(null);
    fetch("/api/system/diagnostics", { method: "DELETE" }).catch(() => {});
  };

  return (
    <div className="fixed bottom-4 right-4 z-[170] max-w-sm rounded-lg border border-amber-500/40 bg-card p-3 shadow-lg">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="text-[12px] font-medium">
            Cabinet closed unexpectedly last time
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground break-words">
            {crash.message ? `${crash.proc}: ${crash.message}` : crash.proc}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => {
                window.open("/api/system/diagnostics/export", "_blank");
                dismiss();
              }}
            >
              <Download className="h-3 w-3 me-1" />
              Export diagnostics
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={dismiss}>
              Dismiss
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="rounded-md p-0.5 text-muted-foreground hover:bg-accent"
          onClick={dismiss}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
