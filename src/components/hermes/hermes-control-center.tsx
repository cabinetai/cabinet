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
  Ellipsis,
  Gauge,
  MessageCircle,
  RefreshCw,
  Search,
  Server,
  Settings2,
  SlidersHorizontal,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { HermesLiveModules } from "@/components/hermes/hermes-live-modules";
import type {
  HermesCapabilityProjection,
  HermesCapabilityStatus,
  HermesControlCenterSnapshot,
  HermesOperationalHealth,
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

const HEALTH_LABELS: Record<HermesOperationalHealth, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  conflicting_evidence: "Conflicting evidence",
  not_configured: "Not configured",
  unavailable: "Unavailable",
  unknown: "Unknown",
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

function CapabilityStatus({ status, surfaceState }: { status: HermesCapabilityStatus; surfaceState?: HermesCapabilityProjection["surfaceState"] }) {
  if (surfaceState === "diagnostic_only") return <Badge variant="outline">Diagnostic only</Badge>;
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
      <CapabilityStatus status={capability.status} surfaceState={capability.surfaceState} />
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function CapabilityInspector({ capability, snapshot }: { capability: HermesCapabilityProjection; snapshot: HermesControlCenterSnapshot }) {
  const detailRows = [
    ["Cabinet surface", capability.surfaceState],
    ["Installed support", capability.installedSupport.detail],
    ["Current health", HEALTH_LABELS[capability.operationalHealth]],
    ["Interface", capability.interface],
    ["Cabinet surface", capability.cabinetSurface],
    ["Risk", capability.readWriteRisk],
    ["Mode", capability.mode],
  ];
  const creditRows = [
    ["Discoverable", capability.credit.discoverability],
    ["Current live visibility", capability.credit.liveVisibility],
    ["Governed control", capability.credit.governedManagement],
    ["Live proven", capability.credit.liveProven],
  ] as const;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="hermes-capability-inspector">
      <div className="flex flex-col gap-2 p-5 pe-12">
        <div className="flex items-center gap-2">
          <CapabilityStatus status={capability.status} surfaceState={capability.surfaceState} />
          <Badge variant="outline">{capability.parityState}</Badge>
        </div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">{capability.name}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{capability.operationalDetail}</p>
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
            <h3 className="text-sm font-semibold">Parity credit</h3>
            <div className="grid grid-cols-2 gap-2">
              {creditRows.map(([label, earned]) => (
                <div key={label} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2 text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <Badge variant={earned ? "secondary" : "outline"}>{earned ? "Credited" : "Not credited"}</Badge>
                </div>
              ))}
            </div>
          </section>
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
            {capability.evidence.length ? capability.evidence.map((evidence, index) => (
              <div key={`${evidence.source}-${index}`} className="rounded-lg border border-border p-3 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{evidence.proofKind.replaceAll("_", " ")}</Badge>
                  <Badge variant={evidence.outcome === "failure" || evidence.outcome === "conflict" ? "destructive" : "secondary"}>{evidence.outcome}</Badge>
                  {evidence.stale ? <Badge variant="outline">Stale</Badge> : null}
                </div>
                <p className="mt-2 font-medium">{evidence.source}</p>
                <p className="mt-1 leading-5 text-muted-foreground">{evidence.summary}</p>
                <p className="mt-1 text-muted-foreground">Observed {evidence.observedAt ?? "time unknown"} · Backend {evidence.installedBackendVersion ?? "unknown"}</p>
              </div>
            )) : <p className="text-sm text-muted-foreground">No current runtime evidence is available for this discoverable capability.</p>}
            <p className="text-xs text-muted-foreground">Desktop {snapshot.installed.desktopVersion ?? "Unknown"} ({snapshot.installed.desktopCommit ?? "commit unknown"}) · Backend {snapshot.installed.backendVersion ?? "Unknown"} ({snapshot.installed.backendCommit ?? "commit unknown"})</p>
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
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
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
  const derivedExceptions = snapshot?.capabilities.flatMap((capability) =>
    capability.surfaceState !== "unsupported" && ["degraded", "conflicting_evidence", "unavailable"].includes(capability.operationalHealth)
      ? [{ capabilityId: capability.id, title: capability.name, health: capability.operationalHealth as "degraded" | "conflicting_evidence" | "unavailable", summary: capability.operationalDetail }]
      : []
  ) ?? [];
  const operationalExceptions = snapshot?.exceptions?.length ? snapshot.exceptions : derivedExceptions;
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
            <Badge variant={snapshot.health.runtime === "healthy" ? "default" : "destructive"}>Runtime {snapshot.installed.backendVersion ?? "unknown"}</Badge>
            <Badge variant="outline">Desktop {snapshot.installed.desktopVersion ?? "Unknown"}</Badge>
            <span className="whitespace-nowrap">Gateway {snapshot.health.gateway}</span>
            <span className="whitespace-nowrap">Profile {snapshot.health.profile}</span>
            <span className="whitespace-nowrap text-warning">
              {snapshot.installed.upstreamAudit.stale
                ? "Upstream audit is stale"
                : `Audited upstream: ${snapshot.installed.upstreamAudit.commitsBehind} commits ahead`}
            </span>
          </div>
        ) : null}
      </header>

      {snapshot?.provenance.kind === "acceptance_fixture" ? (
        <Alert className="m-3 mb-0 border-warning/40 bg-warning/5 md:ms-28" data-testid="hermes-fixture-provenance">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{snapshot.provenance.label}</AlertTitle>
          <AlertDescription className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Fixture ID: {snapshot.provenance.fixtureId}</span>
            <span>Captured: {snapshot.provenance.capturedAt}</span>
          </AlertDescription>
        </Alert>
      ) : null}

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
                {section === "overview" && !query && operationalExceptions.length ? (
                  <section className="mb-4 space-y-2" data-testid="hermes-operational-exceptions">
                    <div>
                      <h2 className="text-sm font-semibold">Operational exceptions</h2>
                      <p className="text-xs text-muted-foreground">Only degraded or contradictory observations are elevated.</p>
                    </div>
                    {operationalExceptions.map((exception) => (
                      <button key={exception.capabilityId} type="button" className="block w-full text-left" onClick={() => setSelectedId(exception.capabilityId)}>
                        <Alert variant="destructive" className="transition-colors hover:bg-destructive/5">
                          <TriangleAlert aria-hidden="true" />
                          <AlertTitle>{exception.title} · {HEALTH_LABELS[exception.health]}</AlertTitle>
                          <AlertDescription className="line-clamp-2">{exception.summary}</AlertDescription>
                        </Alert>
                      </button>
                    ))}
                  </section>
                ) : null}
                {(["agents", "messaging", "artifacts", "memory", "sessions", "settings", "tools"] as Section[]).includes(section) ? (
                  <div className="mb-4">
                    <HermesLiveModules section={section as "agents" | "messaging" | "artifacts" | "memory" | "sessions" | "settings" | "tools"} snapshot={snapshot} query={query} onRefresh={refresh} refreshing={refreshing} />
                  </div>
                ) : null}
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">{mode === "developer" ? "Developer capabilities" : SECTIONS.find((item) => item.id === section)?.label}</h2>
                    <p className="text-xs text-muted-foreground">{capabilities.length} capabilities visible</p>
                  </div>
                  <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex" data-testid="hermes-parity-metrics">
                    <span>Discoverable {snapshot.parity.discoverability.percentage}%</span>
                    <span>Live {snapshot.parity.liveVisibility.percentage}%</span>
                    <span>Managed {snapshot.parity.governedManagement.percentage}%</span>
                    <span>Proven {snapshot.parity.liveProven.percentage}%</span>
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
            {(["overview", "agents", "tools", "sessions"] as Section[]).map((itemId) => {
              const item = SECTIONS.find((entry) => entry.id === itemId)!;
              const Icon = item.icon;
              return <button key={item.id} type="button" onClick={() => { setSection(item.id); setSelectedId(null); }} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[10px]", section === item.id ? "text-primary" : "text-muted-foreground")}><Icon className="size-4" aria-hidden="true" /><span>{item.label}</span></button>;
            })}
            <Button variant="ghost" className={cn("h-auto min-h-14 rounded-none flex-col gap-1 text-[10px]", ["messaging", "artifacts", "memory", "automations", "settings", "developer"].includes(section) ? "text-primary" : "text-muted-foreground")} aria-label="More Hermes sections" onClick={() => setMobileMoreOpen(true)}>
              <Ellipsis className="size-4" aria-hidden="true" /><span>More</span>
            </Button>
          </nav>

          {isMobile ? (
            <Sheet open={mobileMoreOpen} onOpenChange={setMobileMoreOpen}>
              <SheetContent side="right" className="w-[82vw] max-w-sm p-0">
                <SheetHeader className="border-b border-border p-4">
                  <SheetTitle>Hermes sections</SheetTitle>
                  <SheetDescription>Choose an operator capability area.</SheetDescription>
                  {snapshot.provenance.kind === "acceptance_fixture" ? (
                    <div className="mt-2 rounded-md border border-warning/40 bg-warning/5 p-2 text-xs text-muted-foreground" data-testid="hermes-mobile-fixture-provenance">
                      <p className="font-medium text-foreground">{snapshot.provenance.label}</p>
                      <p>Fixture ID: {snapshot.provenance.fixtureId}</p>
                      <p>Captured: {snapshot.provenance.capturedAt}</p>
                    </div>
                  ) : null}
                </SheetHeader>
                <div className="grid gap-1 p-3">
                  {(mode === "developer" ? ["developer"] : ["messaging", "artifacts", "memory", "automations", "settings"]).map((itemId) => {
                    const item = SECTIONS.find((entry) => entry.id === itemId)!;
                    const Icon = item.icon;
                    return <Button key={item.id} variant="ghost" className="h-11 justify-start" onClick={() => { setSection(item.id); setSelectedId(null); setMobileMoreOpen(false); }}><Icon data-icon="inline-start" />{item.label}</Button>;
                  })}
                </div>
              </SheetContent>
            </Sheet>
          ) : null}

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
