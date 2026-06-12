"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  FileClock,
  FilePen,
  FilePlus,
  GitCommit,
  HardDrive,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DiffView } from "@/components/history/diff-view";
import { confirmDialog } from "@/lib/ui/confirm";
import { cn } from "@/lib/utils";

/**
 * THE file-history surface (PRD §4.5), shared by the Version History panel
 * and the Activity dialog: one chronological timeline merging
 *   - git commits (attributed: You / agent + room, diff + restore)
 *   - journal events that never reached git (heavy files, foreign repos)
 *   - OS-level anchors (created / last modified on disk)
 * so the timeline is NEVER empty for an existing file.
 */

interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  author: string;
  authorEmail?: string;
  agent?: { cabinetPath: string; slug: string } | null;
  runId?: string | null;
}

interface JournalEvent {
  ts: string;
  op: string;
  path: string;
  from?: string;
  actor:
    | { kind: "user"; id: string; name?: string }
    | {
        kind: "agent";
        slug: string;
        cabinetPath: string;
        conversationId?: string;
        displayName?: string;
      };
  skipped?: string;
}

interface FileStat {
  createdAt: string;
  modifiedAt: string;
  sizeBytes: number;
}

type TimelineEntry =
  | { kind: "commit"; ts: string; commit: GitLogEntry }
  | { kind: "event"; ts: string; event: JournalEvent }
  | { kind: "os"; ts: string; label: string; detail: string };

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ActorChip({
  isAgent,
  label,
  href,
}: {
  isAgent: boolean;
  label: string;
  href?: string | null;
}) {
  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9.5px] font-medium",
        isAgent
          ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      )}
    >
      {isAgent ? <Bot className="h-2.5 w-2.5" /> : null}
      {label}
    </span>
  );
  if (href) {
    return (
      <a href={href} onClick={(e) => e.stopPropagation()} className="hover:opacity-80">
        {chip}
      </a>
    );
  }
  return chip;
}

/** Dedupe journal events that are already represented by a commit (same
 * minute, same actor kind) — the commit entry is richer. Keep skipped ones. */
function dedupeEvents(events: JournalEvent[], commits: GitLogEntry[]): JournalEvent[] {
  return events.filter((e) => {
    if (e.skipped) return true;
    const ts = new Date(e.ts).getTime();
    return !commits.some((c) => Math.abs(new Date(c.date).getTime() - ts) < 90_000);
  });
}

export function FileTimeline({
  path,
  className,
  onRestored,
}: {
  /** DATA_DIR-relative virtual path. */
  path: string;
  className?: string;
  /** Called after a successful restore (e.g. reload the editor). */
  onRestored?: () => void;
}) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/history/file?path=${encodeURIComponent(path)}`);
      const data = (await res.json()) as {
        commits?: GitLogEntry[];
        events?: JournalEvent[];
        stat?: FileStat | null;
      };
      const commits = data.commits ?? [];
      const events = dedupeEvents(data.events ?? [], commits);
      const merged: TimelineEntry[] = [
        ...commits.map((c): TimelineEntry => ({ kind: "commit", ts: c.date, commit: c })),
        ...events.map((e): TimelineEntry => ({ kind: "event", ts: e.ts, event: e })),
      ];
      if (data.stat) {
        const newestKnown = merged.length
          ? Math.max(...merged.map((m) => new Date(m.ts).getTime()))
          : 0;
        // "Modified on disk" only when it's newer than anything recorded —
        // an edit Cabinet didn't see (external editor, agent before capture).
        if (new Date(data.stat.modifiedAt).getTime() > newestKnown + 90_000) {
          merged.push({
            kind: "os",
            ts: data.stat.modifiedAt,
            label: "Modified on disk",
            detail: `outside Cabinet's history · ${formatBytes(data.stat.sizeBytes)}`,
          });
        }
        merged.push({
          kind: "os",
          ts: data.stat.createdAt,
          label: "Created on disk",
          detail: formatBytes(data.stat.sizeBytes),
        });
      }
      merged.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      setEntries(merged);
    } catch {
      setEntries([]);
    }
  }, [path]);

  useEffect(() => {
    setEntries(null);
    setSelectedHash(null);
    setDiff(null);
    void load();
  }, [load]);

  const openDiff = async (hash: string) => {
    if (selectedHash === hash) {
      setSelectedHash(null);
      setDiff(null);
      return;
    }
    setSelectedHash(hash);
    setDiff(null);
    setDiffLoading(true);
    try {
      const res = await fetch(
        `/api/history/diff?hash=${encodeURIComponent(hash)}&path=${encodeURIComponent(path)}`
      );
      const data = (await res.json()) as { diff?: string };
      setDiff(data.diff ?? "");
    } catch {
      setDiff("");
    } finally {
      setDiffLoading(false);
    }
  };

  const restore = async (hash: string) => {
    const ok = await confirmDialog({
      title: "Restore this version?",
      message: "Current content will be replaced (the restore itself is recorded, so you can undo it from this timeline).",
      confirmText: "Restore",
      destructive: true,
    });
    if (!ok) return;
    setRestoring(true);
    try {
      const res = await fetch("/api/git/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash, pagePath: path }),
      });
      if (res.ok) {
        setSelectedHash(null);
        setDiff(null);
        await load();
        onRestored?.();
      }
    } catch {
      // surface stays as-is
    } finally {
      setRestoring(false);
    }
  };

  if (entries === null) {
    return (
      <div className={cn("flex items-center justify-center gap-2 py-10 text-[12px] text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
      </div>
    );
  }

  if (!entries.length) {
    return (
      <p className={cn("py-10 text-center text-[12px] text-muted-foreground", className)}>
        Nothing recorded for this file yet.
      </p>
    );
  }

  return (
    <ScrollArea className={cn("flex-1", className)}>
      <div className="relative px-3 py-3">
        {/* the timeline spine */}
        <div className="absolute top-5 bottom-5 start-[21px] w-px bg-border" aria-hidden="true" />
        {entries.map((entry, i) => {
          if (entry.kind === "os") {
            return (
              <div key={`os-${i}`} className="relative flex items-start gap-2.5 ps-2 py-2">
                <span className="relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <HardDrive className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-muted-foreground">{entry.label}</p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {formatDate(entry.ts)} · {entry.detail}
                  </p>
                </div>
              </div>
            );
          }

          if (entry.kind === "event") {
            const e = entry.event;
            const isAgent = e.actor.kind === "agent";
            const label = isAgent
              ? (e.actor as { displayName?: string; slug: string }).displayName ||
                (e.actor as { slug: string }).slug
              : (e.actor as { name?: string }).name || "You";
            const href =
              isAgent && (e.actor as { conversationId?: string }).conversationId
                ? `#/cabinet/${encodeURIComponent((e.actor as { cabinetPath: string }).cabinetPath || ".")}/tasks/${encodeURIComponent((e.actor as { conversationId?: string }).conversationId!)}`
                : null;
            return (
              <div key={`ev-${i}`} className="relative flex items-start gap-2.5 ps-2 py-2">
                <span className="relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  {e.op === "create" || e.op === "upload" ? (
                    <FilePlus className="h-3 w-3" />
                  ) : (
                    <FilePen className="h-3 w-3" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[12px]">
                    <ActorChip isAgent={isAgent} label={label} href={href} />
                    <span className="text-muted-foreground">{e.op}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {formatDate(e.ts)}
                    {e.skipped ? ` · not versioned (${e.skipped})` : ""}
                  </p>
                </div>
              </div>
            );
          }

          const c = entry.commit;
          const isAgent = c.authorEmail === "agent@cabinet.local" || !!c.agent;
          const isLegacy = c.authorEmail === "kb@cabinet.dev";
          const href =
            isAgent && c.runId && c.agent
              ? `#/cabinet/${encodeURIComponent(c.agent.cabinetPath || ".")}/tasks/${encodeURIComponent(c.runId)}`
              : null;
          const selected = selectedHash === c.hash;
          return (
            <div key={c.hash} className="relative py-1">
              <button
                onClick={() => void openDiff(c.hash)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md ps-2 py-1.5 text-left transition-colors hover:bg-accent/50",
                  selected && "bg-accent/60"
                )}
              >
                <span
                  className={cn(
                    "relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    isAgent
                      ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                  )}
                >
                  <GitCommit className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium">{c.message}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                    {!isLegacy ? (
                      <ActorChip isAgent={isAgent} label={c.author || "You"} href={href} />
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <FileClock className="h-2.5 w-2.5" /> earlier version
                      </span>
                    )}
                    <span>
                      {formatDate(c.date)} · {c.hash.slice(0, 7)}
                    </span>
                  </p>
                </div>
              </button>
              {selected ? (
                <div className="ms-9 mt-1 overflow-hidden rounded-md border border-border bg-muted/30">
                  <div className="flex items-center justify-between border-b border-border/60 px-2 py-1">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {c.hash.slice(0, 8)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 text-[10.5px]"
                      disabled={restoring}
                      onClick={() => void restore(c.hash)}
                    >
                      {restoring ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      Restore
                    </Button>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {diffLoading ? (
                      <div className="flex items-center gap-2 p-3 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading diff…
                      </div>
                    ) : (
                      <DiffView diff={diff ?? ""} />
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
