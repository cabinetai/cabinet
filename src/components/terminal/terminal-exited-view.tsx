"use client";

import { useMemo } from "react";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  PlayCircle,
  ScrollText,
  Terminal as TerminalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationDetail } from "@/types/conversations";
import type { TaskMeta } from "@/types/tasks";
import { useLocale } from "@/i18n/use-locale";

/**
 * Post-exit view for a terminal-mode task. Replaces the raw xterm replay
 * (which is unreadable for TUI agents that redraw heavily — claude-code's
 * animated spinner alone produces hundreds of duplicate "thinking…" lines
 * once ANSI positioning is stripped) with a calm, scannable summary:
 *
 *   - completion time + exit code
 *   - errorKind/errorHint banner if the run failed
 *   - de-duplicated tail of the transcript (run-length compressed — a
 *     spinner frame repeated 300× collapses to one line with "×300")
 *   - "Show raw replay" reveal for power users who want the unfiltered log
 *
 * The component is purely presentational: the parent owns the showRaw
 * state, the detail fetch, and the raw-replay mount (WebTerminal).
 */

interface TerminalExitedViewProps {
  meta: TaskMeta;
  detail: ConversationDetail | null;
  detailLoading: boolean;
  showRaw: boolean;
  onShowRaw: () => void;
  onOpenDetails: () => void;
}

type CompactLine = { text: string; count: number };

function compactTranscript(transcript: string, maxLines: number): CompactLine[] {
  if (!transcript) return [];
  // Normalize carriage returns that didn't get converted by the server-side
  // strip (belt-and-braces).
  const normalized = transcript.replace(/\r\n?/g, "\n");
  const rawLines = normalized.split("\n");
  // Trim trailing whitespace per-line but keep leading structure so small
  // indent in ASCII tables survives.
  const trimmed = rawLines.map((line) => line.replace(/\s+$/g, ""));
  // Drop empty runs at the end.
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }
  // Run-length compress consecutive identical lines. A TUI redrawing
  // "thinking for 30s" every frame collapses to one entry × N.
  const compacted: CompactLine[] = [];
  for (const line of trimmed) {
    const normalizedLine = line.trim();
    const last = compacted[compacted.length - 1];
    if (last && last.text === normalizedLine) {
      last.count += 1;
      continue;
    }
    compacted.push({ text: normalizedLine, count: 1 });
  }
  // Keep the tail — the last N compacted entries, which is where meaningful
  // output (final response, error message) typically lives.
  if (compacted.length <= maxLines) return compacted;
  return compacted.slice(-maxLines);
}

function formatRelative(ts: string | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function formatDurationSec(startIso?: string, endIso?: string): string | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const sec = Math.max(0, Math.round((end - start) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function TerminalExitedView({
  meta,
  detail,
  detailLoading,
  showRaw,
  onShowRaw,
  onOpenDetails,
}: TerminalExitedViewProps) {
  const { t } = useLocale();
  const compacted = useMemo(
    () => compactTranscript(detail?.transcript ?? "", 80),
    [detail?.transcript]
  );
  const hasTranscript = compacted.length > 0;
  // TaskMeta doesn't carry exitCode — pull it from the loaded detail (it's
  // on ConversationMeta). Null before detail loads; the "Session ended"
  // fallback label covers that window.
  const exitCode = detail?.meta.exitCode ?? null;
  const duration = formatDurationSec(meta.startedAt, meta.completedAt);

  // Show a skeleton only while the detail fetch is genuinely in flight.
  // Typical latency is sub-300ms which gives a brief flash; that's
  // acceptable and avoids the lint-flagged effect-driven timer dance.
  const skeletonOn = detailLoading && !detail;

  const statusIcon = meta.errorKind
    ? <CircleX className="size-4 text-rose-400" />
    : exitCode === 0
      ? <CircleCheck className="size-4 text-emerald-400" />
      : exitCode == null
        ? <CircleDashed className="size-4 text-zinc-400" />
        : <CircleAlert className="size-4 text-amber-400" />;
  const statusText = meta.errorKind
    ? "Failed"
    : exitCode === 0
      ? "Exited cleanly"
      : exitCode == null
        ? "Session ended"
        : `Exited with code ${exitCode}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-200">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <header className="flex items-start gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="mt-0.5 shrink-0">{statusIcon}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-[13px] font-semibold text-zinc-100">
                  {statusText}
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                  <Clock className="size-3" />
                  {formatRelative(meta.completedAt ?? meta.lastActivityAt)}
                </span>
                {duration && (
                  <span className="text-[11px] text-zinc-500">· ran {duration}</span>
                )}
                {meta.providerId && (
                  <span
                    className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
                    title={`Provider: ${meta.providerId}`}
                  >
                    {meta.providerId}
                  </span>
                )}
              </div>
              {meta.errorKind && (
                <div className="mt-1.5 rounded border border-rose-900/60 bg-rose-950/40 px-2.5 py-1.5 text-[11.5px] text-rose-200">
                  <div className="font-medium">
                    {meta.errorKind.replace(/_/g, " ")}
                  </div>
                  {meta.errorHint && (
                    <div className="mt-0.5 text-rose-300/90">{meta.errorHint}</div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenDetails}
              className="inline-flex shrink-0 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-800"
              title={t("terminalExited:openDetails")}
            >
              <ScrollText className="size-3.5" />
              View details
            </button>
          </header>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <TerminalIcon className="size-3" />
                Transcript tail
              </h3>
              <button
                type="button"
                onClick={onShowRaw}
                disabled={showRaw}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-40"
                )}
                title={t("terminalExited:reconnect")}
              >
                <PlayCircle className="size-3.5" />
                Show raw replay
              </button>
            </div>
            {!hasTranscript ? (
              skeletonOn ? (
                <div className="h-24 animate-pulse rounded-md border border-zinc-800 bg-zinc-900/40" />
              ) : (
                <div className="rounded-md border border-dashed border-zinc-800 px-3 py-6 text-center text-[12px] text-zinc-500">
                  No transcript captured.
                </div>
              )
            ) : (
              <pre className="max-h-[60vh] overflow-auto whitespace-pre rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 font-mono text-[11.5px] leading-[1.45] text-zinc-300">
                {compacted.map((entry, idx) => (
                  <span key={idx} className="block">
                    {entry.text || " "}
                    {entry.count > 1 && (
                      <span className="ml-2 text-zinc-500">× {entry.count}</span>
                    )}
                  </span>
                ))}
              </pre>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
