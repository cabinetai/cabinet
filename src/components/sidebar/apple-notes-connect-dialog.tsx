"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTreeStore } from "@/stores/tree-store";

// Apple Notes' note-paper yellow.
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

const FDA_HINT =
  "Some notes have images. To include them, grant Full Disk Access in System Settings → Privacy & Security → Full Disk Access, then re-import.";

/**
 * Apple Notes import (macOS only). Unlike Notion there's no export file — we
 * read Notes.app directly via macOS automation, so there's no export guide.
 * One screen: explain the permission, import, show what happened. Re-running
 * upserts by note id (the same button doubles as "Re-import").
 */
export function AppleNotesConnectDialog({
  open,
  onOpenChange,
  targetPath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tree path the import lands under. */
  targetPath: string;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);

  const loadTree = useTreeStore((s) => s.loadTree);
  const expandPath = useTreeStore((s) => s.expandPath);
  const selectPage = useTreeStore((s) => s.selectPage);

  const close = () => {
    onOpenChange(false);
    setTimeout(() => {
      setPhase("intro");
      setError("");
      setResult(null);
      setProgress(null);
    }, 200);
  };

  const runImport = async () => {
    try {
      setPhase("working");
      setError("");
      setProgress(null);
      const res = await fetch("/api/system/import-apple-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPath: targetPath || undefined }),
      });
      // Non-streamed error (e.g. non-macOS → 400 JSON).
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Import failed.");
      }

      // Read NDJSON progress: one JSON event per line, terminal done/error.
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
          else if (evt.type === "progress")
            setProgress({ done: evt.done, total: evt.total, name: evt.name });
          else if (evt.type === "done") summary = evt.summary as ImportResult;
          else if (evt.type === "error") streamError = evt.message;
        }
      }
      if (streamError) throw new Error(streamError);
      if (!summary) throw new Error("Import ended unexpectedly.");

      if (targetPath) expandPath(targetPath);
      await loadTree();
      setResult(summary);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setPhase("error");
    }
  };

  const openImported = () => {
    if (result?.importRoot) selectPage(result.importRoot);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Apple Notes</DialogTitle>
          <DialogDescription>
            Bring your Apple Notes in as editable Markdown: offline, searchable,
            and available to agents. This reads Notes directly on your Mac.
          </DialogDescription>
        </DialogHeader>

        {phase === "intro" && (
          <div className="flex flex-col gap-4 py-1">
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card/40 p-4">
              <span
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground"
                style={{ background: `${BRAND}22` }}
              >
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                macOS will ask you to <b className="text-foreground">allow Cabinet to control Notes</b>.
                Click OK. Locked (password-protected) notes are skipped. Importing
                images also needs Full Disk Access. Nothing is sent anywhere, it
                stays on this Mac.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button onClick={runImport} style={{ background: BRAND }} className="text-black">
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Import my notes
              </Button>
            </div>
          </div>
        )}

        {phase === "working" && (
          <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-foreground/70" aria-hidden="true" />
            {progress && progress.total > 0 && progress.done > 0 ? (
              <>
                <div className="text-[14px] font-medium text-foreground">
                  Importing {progress.done} of {progress.total}…
                </div>
                <div className="h-1.5 w-56 overflow-hidden rounded-full bg-foreground/[0.08]">
                  <div
                    className="h-full rounded-full transition-[width] duration-200"
                    style={{
                      width: `${Math.round((progress.done / progress.total) * 100)}%`,
                      background: BRAND,
                    }}
                  />
                </div>
                <p className="h-4 max-w-xs truncate text-[12px] text-muted-foreground">
                  {progress.name}
                </p>
              </>
            ) : (
              <>
                <div className="text-[14px] font-medium text-foreground">
                  {progress ? `Reading ${progress.total} notes…` : "Reading your Apple Notes…"}
                </div>
                <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                  A large library can take a moment. If macOS prompts for permission,
                  click OK to continue.
                </p>
              </>
            )}
          </div>
        )}

        {phase === "done" && result && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-9 w-9 text-emerald-500" aria-hidden="true" />
            <div className="text-[15px] font-semibold text-foreground">
              {result.created + result.updated === 0
                ? "Everything was already up to date"
                : `Imported ${result.created} new, updated ${result.updated}`}
            </div>
            <p className="text-[13px] text-muted-foreground">
              In <span className="font-medium text-foreground">{result.importRoot}</span>
              {result.attachments > 0 && ` · ${result.attachments} attachments`}
              {result.skippedLocked > 0 && ` · ${result.skippedLocked} locked skipped`}.
            </p>
            {result.attachmentsUnavailable === "fda" && (
              <p className="max-w-sm text-[12px] leading-relaxed text-amber-600 dark:text-amber-400">
                {FDA_HINT}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <Button variant="ghost" onClick={close}>
                Done
              </Button>
              <Button onClick={openImported} style={{ background: BRAND }} className="text-black">
                Open
              </Button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col gap-4 py-4">
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/[0.06] p-3"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              <p className="text-[13px] leading-relaxed text-foreground">{error}</p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
              <Button onClick={runImport} style={{ background: BRAND }} className="text-black">
                <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
