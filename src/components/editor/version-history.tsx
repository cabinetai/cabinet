"use client";

import { useEffect, useState, useCallback } from "react";
import { History, X, GitCommit, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEditorStore } from "@/stores/editor-store";
import { confirmDialog } from "@/lib/ui/confirm";
import { useLocale } from "@/i18n/use-locale";

interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  author: string;
}

export function VersionHistory() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<GitLogEntry[]>([]);
  const [diff, setDiff] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { currentPath } = useEditorStore();

  const loadHistory = useCallback(async () => {
    if (!currentPath) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/git/log/${currentPath}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    if (open && currentPath) {
      loadHistory();
      setDiff(null);
      setSelectedHash(null);
    }
  }, [open, currentPath, loadHistory]);

  const loadDiff = async (hash: string) => {
    setSelectedHash(hash);
    try {
      const res = await fetch(`/api/git/diff/${hash}`);
      if (res.ok) {
        const data = await res.json();
        setDiff(data.diff);
      }
    } catch {
      setDiff("Failed to load diff");
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!currentPath) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen(!open)}
        title={t("versionHistory:title")}
      >
        <History className="h-4 w-4" />
      </Button>

      {open && (
        <div className="fixed right-0 top-0 bottom-0 w-[400px] bg-background border-l border-border z-40 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4" />
              <span className="text-[13px] font-semibold">{t("versionHistory:title")}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {diff ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <span className="text-xs text-muted-foreground font-mono">
                  {selectedHash?.slice(0, 8)}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={async () => {
                      if (!selectedHash || !currentPath) return;
                      const ok = await confirmDialog({
                        title: "Restore this version?",
                        message: "Current content will be replaced.",
                        confirmText: "Restore",
                        destructive: true,
                      });
                      if (!ok) return;
                      try {
                        const res = await fetch("/api/git/restore", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ hash: selectedHash, pagePath: currentPath }),
                        });
                        if (res.ok) {
                          useEditorStore.getState().loadPage(currentPath);
                          setDiff(null);
                          setSelectedHash(null);
                          loadHistory();
                        }
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      setDiff(null);
                      setSelectedHash(null);
                    }}
                  >
                    Back
                  </Button>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <pre className="p-4 text-[11px] font-mono leading-relaxed whitespace-pre-wrap">
                  {diff.split("\n").map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.startsWith("+") && !line.startsWith("+++")
                          ? "text-green-400 bg-green-500/10"
                          : line.startsWith("-") && !line.startsWith("---")
                          ? "text-red-400 bg-red-500/10"
                          : line.startsWith("@@")
                          ? "text-blue-400"
                          : "text-muted-foreground"
                      }
                    >
                      {line}
                    </div>
                  ))}
                </pre>
              </ScrollArea>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-2">
                {loading ? (
                  <p className="text-[13px] text-muted-foreground text-center py-8">
                    Loading...
                  </p>
                ) : history.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-8">
                    No version history yet
                  </p>
                ) : (
                  history.map((entry) => (
                    <button
                      key={entry.hash}
                      onClick={() => loadDiff(entry.hash)}
                      className="w-full text-left px-3 py-2.5 rounded-md hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <GitCommit className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium truncate">
                            {entry.message}
                          </p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {formatDate(entry.date)} · {entry.hash.slice(0, 7)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </>
  );
}
