"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  HeartPulse,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CockpitAction,
  CockpitCard,
  CockpitCardKind,
  CockpitSourceCoverage,
  DailyBusinessCockpit,
} from "@/lib/hermes/cockpit-types";

type LoadingState = { key: string; label: string } | null;

const SECTION_META: Record<CockpitCardKind, { title: string; description: string; icon: typeof Target }> = {
  needs_jeremy: { title: "Needs Jeremy", description: "Decisions and exceptions that need your judgment.", icon: ShieldCheck },
  business_risk: { title: "Business Risks", description: "Material risks with evidence and a recommended next step.", icon: AlertTriangle },
  todays_mission: { title: "Today's Mission", description: "The smallest set of outcomes worth protecting today.", icon: Target },
  recent_win: { title: "Recent Wins", description: "Verified outcomes, not an activity feed.", icon: Trophy },
};

const ACTION_LABELS: Record<CockpitAction, string> = {
  investigate: "Investigate",
  draft_response: "Draft response",
  approve: "Approve",
  reject: "Reject",
  comment: "Comment",
  snooze: "Snooze",
  schedule: "Schedule",
  ask_why: "Ask why",
};

function key(prefix: string): string {
  return `${prefix}:${Date.now()}:${crypto.randomUUID()}`;
}

function formatTime(value: string | null): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function coverageTone(status: CockpitSourceCoverage["gmail"]["status"]): string {
  if (status === "connected") return "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300";
  if (status === "partial") return "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted/30 text-muted-foreground";
}

function Card({ card, runs, busy, nowMs, onAction }: {
  card: CockpitCard;
  runs: DailyBusinessCockpit["runs"];
  busy: LoadingState;
  nowMs: number;
  onAction: (action: CockpitAction, card: CockpitCard) => Promise<void>;
}) {
  const associated = runs.find((run) => run.context.includes(`cockpit:card:${card.id}:`));
  const snoozed = card.snoozedUntil && new Date(card.snoozedUntil).getTime() > nowMs;
  const pending = card.approval.state === "pending" && card.approval.runId && card.approval.requestId;
  return (
    <article className={cn("rounded-xl border bg-card p-4 shadow-sm", snoozed && "opacity-60")} data-testid={`cockpit-card-${card.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              card.urgency === "critical" ? "bg-red-500/10 text-red-700 dark:text-red-300" :
                card.urgency === "high" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"
            )}>{card.urgency}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{card.sourceType.replace("_", " ")}</span>
            {snoozed ? <span className="text-[10px] text-muted-foreground">Snoozed until {formatTime(card.snoozedUntil)}</span> : null}
          </div>
          <h3 className="mt-2 text-sm font-semibold text-foreground">{card.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.summary}</p>
        </div>
        <div className={cn("size-2 shrink-0 rounded-full", card.approval.state === "pending" ? "bg-amber-500" : "bg-emerald-500/70")} title={`Approval: ${card.approval.state}`} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/35 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Why it matters</p><p className="mt-1 text-xs leading-relaxed">{card.whyItMatters}</p></div>
        <div className="rounded-lg bg-muted/35 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recommended next step</p><p className="mt-1 text-xs leading-relaxed">{card.recommendedNextStep}</p></div>
      </div>
      {card.evidence.length ? <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted-foreground">Evidence ({card.evidence.length})</summary><ul className="mt-2 space-y-1.5 border-s border-border ps-3">{card.evidence.map((item, index) => <li key={`${item.reference}-${index}`}><span className="font-medium text-foreground">{item.label}</span><span className="ms-2 text-muted-foreground">{item.reference}</span>{item.occurredAt ? <span className="ms-2 text-muted-foreground">{formatTime(item.occurredAt)}</span> : null}</li>)}</ul></details> : null}
      {associated ? <div className="mt-3 rounded-lg border border-primary/15 bg-primary/5 p-3" data-testid="cockpit-action-result"><div className="flex items-center gap-2 text-xs font-medium"><span className={cn("size-2 rounded-full", associated.status === "completed" ? "bg-emerald-500" : associated.status === "failed" ? "bg-red-500" : "bg-blue-500 animate-pulse")} />Hermes {associated.status.replaceAll("_", " ")}</div>{associated.result ? <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{associated.result}</p> : null}{associated.error ? <p className="mt-2 text-xs text-destructive">{associated.error}</p> : null}</div> : null}
      {card.comments.length ? <div className="mt-3 space-y-2">{card.comments.map((comment) => <div key={comment.id} className="rounded-md border-s-2 border-primary/30 ps-3 text-xs"><p>{comment.body}</p><p className="mt-1 text-[10px] text-muted-foreground">{comment.actor}, {formatTime(comment.createdAt)}</p></div>)}</div> : null}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {(["investigate", "draft_response", "ask_why", "comment", "snooze", "schedule"] as CockpitAction[]).map((action) => <Button key={action} size="sm" variant="outline" className="h-7 text-[11px]" disabled={busy !== null} onClick={() => void onAction(action, card)}>{busy?.key === `${card.id}:${action}` ? <Loader2 className="me-1 size-3 animate-spin" /> : null}{ACTION_LABELS[action]}</Button>)}
        <Button size="sm" variant="outline" className="h-7 text-[11px] text-emerald-700 dark:text-emerald-300" disabled={!pending || busy !== null} onClick={() => void onAction("approve", card)}>Approve</Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px] text-destructive" disabled={!pending || busy !== null} onClick={() => void onAction("reject", card)}>Reject</Button>
      </div>
    </article>
  );
}

export function DailyBusinessCockpit() {
  const [cockpit, setCockpit] = useState<DailyBusinessCockpit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<LoadingState>(null);
  const [riskOpen, setRiskOpen] = useState(false);
  const [risk, setRisk] = useState({ title: "", whyItMatters: "", recommendedNextStep: "", urgency: "normal" });
  const viewed = useRef(false);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/hermes/cockpit", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Daily Business Intake is unavailable.");
      setCockpit(body as DailyBusinessCockpit);
      setError(null);
    } catch (refreshError) { setError(refreshError instanceof Error ? refreshError.message : "Daily Business Intake is unavailable."); }
    finally { if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    if (!viewed.current) {
      viewed.current = true;
      void fetch("/api/hermes/cockpit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "viewed", actor: "Jeremy" }) });
    }
  }, [refresh]);

  useEffect(() => {
    if (!cockpit?.runs.some((run) => ["queued", "running", "waiting_for_approval", "stopping"].includes(run.status))) return;
    const timer = window.setInterval(() => void refresh(true), 2_000);
    return () => window.clearInterval(timer);
  }, [cockpit?.runs, refresh]);

  const grouped = useMemo(() => {
    const result: Record<CockpitCardKind, CockpitCard[]> = {
      needs_jeremy: [],
      business_risk: [],
      todays_mission: [],
      recent_win: [],
    };
    for (const card of cockpit?.cards ?? []) result[card.kind].push(card);
    return result;
  }, [cockpit?.cards]);

  async function startIntake() {
    setBusy({ key: "intake", label: "Running intake" });
    try {
      const response = await fetch("/api/hermes/cockpit/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: key("daily-intake"), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Vancouver" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Daily intake failed to start.");
      await refresh(true);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Daily intake failed to start."); }
    finally { setBusy(null); }
  }

  async function onAction(action: CockpitAction, card: CockpitCard) {
    const payload: Record<string, unknown> = { action, cardId: card.id, actor: "Jeremy", idempotencyKey: key(`cockpit-${action}`), confirmed: false };
    if (action === "comment") { const body = window.prompt("Add an operator comment"); if (!body?.trim()) return; payload.body = body.trim(); }
    if (action === "snooze") { const until = window.prompt("Snooze until (ISO date/time)", new Date(Date.now() + 86_400_000).toISOString()); if (!until) return; payload.until = until; }
    if (action === "schedule") { const schedule = window.prompt("Hermes cron schedule", "0 9 * * 1-5"); if (!schedule) return; if (!window.confirm(`Create a canonical Hermes job with schedule ${schedule}?`)) return; payload.schedule = schedule; payload.confirmed = true; }
    if (action === "approve" || action === "reject") { if (!card.approval.runId || !card.approval.requestId || !window.confirm(`${ACTION_LABELS[action]} the exact pending Hermes request?`)) return; payload.runId = card.approval.runId; payload.requestId = card.approval.requestId; payload.confirmed = true; }
    setBusy({ key: `${card.id}:${action}`, label: ACTION_LABELS[action] });
    try {
      const response = await fetch("/api/hermes/cockpit/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Cockpit action failed.");
      await refresh(true);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Cockpit action failed."); }
    finally { setBusy(null); }
  }

  async function addRisk() {
    if (!risk.title.trim() || !risk.whyItMatters.trim() || !risk.recommendedNextStep.trim()) { setError("Risk title, impact, and next step are required."); return; }
    setBusy({ key: "add-risk", label: "Adding risk" });
    try {
      const response = await fetch("/api/hermes/cockpit/risks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...risk, actor: "Jeremy" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Risk could not be recorded.");
      setRisk({ title: "", whyItMatters: "", recommendedNextStep: "", urgency: "normal" }); setRiskOpen(false); await refresh(true);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Risk could not be recorded."); }
    finally { setBusy(null); }
  }

  if (loading && !cockpit) return <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading Daily Business Intake</div>;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="daily-business-cockpit">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">Daily Business Intake</h1><span className="rounded-full border border-blue-500/25 bg-blue-500/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Shadow mode</span></div><p className="mt-1 text-xs text-muted-foreground">Decisions, exceptions, and verified outcomes from Hermes. No write autonomy.</p></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setRiskOpen((value) => !value)}><Plus className="me-1 size-3.5" />Track risk</Button><Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void refresh()}><RefreshCw className={cn("me-1 size-3.5", loading && "animate-spin")} />Refresh</Button><Button size="sm" disabled={busy !== null} onClick={() => void startIntake()}>{busy?.key === "intake" ? <Loader2 className="me-1 size-3.5 animate-spin" /> : <Search className="me-1 size-3.5" />}Run intake</Button></div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        {error ? <div className="mb-4 flex items-start justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss"><X className="size-3.5" /></button></div> : null}
        {riskOpen ? <div className="mb-4 rounded-xl border bg-card p-4"><h2 className="text-sm font-semibold">Track a manual business risk</h2><div className="mt-3 grid gap-3 md:grid-cols-2"><input className="h-9 rounded-md border bg-background px-3 text-xs" placeholder="Risk title" value={risk.title} onChange={(event) => setRisk({ ...risk, title: event.target.value })} /><select className="h-9 rounded-md border bg-background px-3 text-xs" value={risk.urgency} onChange={(event) => setRisk({ ...risk, urgency: event.target.value })}><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select><textarea className="min-h-20 rounded-md border bg-background p-3 text-xs" placeholder="Why it matters" value={risk.whyItMatters} onChange={(event) => setRisk({ ...risk, whyItMatters: event.target.value })} /><textarea className="min-h-20 rounded-md border bg-background p-3 text-xs" placeholder="Recommended next step" value={risk.recommendedNextStep} onChange={(event) => setRisk({ ...risk, recommendedNextStep: event.target.value })} /></div><div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setRiskOpen(false)}>Cancel</Button><Button size="sm" disabled={busy !== null} onClick={() => void addRisk()}>{busy?.key === "add-risk" ? <Loader2 className="me-1 size-3 animate-spin" /> : null}Record risk</Button></div></div> : null}
        {cockpit ? <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-xs font-semibold"><HeartPulse className="size-4 text-emerald-600" />Hermes Health</div><p className="mt-3 text-lg font-semibold capitalize">{cockpit.health.status.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{cockpit.health.version} · {cockpit.profile} · gateway {cockpit.health.gatewayState ?? "unknown"}</p></div>
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="size-4 text-blue-600" />Supermemory</div><p className="mt-3 text-sm font-semibold">{cockpit.memory.namespace}</p><p className="mt-1 text-xs text-muted-foreground">Capture {cockpit.memory.captureState} · recall {cockpit.memory.recallHealth}</p></div>
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-xs font-semibold"><CalendarClock className="size-4 text-amber-600" />Last intake</div><p className="mt-3 text-sm font-semibold">{formatTime(cockpit.telemetry.lastIntakeAt)}</p><p className="mt-1 text-xs text-muted-foreground">{cockpit.runs.filter((run) => run.context.startsWith("cockpit:intake:")).length} retained intake runs</p></div>
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-xs font-semibold"><ChevronRight className="size-4 text-violet-600" />Tool switching</div><p className="mt-3 text-lg font-semibold">{cockpit.telemetry.estimatedToolSwitchesAvoided}</p><p className="mt-1 text-xs text-muted-foreground">Estimated switches avoided across {cockpit.telemetry.sourceSystemsCovered} covered sources</p></div>
          </section>
          <section className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5" aria-label="Source coverage">{Object.entries(cockpit.sourceCoverage).map(([name, source]) => <div key={name} className={cn("rounded-lg border p-3", coverageTone(source.status))}><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-wide">{name.replace(/([A-Z])/g, " $1")}</p><span className="text-[10px]">{source.status}</span></div><p className="mt-1 text-[11px] leading-relaxed opacity-80">{source.message}</p></div>)}</section>
          {(Object.keys(SECTION_META) as CockpitCardKind[]).map((kind) => { const meta = SECTION_META[kind]; const Icon = meta.icon; return <section key={kind} className="mt-6"><div className="mb-3 flex items-center gap-2"><Icon className="size-4 text-muted-foreground" /><div><h2 className="text-sm font-semibold">{meta.title}</h2><p className="text-[11px] text-muted-foreground">{meta.description}</p></div><span className="ms-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{grouped[kind].length}</span></div>{grouped[kind].length ? <div className="grid gap-3 xl:grid-cols-2">{grouped[kind].map((card) => <Card key={card.id} card={card} runs={cockpit.runs} busy={busy} nowMs={new Date(cockpit.generatedAt).getTime()} onAction={onAction} />)}</div> : <div className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">No current {meta.title.toLowerCase()}.</div>}</section>; })}
          <footer className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground"><span><Clock3 className="me-1 inline size-3" />Generated {formatTime(cockpit.generatedAt)}</span><span><MessageSquare className="me-1 inline size-3" />{cockpit.telemetry.actionsStarted} actions started, {cockpit.telemetry.actionsCompleted} completed</span><span><Check className="me-1 inline size-3" />Hermes remains source of truth</span><span><CircleHelp className="me-1 inline size-3" />Shadow mode grants no write autonomy</span></footer>
        </> : null}
      </div>
    </div>
  );
}
