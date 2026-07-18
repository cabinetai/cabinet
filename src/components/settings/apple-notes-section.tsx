"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTreeStore } from "@/stores/tree-store";

const BRAND = "#F2B600";

type Phase = "intro" | "working" | "done" | "error";

interface ImportResult {
  importRoot: string;
  created: number;
  updated: number;
  skipped: number;
  skippedLocked: number;
  attachments: number;
  attachmentsUnavailable?: string;
}

/**
 * Inline Apple Notes import panel — same flow as AppleNotesConnectDialog but
 * rendered directly in the Integrations Hub detail page (no Dialog wrapper).
 */
export function AppleNotesSection() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const loadTree = useTreeStore((s) => s.loadTree);

  const runImport = async () => {
    try {
      setPhase("working");
      setError("");
      setProgress(null);
      const res = await fetch("/api/system/import-apple-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Import failed.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let summary: ImportResult | null = null;
      let streamError: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const evt = JSON.parse(line);
          if (evt.type === "extracted") setProgress({ done: 0, total: evt.total, name: "" });
          else if (evt.type === "progress") setProgress({ done: evt.done, total: evt.total, name: evt.name });
          else if (evt.type === "done") summary = evt.summary as ImportResult;
          else if (evt.type === "error") streamError = evt.message;
        }
      }
      if (streamError) throw new Error(streamError);
      if (!summary) throw new Error("Import ended unexpectedly.");
      await loadTree();
      setResult(summary);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setPhase("error");
    }
  };

  if (phase === "working") {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-6 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-foreground/70" />
        {progress && progress.total > 0 && progress.done > 0 ? (
          <>
            <div className="text-[13px] font-medium text-foreground">
              Importing {progress.done} of {progress.total}…
            </div>
            <div className="h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-foreground/[0.08]">
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%`, background: BRAND }}
              />
            </div>
            <p className="max-w-[200px] truncate text-[11px] text-muted-foreground">{progress.name}</p>
          </>
        ) : (
          <div className="text-[13px] font-medium text-foreground">
            {progress ? `Reading ${progress.total} notes…` : "Reading your Apple Notes…"}
          </div>
        )}
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-4 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <div className="text-[14px] font-semibold text-foreground">
          {result.created + result.updated === 0
            ? "Already up to date"
            : `${result.created} new · ${result.updated} updated`}
        </div>
        {result.skippedLocked > 0 && (
          <p className="text-[12px] text-muted-foreground">{result.skippedLocked} locked notes skipped</p>
        )}
        {result.attachmentsUnavailable === "fda" && (
          <p className="max-w-[220px] text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
            Grant Full Disk Access in System Settings → Privacy & Security to include images.
          </p>
        )}
        <Button
          size="sm"
          className="mt-1 text-black"
          style={{ background: BRAND }}
          onClick={() => { setPhase("intro"); setResult(null); setProgress(null); }}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Re-import
        </Button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex flex-col gap-3">
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/[0.06] p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-[12px] leading-relaxed text-foreground">{error}</p>
        </div>
        <Button size="sm" className="w-full text-black" style={{ background: BRAND }} onClick={runImport}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-background/50 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND }} />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          macOS will ask you to{" "}
          <b className="text-foreground">allow Cabinet to control Notes</b>.
          Nothing is sent anywhere, it stays on this Mac. Re-import any time to pick up changes.
        </p>
      </div>
      <Button className="w-full text-black" style={{ background: BRAND }} onClick={runImport}>
        <Download className="mr-1.5 h-4 w-4" /> Import my notes
      </Button>
    </div>
  );
}
