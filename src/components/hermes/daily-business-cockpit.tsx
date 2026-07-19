"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, RefreshCw, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/stores/app-store";
import type { CockpitAction, CockpitCard, DailyBusinessCockpit } from "@/lib/hermes/cockpit-types";
import { CockpitInspector } from "./cockpit/cockpit-inspector";
import {
  type CockpitView,
  formatCompactDate,
  formatRelativeTime,
} from "./cockpit/cockpit-model";
import { CockpitQueueRow } from "./cockpit/cockpit-queue-row";
import {
  ActiveRiskModule,
  CockpitNavigation,
  DailyMomentum,
  HistoryView,
  NextBestMove,
  RadarModule,
  RadarView,
  ResumeBanner,
  RisksView,
  SystemFailureAlert,
  SystemsStrip,
  SystemsView,
} from "./cockpit/cockpit-sections";

type LoadingState = { key: string; label: string } | null;
const GOOGLE_WORKSPACE_REAUTH_COMMAND = "gws auth login --readonly --services gmail,calendar";
const RESUME_KEY = "cabinet.cockpit.resume.v1";
const RISK_LEVELS = [
  { label: "Critical", value: "critical" },
  { label: "High", value: "high" },
  { label: "Normal", value: "normal" },
  { label: "Low", value: "low" },
];

function key(prefix: string): string {
  return `${prefix}:${Date.now()}:${crypto.randomUUID()}`;
}

function CockpitLoading() {
  return (
    <div className="flex h-full flex-col gap-4 p-5" aria-label="Loading Today">
      <div className="flex items-center justify-between"><div className="flex flex-col gap-2"><Skeleton className="h-7 w-28" /><Skeleton className="h-4 w-52" /></div><Skeleton className="h-8 w-32" /></div>
      <div className="grid gap-3 lg:grid-cols-2"><Skeleton className="h-44 rounded-2xl" /><Skeleton className="h-44 rounded-2xl" /></div>
      <div className="flex flex-col gap-2"><Skeleton className="h-18 rounded-xl" /><Skeleton className="h-18 rounded-xl" /><Skeleton className="h-18 rounded-xl" /></div>
    </div>
  );
}

export function DailyBusinessCockpit() {
  const addTerminalTab = useAppStore((state) => state.addTerminalTab);
  const [cockpit, setCockpit] = useState<DailyBusinessCockpit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<LoadingState>(null);
  const [view, setView] = useState<CockpitView>("today");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [missionOffset, setMissionOffset] = useState(0);
  const [resume, setResume] = useState<{ cardId: string; lastStep: string } | null>(null);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [clearingCardId, setClearingCardId] = useState<string | null>(null);
  const [riskOpen, setRiskOpen] = useState(false);
  const [risk, setRisk] = useState({ title: "", whyItMatters: "", recommendedNextStep: "", urgency: "normal" });
  const viewed = useRef(false);
  const cockpitRef = useRef<DailyBusinessCockpit | null>(null);
  const completionTimer = useRef<number | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/hermes/cockpit", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Daily Business Intake is unavailable.");
      const next = body as DailyBusinessCockpit;
      const current = cockpitRef.current;
      if (current) {
        const nextIds = new Set(next.cards.map((card) => card.id));
        const cleared = current.cards.find((card) => !nextIds.has(card.id));
        if (cleared) {
          setClearingCardId(cleared.id);
          setCompletionMessage(`${cleared.title} cleared.`);
          if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
          completionTimer.current = window.setTimeout(() => setCompletionMessage(null), 2_400);
          await new Promise((resolve) => window.setTimeout(resolve, 210));
        }
      }
      cockpitRef.current = next;
      setCockpit(next);
      setClearingCardId(null);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Daily Business Intake is unavailable.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!viewed.current) {
      viewed.current = true;
      void fetch("/api/hermes/cockpit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "viewed", actor: "Jeremy" }) });
    }
    try {
      const stored = window.sessionStorage.getItem(RESUME_KEY);
      if (stored) setResume(JSON.parse(stored) as { cardId: string; lastStep: string });
    } catch {
      // Resume context is optional and never blocks the cockpit.
    }
  }, [refresh]);

  useEffect(() => () => {
    if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
  }, []);

  useEffect(() => {
    if (!cockpit?.runs.some((run) => ["queued", "running", "waiting_for_approval", "stopping"].includes(run.status))) return;
    const timer = window.setInterval(() => void refresh(true), 2_000);
    return () => window.clearInterval(timer);
  }, [cockpit?.runs, refresh]);

  const cards = useMemo(() => cockpit?.cards ?? [], [cockpit?.cards]);
  const queue = useMemo(() => cards.filter((card) => card.kind === "needs_jeremy" || card.kind === "todays_mission"), [cards]);
  const risks = useMemo(() => cards.filter((card) => card.kind === "business_risk"), [cards]);
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? null;
  const nextBest = queue.length ? queue[missionOffset % queue.length] : risks[0] ?? null;
  const upNext = queue.filter((card) => card.id !== nextBest?.id).slice(0, 3);
  const resumeCard = resume ? cards.find((card) => card.id === resume.cardId) ?? null : null;
  const allSystemsHealthy = cockpit ? Object.values(cockpit.sourceCoverage).every((source) => source.status === "connected" || source.status === "connected_empty") && cockpit.health.status === "online" : false;

  function persistResume(card: CockpitCard, lastStep: string) {
    const value = { cardId: card.id, lastStep };
    setResume(value);
    try { window.sessionStorage.setItem(RESUME_KEY, JSON.stringify(value)); } catch { /* optional */ }
  }

  function openCard(card: CockpitCard) {
    setSelectedCardId(card.id);
    persistResume(card, "Opened details");
  }

  function startGoogleWorkspaceReauthentication() {
    addTerminalTab("Google Workspace reauthentication", undefined, "shell", GOOGLE_WORKSPACE_REAUTH_COMMAND);
  }

  async function startIntake() {
    setBusy({ key: "intake", label: "Refreshing intelligence" });
    try {
      const response = await fetch("/api/hermes/cockpit/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: key("daily-intake"), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Vancouver" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Daily intake failed to start.");
      await refresh(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Daily intake failed to start.");
    } finally {
      setBusy(null);
    }
  }

  async function onAction(action: CockpitAction, card: CockpitCard) {
    const payload: Record<string, unknown> = { action, cardId: card.id, actor: "Jeremy", idempotencyKey: key(`cockpit-${action}`), confirmed: false };
    if (action === "comment") { const body = window.prompt("Add an operator comment"); if (!body?.trim()) return; payload.body = body.trim(); }
    if (action === "snooze") { const until = window.prompt("Snooze until (ISO date/time)", new Date(Date.now() + 86_400_000).toISOString()); if (!until) return; payload.until = until; }
    if (action === "schedule") { const schedule = window.prompt("Hermes cron schedule", "0 9 * * 1-5"); if (!schedule) return; if (!window.confirm(`Create a canonical Hermes job with schedule ${schedule}?`)) return; payload.schedule = schedule; payload.confirmed = true; }
    if (action === "approve" || action === "reject") { if (!card.approval.runId || !card.approval.requestId || !window.confirm(`${action === "approve" ? "Approve" : "Reject"} the exact pending Hermes request?`)) return; payload.runId = card.approval.runId; payload.requestId = card.approval.requestId; payload.confirmed = true; }
    setBusy({ key: `${card.id}:${action}`, label: action });
    persistResume(card, `${action.replaceAll("_", " ")} started`);
    try {
      const response = await fetch("/api/hermes/cockpit/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Cockpit action failed.");
      persistResume(card, `${action.replaceAll("_", " ")} handed to Hermes`);
      setSelectedCardId(card.id);
      await refresh(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Cockpit action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function addRisk() {
    if (!risk.title.trim() || !risk.whyItMatters.trim() || !risk.recommendedNextStep.trim()) { setError("Risk title, impact, and next step are required."); return; }
    setBusy({ key: "add-risk", label: "Adding risk" });
    try {
      const response = await fetch("/api/hermes/cockpit/risks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...risk, actor: "Jeremy" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Risk could not be recorded.");
      setRisk({ title: "", whyItMatters: "", recommendedNextStep: "", urgency: "normal" });
      setRiskOpen(false);
      await refresh(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Risk could not be recorded.");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !cockpit) return <CockpitLoading />;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="daily-business-cockpit">
      <header className="relative shrink-0 overflow-hidden border-b border-border px-4 py-3 md:px-5">
        {busy?.key === "intake" ? <span className="cockpit-intelligence-sweep" aria-hidden="true" /> : null}
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
              {cockpit ? <span className="hidden text-xs text-muted-foreground sm:inline">{formatRelativeTime(cockpit.telemetry.lastIntakeAt)} · {formatCompactDate(cockpit.telemetry.lastIntakeAt)} · {allSystemsHealthy ? "All systems ready" : "System attention needed"}</span> : null}
            </div>
            {cockpit ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground sm:hidden">
                {formatRelativeTime(cockpit.telemetry.lastIntakeAt)} · {formatCompactDate(cockpit.telemetry.lastIntakeAt).replace(/^[^,]+,\s*/, "")} · {allSystemsHealthy ? "Ready" : "Attention"} · Radar {cockpit.potentiallyMissed.length}
              </p>
            ) : null}
            <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">Know what matters. Clear the path.</p>
          </div>
          <div className="flex items-center gap-2">
            <CockpitNavigation view={view} onChange={setView} />
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void startIntake()} aria-label="Refresh intelligence">
              {busy?.key === "intake" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <RefreshCw data-icon="inline-start" />}
              <span className="hidden lg:inline">Refresh intelligence</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-20 md:px-5 md:pb-5" data-testid={`cockpit-view-${view}`}>
        {error ? (
          <Alert variant="destructive" className="mb-3">
            <X />
            <AlertTitle>Cockpit exception</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {completionMessage ? <div className="cockpit-completion-sweep mb-3 overflow-hidden rounded-xl bg-success/10 px-4 py-3 text-sm font-semibold text-success ring-1 ring-success/20" role="status">{completionMessage}</div> : null}

        {cockpit && view === "today" ? (
          <div className="cockpit-first-view mx-auto flex max-w-6xl flex-col gap-3">
            <SystemFailureAlert cockpit={cockpit} onReauthenticate={startGoogleWorkspaceReauthentication} />
            {resumeCard && resume && resumeCard.id !== nextBest?.id ? <ResumeBanner card={resumeCard} lastStep={resume.lastStep} onResume={() => openCard(resumeCard)} /> : null}
            <div className="grid gap-3 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.22fr)]">
              <DailyMomentum cockpit={cockpit} />
              <NextBestMove card={nextBest} busy={busy} resumeStep={resumeCard?.id === nextBest?.id ? resume?.lastStep : undefined} onOpen={openCard} onChooseAnother={() => setMissionOffset((value) => queue.length ? (value + 1) % queue.length : 0)} onAction={onAction} />
            </div>

            <section className="flex flex-col gap-2" aria-labelledby="up-next-title">
              <div className="flex items-center justify-between gap-3">
                <h2 id="up-next-title" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Up next</h2>
                <Button variant="ghost" size="xs" onClick={() => setView("queue")}>View queue</Button>
              </div>
              {upNext.length ? upNext.map((card, index) => (
                <div key={card.id} className={index === 2 ? "hidden sm:block" : undefined}>
                  <CockpitQueueRow card={card} freshness={cockpit.telemetry.lastIntakeAt} busy={busy} compact exiting={clearingCardId === card.id} onOpen={openCard} onAction={onAction} />
                </div>
              )) : <p className="rounded-xl bg-muted/35 px-4 py-3 text-sm text-muted-foreground">Nothing else is competing for attention.</p>}
            </section>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <ActiveRiskModule card={risks[0] ?? null} onOpen={openCard} />
              <RadarModule cockpit={cockpit} onOpen={() => setView("radar")} />
              <div className={allSystemsHealthy ? "contents xl:block" : "hidden xl:block"}>
                <SystemsStrip cockpit={cockpit} onOpen={() => setView("systems")} />
              </div>
            </div>
          </div>
        ) : null}

        {cockpit && view === "queue" ? (
          <section className="mx-auto flex max-w-4xl flex-col gap-3" data-testid="cockpit-queue-view">
            <div className="flex items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold tracking-tight">Queue</h2><p className="mt-1 text-sm text-muted-foreground">One ordered path through decisions and exceptions.</p></div><span className="text-sm font-medium text-muted-foreground">{queue.length} open</span></div>
            <div className="flex flex-col gap-2">{queue.map((card) => <CockpitQueueRow key={card.id} card={card} freshness={cockpit.telemetry.lastIntakeAt} busy={busy} exiting={clearingCardId === card.id} onOpen={openCard} onAction={onAction} />)}</div>
          </section>
        ) : null}

        {cockpit && view === "radar" ? <div className="mx-auto max-w-4xl"><RadarView cockpit={cockpit} /></div> : null}

        {cockpit && view === "risks" ? (
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setRiskOpen((value) => !value)}><Plus data-icon="inline-start" />Track risk</Button></div>
            {riskOpen ? (
              <section className="rounded-xl bg-card p-4 shadow-sm ring-1 ring-card-edge">
                <h2 className="text-base font-semibold">Track a manual business risk</h2>
                <FieldGroup className="mt-4">
                  <Field><FieldLabel htmlFor="risk-title">Risk title</FieldLabel><Input id="risk-title" value={risk.title} onChange={(event) => setRisk((current) => ({ ...current, title: event.target.value }))} /></Field>
                  <Field>
                    <FieldLabel>Severity</FieldLabel>
                    <Select items={RISK_LEVELS} value={risk.urgency} onValueChange={(value) => setRisk((current) => ({ ...current, urgency: value ?? "normal" }))}>
                      <SelectTrigger><SelectValue>{(value) => RISK_LEVELS.find((item) => item.value === value)?.label ?? "Normal"}</SelectValue></SelectTrigger>
                      <SelectContent><SelectGroup>{RISK_LEVELS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  </Field>
                  <Field><FieldLabel htmlFor="risk-impact">Why it matters</FieldLabel><Textarea id="risk-impact" value={risk.whyItMatters} onChange={(event) => setRisk((current) => ({ ...current, whyItMatters: event.target.value }))} /></Field>
                  <Field><FieldLabel htmlFor="risk-next">Recommended next step</FieldLabel><Textarea id="risk-next" value={risk.recommendedNextStep} onChange={(event) => setRisk((current) => ({ ...current, recommendedNextStep: event.target.value }))} /></Field>
                </FieldGroup>
                <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setRiskOpen(false)}>Cancel</Button><Button disabled={busy !== null} onClick={() => void addRisk()}>Record risk</Button></div>
              </section>
            ) : null}
            <RisksView cards={risks} onOpen={openCard} />
          </div>
        ) : null}

        {cockpit && view === "systems" ? <div className="mx-auto max-w-4xl"><SystemsView cockpit={cockpit} onReauthenticate={startGoogleWorkspaceReauthentication} /></div> : null}
        {cockpit && view === "history" ? <div className="mx-auto max-w-4xl"><HistoryView cockpit={cockpit} /></div> : null}
      </main>

      {cockpit ? <CockpitInspector card={selectedCard} cockpit={cockpit} busy={busy} onClose={() => setSelectedCardId(null)} onAction={onAction} /> : null}
    </div>
  );
}
