"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Bot,
  Brain,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Command,
  KeyRound,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  OptaleResourceKind,
  OptaleResourceRecord,
  OptaleResourceRegistry,
} from "@/lib/optale/resource-registry";

const KIND_LABELS: Record<OptaleResourceKind, string> = {
  space: "Spaces",
  agent: "Agents",
  job: "Jobs",
  task: "Tasks",
  conversation: "Runs",
  brain_source: "Brain",
  mcp_server: "Sources",
  mcp_client: "Clients",
  mcp_policy: "Policy",
  action_type: "Actions",
};

const FILTERS: Array<{ kind: OptaleResourceKind; label: string }> = [
  { kind: "space", label: "Spaces" },
  { kind: "agent", label: "Agents" },
  { kind: "task", label: "Tasks" },
  { kind: "conversation", label: "Runs" },
  { kind: "brain_source", label: "Brain" },
  { kind: "mcp_client", label: "Clients" },
  { kind: "action_type", label: "Actions" },
];

function ResourceIcon({
  kind,
  className,
}: {
  kind: OptaleResourceKind;
  className?: string;
}) {
  if (kind === "space") return <Boxes className={className} />;
  if (kind === "agent") return <Bot className={className} />;
  if (kind === "job") return <CalendarClock className={className} />;
  if (kind === "task") return <ClipboardList className={className} />;
  if (kind === "conversation") return <MessageSquare className={className} />;
  if (kind === "brain_source") return <Brain className={className} />;
  if (kind === "mcp_server") return <Server className={className} />;
  if (kind === "mcp_client") return <KeyRound className={className} />;
  if (kind === "mcp_policy") return <ShieldCheck className={className} />;
  return <Workflow className={className} />;
}

function statusTone(status?: string): string {
  const normalized = status?.toLowerCase() || "";
  if (
    normalized.includes("active") ||
    normalized.includes("enabled") ||
    normalized.includes("available") ||
    normalized.includes("connected") ||
    normalized.includes("completed") ||
    normalized.includes("ok")
  ) {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (
    normalized.includes("failed") ||
    normalized.includes("blocked") ||
    normalized.includes("disabled")
  ) {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (
    normalized.includes("running") ||
    normalized.includes("pending") ||
    normalized.includes("paused")
  ) {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

function matchesSearch(
  resource: OptaleResourceRecord,
  search: string,
): boolean {
  if (!search) return true;
  const haystack = [
    resource.id,
    resource.kind,
    resource.label,
    resource.description,
    resource.status,
    resource.cabinetPath,
    resource.source,
    ...resource.facts.flatMap((fact) => [fact.label, String(fact.value)]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function formatGeneratedAt(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OptaleResourceRegistryWorkspace({
  cabinetPath,
}: {
  cabinetPath: string;
}) {
  const [registry, setRegistry] = useState<OptaleResourceRegistry | null>(null);
  const [activeKind, setActiveKind] = useState<OptaleResourceKind | "all">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cabinetPath,
        visibilityMode: "all",
        limit: "300",
      });
      const response = await fetch(
        `/api/optale/resources?${params.toString()}`,
      );
      if (!response.ok) {
        throw new Error(`Resource registry fetch failed: ${response.status}`);
      }
      setRegistry((await response.json()) as OptaleResourceRegistry);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Resource registry fetch failed",
      );
    } finally {
      setLoading(false);
    }
  }, [cabinetPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredResources = useMemo(() => {
    const resources = registry?.resources || [];
    return resources.filter(
      (resource) =>
        (activeKind === "all" || resource.kind === activeKind) &&
        matchesSearch(resource, search.trim()),
    );
  }, [activeKind, registry?.resources, search]);

  return (
    <main className="flex min-h-full flex-col bg-background">
      <section className="border-b border-border/70 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">
              <Command className="size-3.5" />
              Optale Command
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-foreground">
              Resource Registry
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Spaces, agents, runs, Brain sources, MCP clients, policies, and
              actions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {registry?.generatedAt && (
              <span className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
                {formatGeneratedAt(registry.generatedAt)}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-border/70 px-6 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveKind("all")}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                activeKind === "all"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              All {registry?.resources.length ?? 0}
            </button>
            {FILTERS.map((filter) => (
              <button
                key={filter.kind}
                type="button"
                onClick={() => setActiveKind(filter.kind)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  activeKind === filter.kind
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {filter.label} {registry?.counts[filter.kind] ?? 0}
              </button>
            ))}
          </div>
          <div className="relative w-full xl:w-[320px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search resources"
              className="h-9 pl-8"
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="mx-6 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="grid gap-3 px-6 py-5 xl:grid-cols-2">
        {loading && !registry ? (
          <div className="col-span-full flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading resources
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="col-span-full flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            No matching resources.
          </div>
        ) : (
          filteredResources.map((resource) => (
            <article
              key={resource.id}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                    <ResourceIcon kind={resource.kind} className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold tracking-normal text-foreground">
                        {resource.href ? (
                          <a href={resource.href} className="hover:underline">
                            {resource.label}
                          </a>
                        ) : (
                          resource.label
                        )}
                      </h2>
                      <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {KIND_LABELS[resource.kind]}
                      </span>
                    </div>
                    {resource.description && (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {resource.description}
                      </p>
                    )}
                  </div>
                </div>
                {resource.status && (
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                      statusTone(resource.status),
                    )}
                  >
                    <CircleDot className="size-2.5" />
                    {resource.status}
                  </span>
                )}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CheckCircle2 className="size-3" />
                  {resource.source}
                </div>
                {resource.cabinetPath && (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {resource.cabinetPath}
                  </div>
                )}
              </div>

              {resource.facts.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {resource.facts.slice(0, 6).map((fact) => (
                    <span
                      key={`${resource.id}:${fact.label}`}
                      className="rounded-md border border-border/70 bg-background px-2 py-1 text-[11px] text-muted-foreground"
                    >
                      {fact.label}:{" "}
                      <span className="text-foreground/80">
                        {String(fact.value)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
