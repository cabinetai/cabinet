"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Circle,
  FileSearch,
  History,
  KeyRound,
  ListTodo,
  MoreHorizontal,
  Radar,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { CockpitAction, CockpitCard, DailyBusinessCockpit } from "@/lib/hermes/cockpit-types";
import {
  ACTION_LABELS,
  type CockpitView,
  cardConsequence,
  formatExactTime,
  formatRelativeTime,
  historyLabel,
  isBrokenStatus,
  momentum,
  primaryAction,
  radarCategory,
  sourceLabel,
} from "./cockpit-model";

type LoadingState = { key: string; label: string } | null;

const PRIMARY_VIEWS: Array<{ value: CockpitView; label: string; icon: typeof Target }> = [
  { value: "today", label: "Today", icon: Target },
  { value: "queue", label: "Queue", icon: ListTodo },
  { value: "radar", label: "Radar", icon: Radar },
];

const MORE_VIEWS: Array<{ value: CockpitView; label: string; icon: typeof Target }> = [
  { value: "risks", label: "Risks", icon: ShieldAlert },
  { value: "systems", label: "Systems", icon: Circle },
  { value: "history", label: "History", icon: History },
];

export function CockpitNavigation({ view, onChange }: { view: CockpitView; onChange: (view: CockpitView) => void }) {
  const moreActive = MORE_VIEWS.some((item) => item.value === view);
  return (
    <>
      <nav className="hidden items-center gap-1 md:flex" aria-label="Cockpit">
        {PRIMARY_VIEWS.map(({ value, label }) => (
          <Button key={value} size="sm" variant={view === value ? "secondary" : "ghost"} onClick={() => onChange(value)}>
            {label}
          </Button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant={moreActive ? "secondary" : "ghost"} />}>
            More
            <ChevronDown data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuGroup>
              <DropdownMenuLabel>More</DropdownMenuLabel>
              {MORE_VIEWS.map(({ value, label, icon: Icon }) => (
                <DropdownMenuItem key={value} onClick={() => onChange(value)}>
                  <Icon />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-background/95 pb-[max(env(safe-area-inset-bottom),0px)] backdrop-blur md:hidden" aria-label="Cockpit mobile">
        {PRIMARY_VIEWS.map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground", view === value && "text-command")} onClick={() => onChange(value)}>
            <Icon className="size-4" />
            {label}
          </button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground", moreActive && "text-command")}>
            <MoreHorizontal className="size-4" />
            More
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>More</DropdownMenuLabel>
              {MORE_VIEWS.map(({ value, label, icon: Icon }) => (
                <DropdownMenuItem key={value} onClick={() => onChange(value)}>
                  <Icon />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </>
  );
}

export function DailyMomentum({ cockpit }: { cockpit: DailyBusinessCockpit }) {
  const value = momentum(cockpit);
  const hasProposal = Boolean(cockpit.momentumPlan?.proposal);
  return (
    <section className="flex min-h-0 flex-col justify-between rounded-2xl bg-card p-3 shadow-sm ring-1 ring-card-edge sm:min-h-40 sm:p-4" data-testid="cockpit-momentum">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-command">Daily Momentum</p>
          <p className="mt-1 text-xl font-semibold tracking-tight sm:mt-1.5 sm:text-2xl">{value.done} of {value.total} clear</p>
          <p className={cn("mt-1 hidden text-xs sm:block", hasProposal ? "text-warning" : "text-muted-foreground")}>
            {hasProposal ? "Frozen for today · New intake proposal held" : "Frozen from the accepted intake."}
          </p>
        </div>
        <div className="grid size-11 place-items-center rounded-full bg-command/10 text-sm font-semibold text-command ring-1 ring-command/20 sm:size-14 sm:text-base">
          {value.percent}%
        </div>
      </div>
      <div className="mt-2 sm:hidden">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-command transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${value.percent}%` }} /></div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Decide {value.completed.decide}/{value.selected.decide} · Protect {value.completed.protect}/{value.selected.protect} · Verify {value.completed.verify}/{value.selected.verify}</p>
        {hasProposal ? <p className="mt-1 text-[11px] text-warning">New intake proposal held</p> : null}
      </div>
      <div className="mt-3 hidden flex-col gap-2 sm:flex">
        <Progress value={value.selected.decide ? (value.completed.decide / value.selected.decide) * 100 : 0}>
          <ProgressLabel>Decide</ProgressLabel><ProgressValue>{() => `${value.completed.decide}/${value.selected.decide}`}</ProgressValue>
        </Progress>
        <Progress value={value.selected.protect ? (value.completed.protect / value.selected.protect) * 100 : 0}>
          <ProgressLabel>Protect</ProgressLabel><ProgressValue>{() => `${value.completed.protect}/${value.selected.protect}`}</ProgressValue>
        </Progress>
        <Progress value={value.selected.verify ? (value.completed.verify / value.selected.verify) * 100 : 0}>
          <ProgressLabel>Verify</ProgressLabel><ProgressValue>{() => `${value.completed.verify}/${value.selected.verify}`}</ProgressValue>
        </Progress>
      </div>
    </section>
  );
}

export function NextBestMove({
  card,
  busy,
  resumeStep,
  onOpen,
  onChooseAnother,
  onAction,
}: {
  card: CockpitCard | null;
  busy: LoadingState;
  resumeStep?: string;
  onOpen: (card: CockpitCard) => void;
  onChooseAnother: () => void;
  onAction: (action: CockpitAction, card: CockpitCard) => Promise<void>;
}) {
  if (!card) {
    return (
      <section className="grid min-h-40 place-items-center rounded-2xl bg-card p-5 text-center shadow-sm ring-1 ring-card-edge">
        <div>
          <Check className="mx-auto size-7 text-success" />
          <h2 className="mt-3 text-xl font-semibold">The path is clear</h2>
          <p className="mt-1 text-sm text-muted-foreground">No mission needs your attention right now.</p>
        </div>
      </section>
    );
  }
  const action = primaryAction(card);
  return (
    <section className="relative min-h-0 overflow-hidden rounded-2xl bg-card p-3 shadow-sm ring-1 ring-command/25 sm:min-h-40 sm:p-4" data-testid="cockpit-next-best-move">
      <div className="absolute inset-y-0 start-0 w-1 bg-command" aria-hidden="true" />
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-command" />
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-command">Next Best Move</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-3">
        <Badge variant={card.urgency === "critical" ? "destructive" : "outline"}>{card.urgency}</Badge>
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{sourceLabel(card.sourceType)}</span>
      </div>
      <h2 className="mt-2 line-clamp-2 text-base font-semibold leading-tight tracking-tight sm:text-lg">{resumeStep ? `Resume: ${card.title}` : card.title}</h2>
      {resumeStep ? <p className="mt-1 truncate text-[11px] text-command">Last completed step: {resumeStep}</p> : null}
      <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">{cardConsequence(card)}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:mt-3">
        <Button className="bg-command text-white hover:bg-command/90" disabled={busy !== null} onClick={() => void onAction(action, card)}>
          {action === "investigate" ? <FileSearch data-icon="inline-start" /> : <Check data-icon="inline-start" />}
          {ACTION_LABELS[action]}
        </Button>
        <Button variant="outline" onClick={() => onOpen(card)}>Open details</Button>
        <Button variant="ghost" size="sm" className="ms-auto text-[11px] sm:text-[0.8rem]" onClick={onChooseAnother}>Not the right move? Choose another</Button>
      </div>
    </section>
  );
}

export function ResumeBanner({ card, lastStep, onResume }: { card: CockpitCard; lastStep: string; onResume: () => void }) {
  return (
    <button type="button" className="flex w-full items-center justify-between gap-4 rounded-xl bg-command/8 px-4 py-3 text-left ring-1 ring-command/15" onClick={onResume} data-testid="cockpit-resume">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">Resume: {card.title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">Last completed step: {lastStep}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-command" />
    </button>
  );
}

export function ActiveRiskModule({ card, onOpen }: { card: CockpitCard | null; onOpen: (card: CockpitCard) => void }) {
  if (!card) return null;
  return (
    <section className="min-w-0 overflow-hidden rounded-xl bg-card p-3.5 shadow-sm ring-1 ring-card-edge" data-testid="cockpit-active-risk">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-warning">Largest active risk</p>
        <Badge variant={card.urgency === "critical" ? "destructive" : "outline"}>{card.urgency}</Badge>
      </div>
      <h2 className="mt-2 truncate text-sm font-semibold">{card.title}</h2>
      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{card.recommendedNextStep}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">Open {formatRelativeTime(card.createdAt).replace(" ago", "")}</span>
        <Button size="sm" variant="outline" onClick={() => onOpen(card)}>Continue</Button>
      </div>
    </section>
  );
}

export function RadarModule({ cockpit, onOpen }: { cockpit: DailyBusinessCockpit; onOpen: () => void }) {
  const promotable = cockpit.potentiallyMissed.filter((item) => /promot|owner reported|owner-reported/i.test(`${item.reviewQuestion} ${item.whyPotentiallyMissed}`)).length;
  const candidates = cockpit.potentiallyMissed.slice(0, 2);
  return (
    <section className="min-w-0 overflow-hidden rounded-xl bg-card p-3.5 shadow-sm ring-1 ring-card-edge" data-testid="cockpit-radar-summary">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-command">Radar</p>
        <Badge variant="secondary">{cockpit.potentiallyMissed.length}</Badge>
      </div>
      <p className="mt-2 text-sm font-semibold">{promotable} may deserve promotion</p>
      {candidates.length ? <p className="mt-1 truncate text-xs text-muted-foreground">Watching: {candidates.map((item) => item.title).join(" · ")}</p> : <p className="mt-1 text-xs text-muted-foreground">No candidates under review.</p>}
      <Button size="sm" variant="ghost" className="mt-1.5" onClick={onOpen}>Review Radar <ArrowRight data-icon="inline-end" /></Button>
    </section>
  );
}

export function SystemsStrip({ cockpit, onOpen }: { cockpit: DailyBusinessCockpit; onOpen: () => void }) {
  const items = [
    ["Gmail", cockpit.sourceCoverage.gmail.status],
    ["Calendar", cockpit.sourceCoverage.calendar.status],
    ["Jobs", cockpit.sourceCoverage.hermesJobs.status],
    ["Supermemory", cockpit.sourceCoverage.supermemory.status],
    ["Hermes", cockpit.health.status === "online" ? "connected" : "error"],
  ] as const;
  return (
    <button type="button" onClick={onOpen} className="flex w-full min-w-0 self-start flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-muted/35 px-3 py-2.5 text-xs text-muted-foreground xl:w-auto xl:max-w-[28rem]" data-testid="cockpit-systems-strip">
      {items.map(([label, status]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          {status === "connected" ? <Check className="size-3.5 text-success" /> : status === "connected_empty" ? <Circle className="size-3.5" /> : <AlertTriangle className="size-3.5 text-destructive" />}
          {label}{status === "connected_empty" ? " empty" : ""}
        </span>
      ))}
      <span className="ms-auto">Systems <ArrowRight className="ms-1 inline size-3" /></span>
    </button>
  );
}

export function SystemFailureAlert({ cockpit, onReauthenticate }: { cockpit: DailyBusinessCockpit; onReauthenticate: () => void }) {
  const failures = Object.entries(cockpit.sourceCoverage).filter(([, source]) => isBrokenStatus(source.status));
  const hermesFailed = cockpit.health.status !== "online";
  if (!failures.length && !hermesFailed) return null;
  const invalidGrant = failures.some(([, source]) => source.message.toLowerCase().includes("invalid_grant"));
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{failures.length + (hermesFailed ? 1 : 0)} system exception{failures.length + (hermesFailed ? 1 : 0) === 1 ? "" : "s"}</AlertTitle>
      <AlertDescription className="hidden sm:block">{failures.map(([name]) => name).join(", ") || "Hermes"} needs attention. Current evidence remains clearly separated from failed sources.</AlertDescription>
      {invalidGrant ? <AlertAction><Button size="sm" variant="outline" onClick={onReauthenticate}><KeyRound data-icon="inline-start" />Reauthenticate</Button></AlertAction> : null}
    </Alert>
  );
}

export function RadarView({ cockpit }: { cockpit: DailyBusinessCockpit }) {
  const groups = new Map<string, typeof cockpit.potentiallyMissed>();
  for (const item of cockpit.potentiallyMissed) {
    const category = radarCategory(item);
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  return (
    <section className="flex flex-col gap-5" data-testid="cockpit-radar-view">
      <div><h2 className="text-2xl font-semibold tracking-tight">Radar</h2><p className="mt-1 text-sm text-muted-foreground">Potentially missed remains visible while ranking trust matures.</p></div>
      {["owner", "low-confidence", "suppressed", "duplicate", "stale"].map((category) => {
        const items = groups.get(category) ?? [];
        if (!items.length) return null;
        return <section key={category} className="flex flex-col gap-2"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{category.replace("-", " ")}</h3><Badge variant="secondary">{items.length}</Badge></div>{items.map((item) => <article key={item.id} className="rounded-xl bg-card p-4 shadow-sm ring-1 ring-card-edge"><div className="flex items-center gap-2"><span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{sourceLabel(item.sourceType)}</span><span className="text-xs text-muted-foreground">{formatRelativeTime(item.createdAt)}</span></div><h4 className="mt-2 text-sm font-semibold">{item.title}</h4><p className="mt-1 text-sm text-muted-foreground">{item.whyPotentiallyMissed}</p><p className="mt-2 text-sm font-medium">{item.reviewQuestion}</p></article>)}</section>;
      })}
    </section>
  );
}

export function SystemsView({ cockpit, onReauthenticate }: { cockpit: DailyBusinessCockpit; onReauthenticate: () => void }) {
  return (
    <section className="flex flex-col gap-4" data-testid="cockpit-systems-view">
      <div><h2 className="text-2xl font-semibold tracking-tight">Systems</h2><p className="mt-1 text-sm text-muted-foreground">Healthy infrastructure stays quiet; exceptions stay actionable.</p></div>
      <SystemFailureAlert cockpit={cockpit} onReauthenticate={onReauthenticate} />
      {Object.entries(cockpit.sourceCoverage).map(([name, source]) => (
        <article key={name} className="flex flex-col gap-2 rounded-xl bg-card p-4 shadow-sm ring-1 ring-card-edge sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="text-sm font-semibold capitalize">{name.replace(/([A-Z])/g, " $1")}</h3><p className="mt-1 text-xs text-muted-foreground">{source.message}</p></div>
          <div className="shrink-0 text-left sm:text-right"><Badge variant={isBrokenStatus(source.status) ? "destructive" : source.status === "connected_empty" ? "outline" : "secondary"}>{source.status.replaceAll("_", "-")}</Badge><p className="mt-1 text-[11px] text-muted-foreground">{formatRelativeTime(cockpit.telemetry.lastIntakeAt)} · {formatExactTime(cockpit.telemetry.lastIntakeAt)}</p></div>
        </article>
      ))}
    </section>
  );
}

export function HistoryView({ cockpit }: { cockpit: DailyBusinessCockpit }) {
  return (
    <section className="flex flex-col gap-4" data-testid="cockpit-history-view">
      <div><h2 className="text-2xl font-semibold tracking-tight">History</h2><p className="mt-1 text-sm text-muted-foreground">Verified outcomes and governed activity, not an activity contest.</p></div>
      <div className="rounded-xl bg-muted/35 p-4 text-sm"><p className="font-semibold">Estimated tool switching avoided: {cockpit.telemetry.estimatedToolSwitchesAvoided}</p><p className="mt-1 text-xs text-muted-foreground">Estimate across {cockpit.telemetry.sourceSystemsCovered} connected source systems.</p></div>
      <div className="flex flex-col gap-0">
        {cockpit.history.map((record, index) => (
          <div key={record.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 [contain-intrinsic-size:0_80px] [content-visibility:auto]">
            <div className="flex flex-col items-center"><span className="mt-1.5 size-2 rounded-full bg-command" />{index < cockpit.history.length - 1 ? <span className="min-h-10 w-px flex-1 bg-border" /> : null}</div>
            <div className="pb-5"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{historyLabel(record)}</p><Badge variant={record.outcome === "failed" ? "destructive" : "outline"}>{record.outcome}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{record.detail}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatRelativeTime(record.at)} · {formatExactTime(record.at)}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RisksView({ cards, onOpen }: { cards: CockpitCard[]; onOpen: (card: CockpitCard) => void }) {
  return (
    <section className="flex flex-col gap-4" data-testid="cockpit-risks-view">
      <div><h2 className="text-2xl font-semibold tracking-tight">Risks</h2><p className="mt-1 text-sm text-muted-foreground">Persistent until explicitly resolved.</p></div>
      {cards.map((card) => <article key={card.id} className="rounded-xl bg-card p-4 shadow-sm ring-1 ring-card-edge"><div className="flex items-center justify-between gap-3"><Badge variant={card.urgency === "critical" ? "destructive" : "outline"}>{card.urgency}</Badge><span className="text-xs text-muted-foreground">Open {formatRelativeTime(card.createdAt).replace(" ago", "")}</span></div><h3 className="mt-3 text-base font-semibold">{card.title}</h3><p className="mt-1 text-sm text-muted-foreground">{card.recommendedNextStep}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => onOpen(card)}>Continue</Button></article>)}
    </section>
  );
}
