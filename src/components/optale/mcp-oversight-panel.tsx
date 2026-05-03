"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CabinetVisibilityMode } from "@/types/cabinets";

type McpAuditOutcome = "ok" | "error" | "denied" | "notification";

interface McpAuditEvent {
  timestamp?: string;
  requestId?: string;
  clientId?: string;
  authType?: string;
  method: string;
  productToolName?: string;
  productToolLabel?: string;
  cabinetPath?: string;
  agentScope?: string;
  outcome: McpAuditOutcome;
  durationMs?: number;
  argumentKeys?: string[];
  error?: string;
}

interface McpAuditClientSummary {
  clientId: string;
  events: number;
  toolCalls: number;
  errors: number;
  denied: number;
  notifications: number;
  lastSeenAt?: string;
}

interface McpAuditSummary {
  date: string;
  enabled: boolean;
  totalEvents: number;
  toolCalls: number;
  outcomes: Record<McpAuditOutcome, number>;
  clients: McpAuditClientSummary[];
  recentEvents: McpAuditEvent[];
}

interface McpCounts {
  clients: number;
  enabledClients: number;
  disabledClients: number;
  registryClients: number;
  legacyEnvClients: number;
  clientsWithBudgets: number;
  auditEnabledClients: number;
  remoteActionClients: number;
}

interface CommandCenterSnapshot {
  mcp?: {
    audit: McpAuditSummary;
    counts: McpCounts;
  };
  counts?: {
    mcpClients?: number;
    activeMcpClients?: number;
    mcpToolCallsToday?: number;
    mcpAuditEventsToday?: number;
  };
}

function numberLabel(value: number | undefined): string {
  const numeric = value || 0;
  if (numeric >= 1000) return `${(numeric / 1000).toFixed(1)}k`;
  return String(numeric);
}

function eventLabel(event: McpAuditEvent): string {
  return (
    event.productToolLabel ||
    event.productToolName ||
    event.method
  );
}

function eventSubtitle(event: McpAuditEvent): string {
  const client = event.clientId || "unknown";
  const time = shortTime(event.timestamp);
  const productName = event.productToolName;
  return productName
    ? `${productName} / ${client} / ${time}`
    : `${client} / ${time}`;
}

function issueCount(audit: McpAuditSummary | undefined): number {
  if (!audit) return 0;
  return audit.outcomes.error + audit.outcomes.denied;
}

function shortTime(value: string | undefined): string {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function outcomeTone(outcome: McpAuditOutcome): string {
  if (outcome === "ok") return "text-emerald-600 dark:text-emerald-400";
  if (outcome === "denied") return "text-amber-600 dark:text-amber-400";
  if (outcome === "notification") return "text-sky-600 dark:text-sky-400";
  return "text-destructive";
}

function outcomeIcon(outcome: McpAuditOutcome, className: string) {
  if (outcome === "ok") return <CheckCircle2 className={className} />;
  if (outcome === "denied") return <ShieldAlert className={className} />;
  if (outcome === "notification") return <Activity className={className} />;
  return <AlertTriangle className={className} />;
}

export function OptaleMcpOversightPanel({
  cabinetPath,
  visibilityMode = "own",
  className,
}: {
  cabinetPath: string;
  visibilityMode?: CabinetVisibilityMode;
  className?: string;
}) {
  const [snapshot, setSnapshot] = useState<CommandCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cabinetPath,
        visibilityMode,
        limit: "5",
      });
      const response = await fetch(
        `/api/optale/command-center?${params.toString()}`,
      );
      if (!response.ok)
        throw new Error(`Command Center fetch failed: ${response.status}`);
      setSnapshot((await response.json()) as CommandCenterSnapshot);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Command Center fetch failed",
      );
    } finally {
      setLoading(false);
    }
  }, [cabinetPath, visibilityMode]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const audit = snapshot?.mcp?.audit;
  const counts = snapshot?.mcp?.counts;
  const issueTotal = issueCount(audit);
  const recentEvents = audit?.recentEvents.slice(0, 5) ?? [];
  const activeClients =
    counts?.enabledClients ?? snapshot?.counts?.activeMcpClients ?? 0;
  const totalClients = counts?.clients ?? snapshot?.counts?.mcpClients ?? 0;
  const clientSummaries = useMemo(
    () => audit?.clients.slice(0, 4) ?? [],
    [audit?.clients],
  );

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-500" />
            <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
              MCP oversight
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {audit
              ? `${numberLabel(audit.toolCalls)} calls / ${numberLabel(issueTotal)} issues`
              : "Loading activity"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void refresh()}
          disabled={loading}
          title="Refresh MCP oversight"
          aria-label="Refresh MCP oversight"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-border/70 bg-card">
        <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60">
          <Metric
            icon={<KeyRound className="size-3.5 text-amber-500" />}
            label="Clients"
            value={loading && !snapshot ? "-" : numberLabel(activeClients)}
            sub={`${numberLabel(totalClients)} total`}
          />
          <Metric
            icon={<Activity className="size-3.5 text-sky-500" />}
            label="Calls"
            value={loading && !snapshot ? "-" : numberLabel(audit?.toolCalls)}
            sub={audit?.date || "today"}
          />
          <Metric
            icon={<ShieldAlert className="size-3.5 text-rose-500" />}
            label="Issues"
            value={loading && !snapshot ? "-" : numberLabel(issueTotal)}
            sub={`${numberLabel(audit?.outcomes.denied)} denied`}
          />
        </div>

        <div className="space-y-3 px-3 py-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <OutcomeBadge
              label="ok"
              value={audit?.outcomes.ok}
              tone="emerald"
            />
            <OutcomeBadge
              label="error"
              value={audit?.outcomes.error}
              tone="rose"
            />
            <OutcomeBadge
              label="denied"
              value={audit?.outcomes.denied}
              tone="amber"
            />
            <OutcomeBadge
              label="notify"
              value={audit?.outcomes.notification}
              tone="sky"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase text-muted-foreground/80">
              <UserRoundCheck className="size-3" />
              Clients
            </div>
            {clientSummaries.length === 0 && !loading ? (
              <div className="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[12px] text-muted-foreground">
                No audited clients today.
              </div>
            ) : null}
            {(clientSummaries.length > 0
              ? clientSummaries
              : loading
                ? skeletonClients()
                : []
            ).map((client) => (
              <ClientAuditRow key={client.clientId} client={client} />
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase text-muted-foreground/80">
              <Activity className="size-3" />
              Recent
            </div>
            {recentEvents.length === 0 && !loading ? (
              <div className="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[12px] text-muted-foreground">
                No MCP events today.
              </div>
            ) : null}
            {(recentEvents.length > 0
              ? recentEvents
              : loading
                ? skeletonEvents()
                : []
            ).map((event) => (
              <AuditEventRow
                key={event.requestId || `${event.method}-${event.timestamp}`}
                event={event}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[18px] font-semibold leading-none tabular-nums text-foreground">
          {value}
        </span>
        <span className="truncate text-[10px] text-muted-foreground">
          {sub}
        </span>
      </div>
    </div>
  );
}

function OutcomeBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone: "emerald" | "rose" | "amber" | "sky";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "rose"
        ? "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300"
        : tone === "amber"
          ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return (
    <span className={cn("rounded-md border px-1.5 py-0.5", toneClass)}>
      <span className="font-semibold tabular-nums">{numberLabel(value)}</span>{" "}
      {label}
    </span>
  );
}

function ClientAuditRow({ client }: { client: McpAuditClientSummary }) {
  const issues = client.errors + client.denied;
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-background px-2 py-2">
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30">
        <UserRoundCheck className="size-3.5 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-foreground">
          {client.clientId}
        </span>
        <span className="block truncate text-[10.5px] text-muted-foreground">
          {numberLabel(client.toolCalls)} calls / {shortTime(client.lastSeenAt)}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
          issues > 0
            ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        )}
      >
        {issues}
      </span>
    </div>
  );
}

function AuditEventRow({ event }: { event: McpAuditEvent }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-background px-2 py-2">
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30">
        {outcomeIcon(event.outcome, cn("size-3.5", outcomeTone(event.outcome)))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-foreground">
          {eventLabel(event)}
        </span>
        <span className="block truncate text-[10.5px] text-muted-foreground">
          {eventSubtitle(event)}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
          event.outcome === "ok"
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : event.outcome === "denied"
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : event.outcome === "notification"
                ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                : "bg-rose-500/10 text-rose-700 dark:text-rose-300",
        )}
      >
        {event.outcome}
      </span>
    </div>
  );
}

function skeletonClients(): McpAuditClientSummary[] {
  return [
    {
      clientId: "loading-client",
      events: 0,
      toolCalls: 0,
      errors: 0,
      denied: 0,
      notifications: 0,
    },
  ];
}

function skeletonEvents(): McpAuditEvent[] {
  return [
    {
      requestId: "loading-event",
      method: "tools/list",
      outcome: "notification",
    },
  ];
}
