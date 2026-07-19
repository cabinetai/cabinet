"use client";

import { CheckCircle2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HermesSessionManager } from "@/components/agents/hermes-session-manager";
import { useCabinetRuntimeMode } from "@/hooks/use-cabinet-runtime-mode";

export function AdvancedHermesSettings() {
  const { status, loading, refresh } = useCabinetRuntimeMode();
  const healthy = status?.status === "online" || status?.status === "healthy";

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[14px] font-semibold">Advanced Hermes</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Hermes is the canonical runtime. It owns model selection, execution,
              sessions, tools, approvals, secrets, sudo, and recovery. Cabinet only
              presents and manages that state.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
            Refresh
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatusItem
            label="Runtime"
            value={status?.status || (loading ? "Checking" : "Unavailable")}
            healthy={healthy}
          />
          <StatusItem label="Profile" value={status?.profile || "operator-os"} healthy />
          <StatusItem label="Version" value={status?.version || "Not reported"} healthy={!!status?.version} />
        </div>

        {status?.message ? (
          <p className="mt-3 text-[11px] text-muted-foreground">{status.message}</p>
        ) : null}
      </div>

      <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
        <div className="flex gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          <div>
            <p className="text-xs font-semibold">Hermes source-of-truth boundary</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Legacy Cabinet providers, model controls, skills, memory, heartbeats,
              routines, and schedulers are unavailable in Hermes mode. Configuration
              changes remain read-only here until the Hermes management milestone.
            </p>
          </div>
        </div>
      </div>

      <HermesSessionManager />
    </div>
  );
}

function StatusItem({
  label,
  value,
  healthy,
}: {
  label: string;
  value: string;
  healthy: boolean;
}) {
  const Icon = healthy ? CheckCircle2 : TriangleAlert;
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className={healthy ? "size-3 text-emerald-500" : "size-3 text-amber-500"} />
        {label}
      </div>
      <p className="mt-1 truncate text-xs font-medium capitalize">{value}</p>
    </div>
  );
}
