"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileQuestion, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type HarnessStatus = "missing" | "present" | "in_sync" | "drift_unknown";

interface HarnessRow {
  definitionId: string;
  name: string;
  role: string;
  description: string;
  scope: "personal" | "company" | "system";
  memoryNamespace: string;
  provider: {
    id: string;
    name: string;
    model: string;
    modelAlias?: string;
  };
  projection: {
    slug: string;
    nativeAgentSlug: string;
    nativePersonaSlug: string;
    targetPath: string;
  };
  legacyLibreChatBridge?: {
    status: string;
    agentId: string;
  };
  mcp: {
    allowedServerCount: number;
    allowedServers: Array<{
      id: string;
      name?: string;
      permissions: string[];
      toolGroups: string[];
    }>;
  };
  persona: {
    targetPath: string;
    exists: boolean;
    active?: boolean;
    state?: "active" | "paused";
    provider?: string;
    adapterType?: string;
    model?: string;
    manifestId?: string;
    definitionId?: string;
    projectedAt?: string;
  };
  status: HarnessStatus;
  issues: string[];
}

interface HarnessSnapshot {
  manifestId: string;
  manifestSchemaVersion: number;
  targetAgentsDir: string;
  rows: HarnessRow[];
}

const STATUS_META: Record<
  HarnessStatus,
  {
    label: string;
    className: string;
    icon: typeof CheckCircle2;
  }
> = {
  in_sync: {
    label: "In sync",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    icon: CheckCircle2,
  },
  present: {
    label: "Present",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    icon: CheckCircle2,
  },
  drift_unknown: {
    label: "Drift unknown",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    icon: AlertTriangle,
  },
  missing: {
    label: "Missing",
    className: "border-muted bg-muted/30 text-muted-foreground",
    icon: FileQuestion,
  },
};

function providerModel(row: HarnessRow): string {
  return row.provider.modelAlias
    ? `${row.provider.modelAlias} (${row.provider.model})`
    : row.provider.model;
}

function statusBadge(status: HarnessStatus) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        meta.className
      )}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

function stateBadge(row: HarnessRow) {
  if (!row.persona.exists) {
    return (
      <span className="inline-flex rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
        Not generated
      </span>
    );
  }

  const paused = row.persona.active === false;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
        paused
          ? "bg-muted/50 text-muted-foreground"
          : "bg-emerald-500/10 text-emerald-300"
      )}
    >
      {paused ? "Paused" : "Active"}
    </span>
  );
}

function HarnessLoadingRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-lg border border-border/60 bg-muted/20"
        />
      ))}
    </div>
  );
}

export function AgentHarnessPanel() {
  const [snapshot, setSnapshot] = useState<HarnessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agents/harness", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Harness status failed (${response.status})`);
      }
      setSnapshot((await response.json()) as HarnessSnapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Harness status failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const counts = useMemo(() => {
    const rows = snapshot?.rows || [];
    return {
      total: rows.length,
      present: rows.filter((row) => row.persona.exists).length,
      inSync: rows.filter((row) => row.status === "in_sync").length,
      paused: rows.filter((row) => row.persona.exists && row.persona.active === false).length,
    };
  }, [snapshot]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold tracking-tight text-foreground">
            Agent Harness
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="rounded-full bg-muted/40 px-2 py-0.5">
              {snapshot?.manifestId || "optale-command.meta-agents"} v
              {snapshot?.manifestSchemaVersion || 1}
            </span>
            <span className="rounded-full bg-muted/40 px-2 py-0.5">
              {counts.present}/{counts.total || 9} personas
            </span>
            <span className="rounded-full bg-muted/40 px-2 py-0.5">
              {counts.inSync} in sync
            </span>
            <span className="rounded-full bg-muted/40 px-2 py-0.5">
              {counts.paused} paused
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-[11px]"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      ) : null}

      {loading && !snapshot ? (
        <HarnessLoadingRows />
      ) : snapshot ? (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-[12px]">
              <thead className="border-b border-border/70 bg-muted/25 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Agent</th>
                  <th className="px-3 py-2 font-medium">Projection</th>
                  <th className="px-3 py-2 font-medium">Provider</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">MCP</th>
                  <th className="px-3 py-2 font-medium">Native Target</th>
                  <th className="px-3 py-2 font-medium">Legacy Bridge</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {snapshot.rows.map((row) => (
                  <tr key={row.definitionId} className="align-top">
                    <td className="max-w-[210px] px-3 py-3">
                      <div className="font-medium text-foreground">{row.name}</div>
                      <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
                        {row.description || row.role}
                      </div>
                      <div className="mt-2 inline-flex rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {row.scope}
                      </div>
                    </td>
                    <td className="max-w-[190px] px-3 py-3">
                      <div className="font-mono text-[11px] text-foreground">
                        {row.projection.slug}
                      </div>
                      <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                        {row.definitionId}
                      </div>
                    </td>
                    <td className="max-w-[180px] px-3 py-3">
                      <div className="font-mono text-[11px] text-foreground">
                        {row.provider.id}
                      </div>
                      <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                        {providerModel(row)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {stateBadge(row)}
                      {row.persona.exists ? (
                        <div className="mt-2 font-mono text-[10px] text-muted-foreground">
                          {row.persona.provider || row.provider.id}
                          {" / "}
                          {row.persona.model || providerModel(row)}
                        </div>
                      ) : null}
                    </td>
                    <td className="max-w-[230px] px-3 py-3">
                      <div className="text-[11px] text-foreground">
                        {row.mcp.allowedServerCount} allowed
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.mcp.allowedServers.map((server) => (
                          <span
                            key={server.id}
                            className="rounded-full bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                            title={server.permissions.join(", ")}
                          >
                            {server.id}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="max-w-[210px] px-3 py-3">
                      <div className="font-mono text-[11px] text-foreground">
                        {row.projection.nativePersonaSlug}
                      </div>
                      <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                        {row.projection.targetPath}
                      </div>
                    </td>
                    <td className="max-w-[190px] px-3 py-3">
                      {row.legacyLibreChatBridge ? (
                        <>
                          <div className="font-mono text-[11px] text-foreground">
                            {row.legacyLibreChatBridge.agentId}
                          </div>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {row.legacyLibreChatBridge.status}
                          </div>
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">None</span>
                      )}
                    </td>
                    <td className="max-w-[190px] px-3 py-3">
                      {statusBadge(row.status)}
                      {row.issues.length > 0 ? (
                        <div className="mt-2 space-y-1 text-[10px] leading-4 text-muted-foreground">
                          {row.issues.slice(0, 3).map((issue) => (
                            <div key={issue}>{issue}</div>
                          ))}
                          {row.issues.length > 3 ? (
                            <div>+{row.issues.length - 3} more</div>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border/60 px-3 py-2 font-mono text-[10px] text-muted-foreground">
            {snapshot.targetAgentsDir}
          </div>
        </div>
      ) : null}
    </section>
  );
}
