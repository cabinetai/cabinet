"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  ChevronRight,
  FilePen,
  FilePlus,
  FileX,
  FolderInput,
  History,
  Loader2,
  X,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { FileTimeline } from "@/components/history/file-timeline";
import { cn } from "@/lib/utils";

/**
 * Per-room Activity view (PRD §4.5): reverse-chron file mutations with
 * actors. Two panes: the feed on the left; clicking a file opens the SAME
 * FileTimeline used by the Version History panel on the right — commits,
 * vimdiff-style diffs, restore. One design across both surfaces.
 */

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

function opIcon(op: string) {
  switch (op) {
    case "create":
    case "upload":
      return <FilePlus className="h-3.5 w-3.5 text-emerald-500" />;
    case "delete":
      return <FileX className="h-3.5 w-3.5 text-red-500" />;
    case "rename":
    case "move":
      return <FolderInput className="h-3.5 w-3.5 text-blue-500" />;
    default:
      return <FilePen className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ActorFilter = "all" | "user" | "agent";

export function ActivityFeed({ onClose }: { onClose: () => void }) {
  const cabinetPath = useAppStore((s) => s.section.cabinetPath) ?? "";
  const [events, setEvents] = useState<JournalEvent[] | null>(null);
  const [filter, setFilter] = useState<ActorFilter>("all");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(
      `/api/history/activity?cabinetPath=${encodeURIComponent(cabinetPath)}&limit=200`
    )
      .then((res) => res.json())
      .then((data: { events?: JournalEvent[] }) => setEvents(data.events ?? []))
      .catch(() => setEvents([]));
  }, [cabinetPath]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = (events ?? []).filter(
    (e) => filter === "all" || e.actor.kind === filter
  );

  const roomLabel =
    cabinetPath && cabinetPath !== "." ? cabinetPath.split("/").pop() : "home";

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-background/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-[980px] max-w-[96vw] flex-col rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="text-[13px] font-semibold">Activity</span>
            <span className="text-[11px] text-muted-foreground">{roomLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            {(["all", "user", "agent"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={
                  filter === f
                    ? "rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium"
                    : "rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/50"
                }
              >
                {f === "all" ? "All" : f === "user" ? "You" : "Agents"}
              </button>
            ))}
            <Button variant="ghost" size="icon" className="h-7 w-7 ms-1" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* feed */}
          <ScrollArea className={cn("min-h-0", selectedPath ? "w-[44%] border-e border-border" : "flex-1")}>
            <div className="p-2">
              {events === null ? (
                <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading activity…
                </div>
              ) : visible.length === 0 ? (
                <p className="py-10 text-center text-[12px] text-muted-foreground">
                  No recorded file activity in this room yet.
                </p>
              ) : (
                visible.map((e, i) => {
                  const isAgent = e.actor.kind === "agent";
                  const actorLabel = isAgent
                    ? (e.actor as { displayName?: string; slug: string }).displayName ||
                      (e.actor as { slug: string }).slug
                    : (e.actor as { name?: string }).name || "You";
                  const selected = selectedPath === e.path;
                  return (
                    <button
                      key={`${e.ts}-${i}`}
                      type="button"
                      onClick={() => setSelectedPath(selected ? null : e.path)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/40",
                        selected && "bg-accent/60"
                      )}
                    >
                      <span className="mt-0.5 shrink-0">{opIcon(e.op)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px]">
                          <span className="font-medium">{e.path}</span>
                          {e.from ? (
                            <span className="text-muted-foreground"> from {e.from}</span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-medium",
                              isAgent
                                ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            )}
                          >
                            {isAgent ? <Bot className="h-2.5 w-2.5" /> : null}
                            {actorLabel}
                          </span>
                          <span>
                            {e.op} · {formatDate(e.ts)}
                          </span>
                          {e.skipped ? (
                            <span className="opacity-70">(not versioned: {e.skipped})</span>
                          ) : null}
                        </p>
                      </div>
                      <ChevronRight
                        className={cn(
                          "mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40",
                          selected && "rotate-90 transition-transform"
                        )}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* detail: the same timeline + diff surface as Version History */}
          {selectedPath ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                <span className="truncate text-[12px] font-medium">{selectedPath}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setSelectedPath(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <FileTimeline path={selectedPath} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
