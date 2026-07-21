"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, GitBranch, Loader2, Pencil, Play, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type SessionRow = {
  id: string;
  title: string;
  preview: string;
  startedAt: number;
  messageCount: number;
  source: string;
  projectionId: string | null;
  active: boolean;
  status: string;
  running: boolean;
};

export function HermesSessionManager() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const branchOperations = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/hermes/sessions?${params}`, { cache: "no-store" });
      const data = (await response.json()) as { sessions?: SessionRow[]; error?: string };
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setSessions(data.sessions || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Hermes sessions");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void load(), 180);
    return () => clearTimeout(timer);
  }, [load, open]);

  const act = async (
    session: SessionRow,
    action: "resume" | "rename" | "archive" | "branch"
  ) => {
    const key = `${session.id}:${action}`;
    setBusy(key);
    setError(null);
    try {
      const operationId =
        action === "branch"
          ? (branchOperations.current[session.id] ||= crypto.randomUUID())
          : undefined;
      const response = await fetch("/api/hermes/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          sessionId: session.id,
          title: action === "rename" ? title.trim() : undefined,
          operationId,
        }),
      });
      const data = (await response.json()) as { error?: string; conversationId?: string };
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (action === "branch") delete branchOperations.current[session.id];
      if ((action === "resume" || action === "branch") && data.conversationId) {
        window.location.assign(`/tasks/${encodeURIComponent(data.conversationId)}?cabinetPath=.`);
        return;
      }
      setRenaming(null);
      setTitle("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hermes session action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground">
        Hermes sessions
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Hermes sessions</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground">
          Hermes owns this history. Cabinet searches and resumes it without copying execution state.
          Archive closes a live session while preserving its canonical Hermes history.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" placeholder="Search title, preview, or session ID" />
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">{error}</div> : null}
        <div className="min-h-48 space-y-2 overflow-y-auto pr-1">
          {loading && sessions.length === 0 ? <Loader2 className="mx-auto mt-12 size-5 animate-spin text-muted-foreground" /> : null}
          {!loading && sessions.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No matching Hermes sessions.</p> : null}
          {sessions.map((session) => (
            <article key={session.id} className="space-y-2 rounded-xl border border-border/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {renaming === session.id ? (
                    <div className="flex gap-2">
                      <Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
                      <Button size="sm" disabled={!title.trim() || busy !== null} onClick={() => void act(session, "rename")}>Save</Button>
                    </div>
                  ) : (
                    <div className="truncate text-[13px] font-semibold">{session.title || "Untitled Hermes session"}</div>
                  )}
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{session.preview || "No preview available"}</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">{session.running ? "running" : session.status}</span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
                <span>{session.id}</span><span>{session.messageCount} messages</span><span>{session.source || "Hermes"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy !== null} onClick={() => void act(session, "resume")}><Play /> Resume</Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { setRenaming(session.id); setTitle(session.title); }}><Pencil /> Rename</Button>
                <Button size="sm" variant="outline" disabled={busy !== null || session.running} onClick={() => void act(session, "branch")}><GitBranch /> Branch</Button>
                <Button size="sm" variant="outline" disabled={busy !== null || !session.active || session.running} onClick={() => void act(session, "archive")}><Archive /> Archive</Button>
              </div>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
