"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  Bot,
  Box,
  Brain,
  ChevronRight,
  Clock3,
  Code2,
  Cpu,
  Gauge,
  MessageCircle,
  RefreshCw,
  Search,
  Server,
  Settings2,
  SlidersHorizontal,
  Users,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import type {
  HermesCapabilityProjection,
  HermesCapabilityStatus,
  HermesControlCenterSnapshot,
} from "@/lib/hermes/control-center-types";

type Mode = "operator" | "developer";
type Section = "overview" | "agents" | "messaging" | "artifacts" | "memory" | "automations" | "tools" | "sessions" | "settings" | "developer";

const SECTIONS: Array<{ id: Section; label: string; icon: typeof Gauge; groups: string[] }> = [
  { id: "overview", label: "Overview", icon: Gauge, groups: [] },
  { id: "agents", label: "Agents", icon: Users, groups: ["Agents"] },
  { id: "messaging", label: "Messaging", icon: MessageCircle, groups: ["Messaging"] },
  { id: "artifacts", label: "Artifacts", icon: Box, groups: ["Artifacts"] },
  { id: "memory", label: "Memory", icon: Brain, groups: ["Memory"] },
  { id: "automations", label: "Automations", icon: Clock3, groups: ["Automations"] },
  { id: "tools", label: "Tools", icon: Wrench, groups: ["Tools"] },
  { id: "sessions", label: "Sessions", icon: Archive, groups: ["Sessions"] },
  { id: "settings", label: "Settings", icon: Settings2, groups: ["Settings", "Providers and models", "Runtime"] },
  { id: "developer", label: "Developer", icon: Code2, groups: ["Developer"] },
];

const STATUS_LABELS: Record<HermesCapabilityStatus, string> = {
  available: "Available",
  connected: "Connected",
  degraded: "Degraded",
  disabled: "Disabled",
  unsupported: "Unsupported",
  needs_setup: "Needs setup",
};

const ICONS: Record<string, typeof Gauge> = {
  Overview: Gauge,
  Agents: Bot,
  Messaging: MessageCircle,
  Artifacts: Box,
  Automations: Clock3,
  Memory: Brain,
  Settings: Settings2,
  "Providers and models": Cpu,
  Runtime: Server,
  Tools: Wrench,
  Sessions: Archive,
  Developer: Code2,
};

function statusVariant(status: HermesCapabilityStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "connected") return "default";
  if (status === "degraded") return "destructive";
  if (status === "unsupported" || status === "disabled") return "outline";
  return "secondary";
}

function CapabilityStatus({ status }: { status: HermesCapabilityStatus }) {
  return <Badge variant={statusVariant(status)}>{STATUS_LABELS[status]}</Badge>;
}

function CapabilityRow({ capability, active, onSelect }: { capability: HermesCapabilityProjection; active: boolean; onSelect: () => void }) {
  const Icon = ICONS[capability.group] ?? SlidersHorizontal;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border/70 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary/5" : null
      )}
      data-testid={`hermes-capability-${capability.id}`}
    >
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{capability.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{capability.statusDetail}</span>
      </span>
      <CapabilityStatus status={capability.status} />
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function CapabilityInspector({ capability, snapshot }: { capability: HermesCapabilityProjection; snapshot: HermesControlCenterSnapshot }) {
  const detailRows = [
    ["Parity", capability.parityState],
    ["Installed support", capability.installedVersionSupport],
    ["Interface", capability.interface],
    ["Cabinet surface", capability.cabinetSurface],
    ["Risk", capability.readWriteRisk],
    ["Mode", capability.mode],
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="hermes-capability-inspector">
      <div className="flex flex-col gap-2 p-5 pe-12">
        <div className="flex items-center gap-2">
          <CapabilityStatus status={capability.status} />
          <Badge variant="outline">{capability.parityState}</Badge>
        </div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">{capability.name}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{capability.statusDetail}</p>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 p-5">
          <dl className="flex flex-col gap-3">
            {detailRows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-words font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <Separator />
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Missing work</h3>
            <p className="text-sm leading-6 text-muted-foreground">{capability.missingWork}</p>
          </section>
          {capability.id === "browser-opencli" ? (
            <section className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3" data-testid="opencli-module">
              <div>
                <h3 className="text-sm font-semibold">OpenCLI browser bridge</h3>
                <p className="text-xs text-muted-foreground">External connection, not a duplicate Hermes skill</p>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-muted-foreground">Version</dt><dd className="font-medium">{snapshot.live.openCliVersion ?? "Unavailable"}</dd></div>
                <div><dt className="text-muted-foreground">Profiles</dt><dd className="font-medium">{snapshot.live.openCliProfiles} connected</dd></div>
                <div className="col-span-2"><dt className="text-muted-foreground">Binary</dt><dd className="break-all font-mono">{snapshot.live.openCliBinaryLocation ?? "Not found"}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(snapshot.live.openCliCapabilities).map(([name, supported]) => (
                  <Badge key={name} variant={supported ? "secondary" : "outline"}>{name} {supported ? "available" : "unavailable"}</Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">The acceptance check opens a local page, reads its title and DOM evidence, and captures a screenshot without an external write.</p>
            </section>
          ) : null}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Evidence</h3>
            <p className="text-sm leading-6 text-muted-foreground">{capability.testEvidence}</p>
            <p className="text-xs text-muted-foreground">Desktop {snapshot.installed.desktopVersion} ({snapshot.installed.desktopCommit}) · Backend {snapshot.installed.backendVersion ?? "unknown"}</p>
          </section>
          <Button variant="outline" size="sm" onClick={() => { window.location.href = capability.cabinetHref; }}>
            Open Cabinet surface
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-full flex-col gap-4 p-5" aria-label="Loading Hermes Control Center">
      <div className="flex items-center justify-between"><Skeleton className="h-9 w-48" /><Skeleton className="h-9 w-80" /></div>
      <Skeleton className="h-12 w-full" />
      <div className="grid min-h-0 flex-1 grid-cols-[12rem_minmax(0,1fr)_20rem] gap-4"><Skeleton /><Skeleton /><Skeleton /></div>
    </div>
  );
}

export function HermesControlCenter() {
  const isMobile = useIsMobile();
  const [snapshot, setSnapshot] = useState<HermesControlCenterSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("operator");
  const [section, setSection] = useState<Section>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/hermes/control-center", { cache: "no-store" });
      const body = await response.json() as HermesControlCenterSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error || "Hermes Control Center is unavailable.");
      setSnapshot(body);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Hermes Control Center is unavailable.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "developer") setMode("developer");
    const requestedSection = params.get("section") as Section | null;
    if (requestedSection && SECTIONS.some((item) => item.id === requestedSection)) setSection(requestedSection);
    const requestedCapability = params.get("capability");
    if (requestedCapability) setSelectedId(requestedCapability);
  }, []);

  const capabilities = useMemo(() => {
    if (!snapshot) return [];
    const needle = query.trim().toLowerCase();
    const activeSection = SECTIONS.find((item) => item.id === section);
    return snapshot.capabilities.filter((item) => {
      if (mode === "operator" && item.mode === "Developer") return false;
      if (mode === "developer" && item.mode !== "Developer") return false;
      if (activeSection && activeSection.groups.length && !activeSection.groups.includes(item.group)) return false;
      if (!needle) return true;
      return [item.name, item.group, item.statusDetail, item.interface, item.cabinetSurface, ...item.keywords].join(" ").toLowerCase().includes(needle);
    });
  }, [mode, query, section, snapshot]);

  const selected = snapshot?.capabilities.find((item) => item.id === selectedId) ?? null;
  if (!snapshot && !error) return <Loading />;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="hermes-control-center">
      <header className="flex flex-col gap-3 border-b border-border bg-background px-4 py-3 md:pe-5 md:ps-28">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-40 flex-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">Hermes</h1>
            <p className="text-xs text-muted-foreground">Capability visibility and control</p>
          </div>
          <div className="relative hidden w-full max-w-md md:block">
            <Search className="pointer-events-none absolute start-2.5 top-2 size-4 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search capabilities, tools, models..." aria-label="Search Hermes capabilities" className="ps-9" />
          </div>
          <Tabs value={mode} onValueChange={(value) => { const next = value as Mode; setMode(next); setSection(next === "developer" ? "developer" : "overview"); setSelectedId(null); }}>
            <TabsList>
              <TabsTrigger value="operator"><Users data-icon="inline-start" />Operator</TabsTrigger>
              <TabsTrigger value="developer"><Code2 data-icon="inline-start" />Developer</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="icon-sm" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh Hermes status">
            <RefreshCw className={cn(refreshing ? "animate-spin" : null)} />
          </Button>
        </div>
        <div className="relative md:hidden">
          <Search className="pointer-events-none absolute start-2.5 top-2 size-4 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Hermes" aria-label="Search Hermes capabilities" className="ps-9" />
        </div>
        {snapshot ? (
          <div className="flex items-center gap-2 overflow-x-auto text-xs text-muted-foreground" data-testid="hermes-version-strip">
            <Badge variant={snapshot.health.runtime === "online" ? "default" : "destructive"}>Runtime {snapshot.installed.backendVersion ?? "unknown"}</Badge>
            <Badge variant="outline">Desktop {snapshot.installed.desktopVersion}</Badge>
            <span className="whitespace-nowrap">Gateway {snapshot.health.gateway}</span>
            <span className="whitespace-nowrap">Profile {snapshot.health.profile}</span>
            {snapshot.installed.updateAvailable ? <span className="whitespace-nowrap text-warning">Upstream is {snapshot.installed.upstreamAheadBy} commits ahead</span> : null}
          </div>
        ) : null}
      </header>

      {error ? <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{error}</div> : null}
      {snapshot ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[11rem_minmax(0,1fr)] xl:grid-cols-[11rem_minmax(0,1fr)_22rem]">
          <nav className="hidden min-h-0 border-e border-border p-2 md:flex md:flex-col" aria-label="Hermes Control Center">
            {SECTIONS.filter((item) => mode === "developer" ? item.id === "developer" : item.id !== "developer").map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" onClick={() => { setSection(item.id); setSelectedId(null); }} className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors", section === item.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
                  <Icon className="size-4" aria-hidden="true" /><span>{item.label}</span>
                </button>
              );
            })}
            <div className="mt-auto px-3 py-3 text-xs text-muted-foreground">{mode === "operator" ? "Developer surfaces hidden" : "Technical surfaces visible"}</div>
          </nav>

          <main className="flex min-h-0 min-w-0 flex-col bg-muted/20" data-testid={`hermes-section-${section}`}>
            {section === "overview" && !query ? (
              <div className="grid grid-cols-3 border-b border-border bg-background lg:grid-cols-6" data-testid="hermes-status-summary">
                {(Object.keys(STATUS_LABELS) as HermesCapabilityStatus[]).map((status) => (
                  <div key={status} className="flex min-w-0 flex-col gap-0.5 border-e border-border px-3 py-2 last:border-e-0">
                    <span className="text-lg font-semibold tabular-nums">{snapshot.summary[status]}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{STATUS_LABELS[status]}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <ScrollArea className="min-h-0 flex-1">
              <div className="mx-auto w-full max-w-4xl p-3 md:p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">{mode === "developer" ? "Developer capabilities" : SECTIONS.find((item) => item.id === section)?.label}</h2>
                    <p className="text-xs text-muted-foreground">{capabilities.length} capabilities visible</p>
                  </div>
                  <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                    <span>Operator {snapshot.parity.operator}%</span><span>Management {snapshot.parity.management}%</span><span>Developer {snapshot.parity.developer}%</span>
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm" data-testid="hermes-capability-list">
                  {capabilities.length ? capabilities.map((item) => <CapabilityRow key={item.id} capability={item} active={selectedId === item.id} onSelect={() => setSelectedId(item.id)} />) : <div className="p-8 text-center text-sm text-muted-foreground">No capabilities match this view.</div>}
                </div>
              </div>
            </ScrollArea>
          </main>

          <aside className="hidden min-h-0 border-s border-border bg-background xl:flex">
            {selected ? <CapabilityInspector capability={selected} snapshot={snapshot} /> : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <Activity className="size-6" aria-hidden="true" /><p className="text-sm">Select a capability to inspect support, parity, risk, and evidence.</p>
              </div>
            )}
          </aside>

          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 pb-[max(env(safe-area-inset-bottom),0px)] backdrop-blur md:hidden" aria-label="Hermes mobile">
            {(["overview", "agents", "tools", "sessions", mode === "developer" ? "developer" : "settings"] as Section[]).map((itemId) => {
              const item = SECTIONS.find((entry) => entry.id === itemId)!;
              const Icon = item.icon;
              return <button key={item.id} type="button" onClick={() => { setSection(item.id); setSelectedId(null); }} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[10px]", section === item.id ? "text-primary" : "text-muted-foreground")}><Icon className="size-4" aria-hidden="true" /><span>{item.label}</span></button>;
            })}
          </nav>

          {isMobile && selected ? (
            <Sheet open onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
              <SheetContent side="right" className="w-[92vw] max-w-none p-0">
                <SheetHeader className="sr-only"><SheetTitle>{selected.name}</SheetTitle><SheetDescription>Hermes capability details</SheetDescription></SheetHeader>
                <CapabilityInspector capability={selected} snapshot={snapshot} />
              </SheetContent>
            </Sheet>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
