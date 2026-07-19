"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  FileDiff,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldCheck,
  TerminalSquare,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  normalizeHermesActivity,
  type HermesDecisionRequest,
  type HermesToolActivity,
} from "@/lib/hermes/activity";
import { cn } from "@/lib/utils";

type EventLine = Record<string, unknown>;

function safeHref(value: string): string | null {
  if (/^https:\/\//i.test(value)) return value;
  if (value.startsWith("/api/")) return value;
  return null;
}

function RuntimeIdentity({ item }: { item: { runId: string | null; eventSeq: number } }) {
  return (
    <span className="font-mono text-[10px] text-muted-foreground">
      {item.runId ? `run ${item.runId.slice(0, 8)} · ` : ""}event {item.eventSeq}
    </span>
  );
}

function ToolCard({
  tool,
  busy,
  onFollowUp,
}: {
  tool: HermesToolActivity;
  busy: boolean;
  onFollowUp: (tool: HermesToolActivity, action: "retry" | "investigate") => void;
}) {
  const [open, setOpen] = useState(tool.status !== "completed");
  const failed = tool.status === "failed";
  return (
    <article className="rounded-xl border border-border/70 bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {tool.status === "running" ? (
          <Loader2 className="size-3.5 animate-spin text-primary" />
        ) : failed ? (
          <X className="size-3.5 text-destructive" />
        ) : (
          <Check className="size-3.5 text-emerald-600" />
        )}
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{tool.name}</span>
        <RuntimeIdentity item={tool} />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border/70 px-3 py-3 text-[12px]">
          {tool.context ? <p className="break-words text-foreground/85">{tool.context}</p> : null}
          {tool.preview ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-[10.5px] text-muted-foreground">
              {tool.preview}
            </pre>
          ) : null}
          {tool.summary ? <p className="break-words text-muted-foreground">{tool.summary}</p> : null}
          {tool.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive">
              {tool.error}
            </div>
          ) : null}
          {tool.inlineDiff ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium">
                <FileDiff className="size-3.5" /> Diff
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-[10.5px]">
                {tool.inlineDiff}
              </pre>
            </div>
          ) : null}
          {tool.artifacts.length || tool.links.length || tool.screenshots.length ? (
            <div className="space-y-1.5">
              {[...tool.artifacts, ...tool.links].map((reference) => {
                const href = safeHref(reference);
                return href ? (
                  <a
                    key={reference}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 break-all text-primary hover:underline"
                  >
                    <LinkIcon className="size-3.5 shrink-0" /> {reference}
                  </a>
                ) : (
                  <div key={reference} className="flex items-center gap-1.5 break-all text-muted-foreground">
                    <LinkIcon className="size-3.5 shrink-0" /> {reference}
                  </div>
                );
              })}
              {tool.screenshots.map((reference) => {
                const href = safeHref(reference);
                return href ? (
                  <a key={reference} href={href} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={href}
                      alt={`Hermes tool evidence from ${tool.name}`}
                      className="max-h-64 rounded-md border border-border object-contain"
                    />
                  </a>
                ) : (
                  <div key={reference} className="break-all text-muted-foreground">Screenshot: {reference}</div>
                );
              })}
            </div>
          ) : null}
          {failed ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {tool.retryable ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onFollowUp(tool, "retry")}>
                  <RefreshCw /> Retry read-only tool
                </Button>
              ) : null}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onFollowUp(tool, "investigate")}>
                <Search /> Investigate
              </Button>
              {!tool.retryable ? (
                <span className="self-center text-[10.5px] text-muted-foreground">
                  Direct retry is disabled for potentially consequential tools.
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function DecisionCard({
  request,
  busy,
  onSubmit,
  onCancelRun,
}: {
  request: HermesDecisionRequest;
  busy: boolean;
  onSubmit: (request: HermesDecisionRequest, input: Record<string, unknown>) => Promise<boolean>;
  onCancelRun: () => void;
}) {
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const active = request.status === "pending" || request.status === "commented";
  const Icon =
    request.kind === "secret"
      ? KeyRound
      : request.kind === "sudo"
        ? TerminalSquare
        : request.kind === "approval"
          ? ShieldCheck
          : MessageSquareText;
  const submitValue = async () => {
    const ok = await onSubmit(request, { action: "submit", value });
    if (ok) setValue("");
  };

  return (
    <article
      className={cn(
        "rounded-xl border p-3",
        active ? "border-amber-500/35 bg-amber-500/[0.04]" : "border-border/70 bg-card"
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-amber-600" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[12px] font-semibold capitalize">{request.kind} request</div>
              <div className="text-[10.5px] text-muted-foreground">{request.risk}</div>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {request.status}
            </span>
          </div>
          {request.question ? <p className="text-[12px]">{request.question}</p> : null}
          {request.prompt ? <p className="text-[12px]">{request.prompt}</p> : null}
          {request.command ? (
            <pre className="overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-2 font-mono text-[10.5px]">
              {request.command}
            </pre>
          ) : null}
          {request.description ? <p className="text-[11px] text-muted-foreground">{request.description}</p> : null}
          {request.envVar ? (
            <div className="text-[11px] text-muted-foreground">
              Destination: <code>{request.envVar}</code>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <RuntimeIdentity item={request} />
            {request.sessionId ? <span className="font-mono">session {request.sessionId.slice(0, 10)}</span> : null}
            {request.requestId ? <span className="font-mono">request {request.requestId.slice(0, 12)}</span> : null}
            {request.expiresAt ? <span>expires {new Date(request.expiresAt).toLocaleTimeString()}</span> : null}
          </div>

          {active && request.kind === "clarification" ? (
            <div className="space-y-2">
              {request.choices.length ? (
                <div className="flex flex-wrap gap-2">
                  {request.choices.map((choice) => (
                    <Button
                      key={choice}
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void onSubmit(request, { action: "answer", answer: choice })}
                    >
                      {choice}
                    </Button>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Answer Hermes" />
                <Button
                  size="sm"
                  disabled={busy || !value.trim()}
                  onClick={() => void onSubmit(request, { action: "answer", answer: value.trim() })}
                >
                  Send
                </Button>
              </div>
            </div>
          ) : null}

          {active && request.kind === "approval" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void onSubmit(request, { action: "approve_once" })}>
                  Approve once
                </Button>
                {request.choices.includes("session") ? (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void onSubmit(request, { action: "approve_session" })}>
                    Approve for session
                  </Button>
                ) : null}
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void onSubmit(request, { action: "reject" })}>
                  Reject
                </Button>
              </div>
              <div className="flex gap-2">
                <Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Comment for Hermes without resolving" />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !comment.trim()}
                  onClick={() => {
                    void onSubmit(request, { action: "comment", comment: comment.trim() }).then((ok) => {
                      if (ok) setComment("");
                    });
                  }}
                >
                  Comment
                </Button>
              </div>
            </div>
          ) : null}

          {active && (request.kind === "secret" || request.kind === "sudo") ? (
            <div className="space-y-2">
              <p className="text-[10.5px] text-muted-foreground">
                This value is sent directly to the exact Hermes request. Cabinet does not save it in the transcript, logs, telemetry, or browser storage. Copy and paste are disabled in this field.
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  onCopy={(event) => event.preventDefault()}
                  onCut={(event) => event.preventDefault()}
                  onPaste={(event) => event.preventDefault()}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={request.kind === "sudo" ? "Sudo password" : "Secret value"}
                />
                <Button size="sm" disabled={busy || !value} onClick={() => void submitValue()}>
                  Submit once
                </Button>
              </div>
            </div>
          ) : null}

          {active ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onCancelRun}>
              <CircleStop /> Cancel pending run
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function HermesActivityPanel({
  conversationId,
  cabinetPath,
  status,
  onChanged,
}: {
  conversationId: string;
  cabinetPath?: string;
  status: string;
  onChanged?: () => void | Promise<void>;
}) {
  const [events, setEvents] = useState<EventLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snapshot = useMemo(() => normalizeHermesActivity(events), [events]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (cabinetPath) params.set("cabinetPath", cabinetPath);
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [cabinetPath]);

  const refresh = useCallback(async () => {
    const response = await fetch(
      `/api/agents/conversations/${encodeURIComponent(conversationId)}/events-log${query}`,
      { cache: "no-store" }
    );
    const data = (await response.json()) as { events?: EventLine[] };
    setEvents(data.events || []);
    setLoading(false);
  }, [conversationId, query]);

  useEffect(() => {
    void refresh().catch(() => setLoading(false));
    const source = new EventSource(
      `/api/agents/conversations/${encodeURIComponent(conversationId)}/events${query}`
    );
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as { type?: string };
        if (event.type === "runtime.event" || event.type === "task.updated") {
          void refresh();
        }
      } catch {
        // Ignore malformed transient frames.
      }
    };
    return () => source.close();
  }, [conversationId, query, refresh]);

  if (!loading && snapshot.tools.length === 0 && snapshot.decisions.length === 0) return null;

  const submitDecision = async (
    request: HermesDecisionRequest,
    input: Record<string, unknown>
  ): Promise<boolean> => {
    setBusyKey(request.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/agents/conversations/${encodeURIComponent(conversationId)}/hermes${query}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: request.kind,
            requestId: request.requestId,
            eventSeq: request.eventSeq,
            ...input,
          }),
        }
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      await refresh();
      await onChanged?.();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hermes response failed");
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const cancelRun = async () => {
    setBusyKey("cancel");
    setError(null);
    try {
      const response = await fetch(
        `/api/agents/conversations/${encodeURIComponent(conversationId)}${query}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop" }),
        }
      );
      if (!response.ok) throw new Error(`Stop failed with HTTP ${response.status}`);
      await refresh();
      await onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not stop the Hermes run");
    } finally {
      setBusyKey(null);
    }
  };

  const followUp = async (tool: HermesToolActivity, action: "retry" | "investigate") => {
    setBusyKey(tool.id);
    setError(null);
    const prompt =
      action === "retry"
        ? `Retry the failed read-only Hermes tool ${tool.name} from run ${tool.runId || "unknown"} after checking current state. Do not repeat consequential actions.`
        : `Investigate the failed Hermes tool ${tool.name} from run ${tool.runId || "unknown"}. Do not retry a consequential action. Explain the cause and safest next step.`;
    try {
      const response = await fetch(
        `/api/agents/conversations/${encodeURIComponent(conversationId)}/continue${query}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userMessage: prompt, cabinetPath }),
        }
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      await onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the Hermes follow-up");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-primary" />
          <div>
            <h4 className="text-[13px] font-semibold">Hermes activity and decisions</h4>
            <p className="text-[10.5px] text-muted-foreground">
              Structured runtime evidence for this conversation. Status: {status}.
            </p>
          </div>
        </div>
        {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {error}
        </div>
      ) : null}
      {snapshot.decisions.map((request) => (
        <DecisionCard
          key={request.id}
          request={request}
          busy={busyKey !== null}
          onSubmit={submitDecision}
          onCancelRun={() => void cancelRun()}
        />
      ))}
      {snapshot.tools.map((tool) => (
        <ToolCard
          key={tool.id}
          tool={tool}
          busy={busyKey !== null}
          onFollowUp={(item, action) => void followUp(item, action)}
        />
      ))}
    </section>
  );
}
