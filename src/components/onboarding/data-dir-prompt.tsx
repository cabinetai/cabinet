"use client";

import { useEffect, useState } from "react";
import { FolderOpen, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showError } from "@/lib/ui/toast";

const FLAG_KEY = "cabinet.dataDirConfirmed";

export function isDataDirConfirmed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(FLAG_KEY) !== null;
  } catch {
    return true;
  }
}

/**
 * Confirms (or replaces) the data dir on first launch.
 *
 * Visibility logic lives at the call site: render this only when
 * `isDataDirConfirmed()` is false AND the wizard hasn't already completed.
 * Existing users are silent-accepted by `app-shell` setting the flag for them.
 */
export function DataDirPrompt({ onConfirmed }: { onConfirmed: () => void }) {
  const [currentDir, setCurrentDir] = useState<string | null>(null);
  const [pendingDir, setPendingDir] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/system/data-dir")
      .then((r) => r.json())
      .then((d) => setCurrentDir(d.dataDir || null))
      .catch(() => setCurrentDir(null));
  }, []);

  const browse = async () => {
    setBrowsing(true);
    try {
      const res = await fetch("/api/system/pick-directory", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (data?.path) setPendingDir(data.path);
    } catch {
      // ignore
    } finally {
      setBrowsing(false);
    }
  };

  const save = async (dir: string | null) => {
    setSaving(true);
    try {
      if (dir && dir !== currentDir) {
        const res = await fetch("/api/system/data-dir", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataDir: dir }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          showError(data?.error || "Failed to save folder.");
          return;
        }
      }
      window.localStorage.setItem(FLAG_KEY, "1");
      onConfirmed();
    } finally {
      setSaving(false);
    }
  };

  const display = pendingDir || currentDir || "Loading…";
  const hasChange = !!pendingDir && pendingDir !== currentDir;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur">
      <div className="max-w-lg w-[92vw] rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
            Where should Cabinet keep your files?
          </h2>
        </div>

        <p className="mb-4 text-[12.5px] text-muted-foreground leading-relaxed">
          Cabinet stores all your cabinets, conversations, and agent files in one
          folder on your computer. Pick where it should live — you can always
          change this later in Settings.
        </p>

        <div className="mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/70 mb-1">
            Folder
          </div>
          <div className="font-mono text-[12px] break-all">{display}</div>
        </div>

        <div className="mb-5 flex items-start gap-2 text-[11.5px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500" />
          <span>
            Everything stays on this device. Cabinet never uploads your files
            anywhere.
          </span>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={browsing || saving}
            onClick={browse}
          >
            {browsing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
            )}
            Choose another folder…
          </Button>
          <div className="flex items-center gap-2">
            {hasChange && (
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => setPendingDir(null)}
              >
                Reset
              </Button>
            )}
            <Button
              size="sm"
              disabled={saving}
              onClick={() => save(hasChange ? pendingDir : null)}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              {hasChange ? "Use this folder" : "Use default"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
