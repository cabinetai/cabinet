"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, CircleAlert, RefreshCw, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationDetail, ConversationMeta } from "@/types/conversations";
import { useLocale } from "@/i18n/use-locale";

interface EventLine {
  ts?: string;
  type?: string;
  [key: string]: unknown;
}

export function LogsPanel({
  taskId,
  cabinetPath,
}: {
  taskId: string;
  cabinetPath?: string;
}) {
  const { t } = useLocale();
  const [events, setEvents] = useState<EventLine[] | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [session, setSession] = useState<ConversationDetail["session"] | null>(null);
  const [eventsOpen, setEventsOpen] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams();
    if (cabinetPath) query.set("cabinetPath", cabinetPath);
    query.set("withTurns", "1");
    const qs = `?${query}`;

    fetch(`/api/agents/conversations/${encodeURIComponent(taskId)}/events-log${
      cabinetPath ? `?cabinetPath=${encodeURIComponent(cabinetPath)}` : ""
    }`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: { events?: EventLine[] }) => {
        if (!cancelled) setEvents(data.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });

    fetch(`/api/agents/conversations/${encodeURIComponent(taskId)}${qs}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then(
        (data: {
          rawTranscript?: string;
          meta?: ConversationMeta;
          session?: ConversationDetail["session"];
        }) => {
          if (cancelled) return;
          setTranscript(data.rawTranscript ?? "");
          setMeta(data.meta ?? null);
          setSession(data.session ?? null);
        }
      )
      .catch(() => {
        if (!cancelled) setTranscript("");
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, cabinetPath]);

  return (
    <div className="space-y-4 px-6 py-6">
      {/* Classified error (when present) */}
      {meta?.errorKind ? (
        <section className="rounded-xl border border-destructive/30 bg-destructive/[0.04]">
          <button
            type="button"
            onClick={() => setErrorOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12px] font-medium transition-colors hover:bg-destructive/5"
          >
            {errorOpen ? (
              <ChevronDown className="size-3.5 text-destructive" />
            ) : (
              <ChevronRight className="size-3.5 text-destructive" />
            )}
            <CircleAlert className="size-3.5 text-destructive" />
            <span className="text-destructive">{t("logsPanel:classifiedError")}</span>
            <span className="ml-1 rounded-sm bg-destructive/15 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-destructive">
              {meta.errorKind.replace(/_/g, " ")}
            </span>
          </button>
          {errorOpen ? (
            <div className="space-y-2 border-t border-destructive/20 px-4 py-3 text-[12px]">
              {meta.errorHint ? (
                <p className="leading-relaxed text-destructive/90">{meta.errorHint}</p>
              ) : null}
              {meta.errorRetryAfterSec ? (
                <p className="text-[11px] text-destructive/80">
                  Suggested retry after {meta.errorRetryAfterSec}s.
                </p>
              ) : null}
              {meta.lastResumeAttempt ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Last attempt: <span className="font-medium">{meta.lastResumeAttempt.result}</span>
                  {meta.lastResumeAttempt.reason ? ` — ${meta.lastResumeAttempt.reason}` : ""}
                  {" ("}
                  {new Date(meta.lastResumeAttempt.at).toLocaleTimeString()}
                  {")"}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Session handle */}
      {session ? (
        <section className="rounded-xl border border-border/70 bg-card">
          <div className="flex items-center gap-2 px-4 py-2 text-[12px]">
            <RefreshCw className="size-3.5 text-muted-foreground" />
            <span className="font-medium">{t("logsPanel:session")}</span>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              {session.alive ? "alive" : "dead"}
              {session.displayId ? ` · ${session.displayId}` : ""}
              {session.resumeId && !session.displayId
                ? ` · ${session.resumeId.slice(0, 10)}`
                : ""}
              {" · "}
              {session.kind}
            </span>
          </div>
        </section>
      ) : null}

      {/* Events log */}
      <section className="rounded-xl border border-border/70 bg-card">
        <button
          type="button"
          onClick={() => setEventsOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12px] font-medium transition-colors hover:bg-muted/40"
        >
          {eventsOpen ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
          <ScrollText className="size-3.5 text-muted-foreground" />
          Events
          <span className="ml-1 rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
            {events?.length ?? "…"}
          </span>
        </button>
        {eventsOpen ? (
          <div className="border-t border-border/70 p-3">
            {events === null ? (
              <p className="text-[12px] text-muted-foreground">Loading…</p>
            ) : events.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">{t("logsPanel:noEvents")}</p>
            ) : (
              <ul className="space-y-1">
                {events.map((event, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 font-mono text-[11.5px] leading-relaxed"
                  >
                    <span className="shrink-0 text-muted-foreground/70">
                      {event.ts ? new Date(event.ts).toLocaleTimeString() : ""}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium",
                        event.type === "turn.appended"
                          ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                          : event.type === "turn.updated"
                            ? "bg-violet-500/15 text-violet-700 dark:text-violet-400"
                            : event.type === "task.updated"
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-muted text-muted-foreground"
                      )}
                    >
                      {event.type ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground/75">
                      {formatEventPayload(event)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      {/* Raw transcript */}
      <section className="rounded-xl border border-border/70 bg-card">
        <button
          type="button"
          onClick={() => setTranscriptOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12px] font-medium transition-colors hover:bg-muted/40"
        >
          {transcriptOpen ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
          <ScrollText className="size-3.5 text-muted-foreground" />
          Raw transcript
        </button>
        {transcriptOpen ? (
          <div className="border-t border-border/70 p-3">
            {transcript === null ? (
              <p className="text-[12px] text-muted-foreground">Loading…</p>
            ) : transcript.trim() === "" ? (
              <p className="text-[12px] text-muted-foreground">{t("logsPanel:noTranscript")}</p>
            ) : (
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 font-mono text-[11.5px] leading-relaxed text-foreground/85">
                {transcript}
              </pre>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function formatEventPayload(event: EventLine): string {
  const { ts, type, ...rest } = event;
  void ts;
  void type;
  const keys = Object.keys(rest);
  if (keys.length === 0) return "";
  const parts = keys.map((k) => `${k}=${stringify(rest[k])}`);
  return parts.join(" ");
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
