"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Brain,
  BriefcaseBusiness,
  Database,
  FileText,
  GitBranch,
  ListChecks,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BrainSourceStatus = "enabled" | "blocked" | "unconfigured";
type BrainSourceKind =
  | "vault"
  | "memory"
  | "graph"
  | "dreams"
  | "action_graph"
  | "crm"
  | "project"
  | "communications"
  | "code";

interface BrainSourceSummary {
  id: string;
  name: string;
  kind: BrainSourceKind;
  serverName: string;
  status: BrainSourceStatus;
  permissions: string[];
  toolGroups: string[];
  allowedTools: string[];
  deniedTools: string[];
}

interface BrainSummary {
  generatedAt: string;
  cabinet: {
    path: string;
    name: string;
    scope: {
      scope: "company" | "personal" | "system";
      source: string;
    };
  };
  counts: {
    files: number;
    markdown: number;
    memoryFiles: number;
    agents: number;
    jobs: number;
    tasks: number;
    conversations: number;
    runningConversations: number;
    pendingTasks: number;
    pendingActions: number;
  };
  mcpPolicy: {
    source: string;
    enforcementMode: string;
    defaultDecision: string;
    enabledServers: number;
    totalServers: number;
  };
  sources: BrainSourceSummary[];
}

const KIND_LABELS: Record<BrainSourceKind, string> = {
  vault: "Vault",
  memory: "Memory",
  graph: "Memory graph",
  dreams: "Dreams",
  action_graph: "Action graph",
  crm: "CRM",
  project: "Delivery",
  communications: "Comms",
  code: "Code",
};

function SourceIcon({
  kind,
  className,
}: {
  kind: BrainSourceKind;
  className?: string;
}) {
  if (kind === "vault") return <Search className={className} />;
  if (kind === "memory") return <Database className={className} />;
  if (kind === "graph") return <Network className={className} />;
  if (kind === "dreams") return <Brain className={className} />;
  if (kind === "action_graph") return <Workflow className={className} />;
  if (kind === "crm") return <BriefcaseBusiness className={className} />;
  if (kind === "project") return <ListChecks className={className} />;
  if (kind === "communications") return <MessageSquare className={className} />;
  return <GitBranch className={className} />;
}

function numberLabel(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function OptaleBrainPanel({
  cabinetPath,
  className,
}: {
  cabinetPath: string;
  className?: string;
}) {
  const [summary, setSummary] = useState<BrainSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ cabinetPath });
      const response = await fetch(`/api/optale/brain?${params.toString()}`);
      if (!response.ok) throw new Error(`Brain fetch failed: ${response.status}`);
      setSummary((await response.json()) as BrainSummary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brain fetch failed");
    } finally {
      setLoading(false);
    }
  }, [cabinetPath]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const enabledSources = useMemo(
    () => summary?.sources.filter((source) => source.status === "enabled") ?? [],
    [summary?.sources]
  );
  const sourceGroups = useMemo(() => {
    const enabled = summary?.sources.filter((source) => source.status === "enabled") ?? [];
    const unavailable = summary?.sources.filter((source) => source.status !== "enabled") ?? [];
    return [...enabled, ...unavailable];
  }, [summary?.sources]);

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Brain className="size-4 text-cyan-500" />
            <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
              Brain
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {summary
              ? `${summary.cabinet.scope.scope} / ${enabledSources.length} sources`
              : "Loading sources"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void refresh()}
          disabled={loading}
          title="Refresh brain"
          aria-label="Refresh brain"
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
            icon={<FileText className="size-3.5 text-sky-500" />}
            label="Vault"
            value={summary ? numberLabel(summary.counts.markdown) : "-"}
            sub={summary ? `${numberLabel(summary.counts.files)} files` : "files"}
          />
          <Metric
            icon={<Database className="size-3.5 text-amber-500" />}
            label="Memory"
            value={summary ? numberLabel(summary.counts.memoryFiles) : "-"}
            sub="notes"
          />
          <Metric
            icon={<Network className="size-3.5 text-emerald-500" />}
            label="Graph"
            value={
              summary
                ? numberLabel(
                    summary.counts.agents +
                      summary.counts.tasks +
                      summary.counts.conversations
                  )
                : "-"
            }
            sub="nodes"
          />
        </div>

        <div className="space-y-2 px-3 py-3">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              {summary
                ? `${summary.mcpPolicy.enforcementMode} policy`
                : "policy"}
            </span>
            <span className="rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {summary
                ? `${summary.mcpPolicy.defaultDecision}/${summary.mcpPolicy.source}`
                : "loading"}
            </span>
          </div>

          {summary && summary.counts.pendingActions > 0 ? (
            <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              {summary.counts.pendingActions} pending agent action
              {summary.counts.pendingActions === 1 ? "" : "s"}
            </div>
          ) : null}

          <ul className="space-y-1.5">
            {sourceGroups.length === 0 && !loading ? (
              <li className="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[12px] text-muted-foreground">
                No brain sources configured.
              </li>
            ) : null}
            {(sourceGroups.length > 0 ? sourceGroups : skeletonSources()).map((source) => (
              <li
                key={source.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-2",
                  source.status === "enabled"
                    ? "border-border/70 bg-background"
                    : "border-border/40 bg-muted/20 opacity-70"
                )}
              >
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30">
                  {source.status === "enabled" ? (
                    <SourceIcon kind={source.kind} className="size-3.5 text-foreground/80" />
                  ) : (
                    <LockKeyhole className="size-3.5 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-foreground">
                    {source.name}
                  </span>
                  <span className="block truncate text-[10.5px] text-muted-foreground">
                    {KIND_LABELS[source.kind]} / {source.serverName || "native"}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                    source.status === "enabled"
                      ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {source.status}
                </span>
              </li>
            ))}
          </ul>
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
        <span className="truncate text-[10px] text-muted-foreground">{sub}</span>
      </div>
    </div>
  );
}

function skeletonSources(): BrainSourceSummary[] {
  return [
    {
      id: "loading-vault",
      name: "Loading",
      kind: "vault",
      serverName: "Loading",
      status: "blocked",
      permissions: [],
      toolGroups: [],
      allowedTools: [],
      deniedTools: [],
    },
  ];
}
