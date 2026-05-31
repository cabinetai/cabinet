"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Loader2,
  ScrollText,
  Sparkles,
  User,
  Wrench,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

interface ClaudeTranscriptTurn {
  role: "user" | "assistant";
  uuid: string;
  timestamp?: string;
  text: string;
  toolUses?: Array<{ id?: string; name: string; input?: unknown }>;
}

// Audit #059 + #060: clean up two recurring transcript pathologies
// at render time so existing JSONLs (we don't rewrite Claude's own log)
// still display correctly.
//   - Sub-agent status events sometimes arrive concatenated without line
//     breaks (e.g. "Agent 4 (foo) completed.Agent 1 (bar) done.").
//     Insert a newline before each "Agent <n> (" boundary.
//   - Shell init noise like "running .zshenv 🌸" leaks in when the
//     spawned CLI shells out and the user's ~/.zshenv echoes. The PTY
//     env now suppresses the source (ZDOTDIR=/dev/null), but transcripts
//     captured before that fix still carry the line — strip it from the
//     top of any message text we render.
const SHELL_INIT_NOISE_PATTERNS = [
  /^running\s+\.zshenv[^\n]*\n+/i,
  /^running\s+\.zshrc[^\n]*\n+/i,
  /^running\s+\.bashrc[^\n]*\n+/i,
];

export function normalizeAgentText(text: string): string {
  if (!text) return text;
  let out = text;
  for (const pattern of SHELL_INIT_NOISE_PATTERNS) {
    out = out.replace(pattern, "");
  }
  // Heuristic boundary insert: before any "Agent <number> (" that follows
  // a non-whitespace character, drop a newline. Limited to digits to
  // avoid colliding with prose mentions of "Agent N (" in regular copy.
  out = out.replace(/(\S)(?=Agent \d+ \()/g, "$1\n");
  return out;
}

interface ClaudeTranscriptResponse {
  sessionId: string | null;
  jsonlPath: string | null;
  turns: ClaudeTranscriptTurn[];
  note?: string;
  error?: string;
}

export function ClaudeTranscriptView({
  taskId,
  cabinetPath,
  statusKey,
}: {
  taskId: string;
  cabinetPath?: string;
  /** Changes trigger a refetch (e.g. status flip from running → done). */
  statusKey?: string;
}) {
  const { t } = useLocale();
  const [data, setData] = useState<ClaudeTranscriptResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (cabinetPath) qs.set("cabinetPath", cabinetPath);
    const query = qs.toString();
    fetch(
      `/api/agents/conversations/${encodeURIComponent(taskId)}/claude-transcript${
        query ? `?${query}` : ""
      }`,
      { cache: "no-store" }
    )
      .then(async (res) => {
        const body = (await res.json()) as ClaudeTranscriptResponse;
        if (!res.ok) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        if (!cancelled) setData(body);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, cabinetPath, statusKey]);

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading Claude transcript…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-[12.5px] text-destructive">
        <div className="flex items-center gap-2 font-medium">
          <AlertCircle className="size-4" />
          Transcript unavailable
        </div>
        <p className="mt-1 leading-relaxed">{error}</p>
      </div>
    );
  }

  if (!data || !data.turns.length) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-lg border border-border bg-muted/20 px-4 py-5 text-center text-[12.5px] text-muted-foreground">
        <ScrollText className="mx-auto mb-2 size-5" />
        <p className="font-medium text-foreground">{t("tinyExtras:noTranscript")}</p>
        <p className="mt-1">
          {data?.note ||
            "Claude Code hasn't written a JSONL for this session yet."}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        {data.note ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-300">
            {data.note}
          </div>
        ) : null}
        {data.sessionId ? (
          <div className="font-mono text-[10.5px] text-muted-foreground">
            session {data.sessionId}
          </div>
        ) : null}
        {data.turns.map((turn) => (
          <TurnCard key={turn.uuid} turn={turn} />
        ))}
      </div>
    </ScrollArea>
  );
}

function TurnCard({ turn }: { turn: ClaudeTranscriptTurn }) {
  const isUser = turn.role === "user";
  return (
    <article
      className={cn(
        "rounded-2xl border px-4 py-3",
        isUser
          ? "border-border bg-muted/20"
          : "border-primary/20 bg-background"
      )}
    >
      <header className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {isUser ? (
          <>
            <User className="size-3.5" />
            You
          </>
        ) : (
          <>
            <Sparkles className="size-3.5 text-primary" />
            Claude
          </>
        )}
        {turn.timestamp ? (
          <span className="ml-auto font-mono text-[10px] normal-case tracking-normal">
            {formatTimestamp(turn.timestamp)}
          </span>
        ) : null}
      </header>
      {turn.text ? (
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
          {normalizeAgentText(turn.text)}
        </p>
      ) : null}
      {turn.toolUses?.length ? (
        <div className="mt-2 space-y-1.5">
          {turn.toolUses.map((tool, idx) => (
            <ToolUseRow key={tool.id || idx} tool={tool} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ToolUseRow({
  tool,
}: {
  tool: { id?: string; name: string; input?: unknown };
}) {
  const [open, setOpen] = useState(false);
  const preview = summarizeInput(tool.input);
  return (
    <div className="rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5 text-[11.5px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-muted-foreground hover:text-foreground"
      >
        <Wrench className="size-3" />
        <span className="font-mono text-[11px] text-foreground">{tool.name}</span>
        {preview ? (
          <span className="truncate text-muted-foreground">{preview}</span>
        ) : null}
      </button>
      {open ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-background/70 p-2 text-[11px] leading-relaxed text-foreground/85">
          {JSON.stringify(tool.input, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  for (const key of ["command", "path", "file_path", "url", "query", "pattern"]) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) {
      return val.length > 80 ? val.slice(0, 77) + "…" : val;
    }
  }
  return "";
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}
