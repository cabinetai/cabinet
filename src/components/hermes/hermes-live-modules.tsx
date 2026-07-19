"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Bot,
  Box,
  Brain,
  CircleOff,
  Clock3,
  Mic,
  Radio,
  RefreshCw,
  Server,
  Volume2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { HermesControlCenterSnapshot } from "@/lib/hermes/control-center-types";

type OperatorData = HermesControlCenterSnapshot["live"]["operator"];
type LiveSection = "agents" | "messaging" | "artifacts" | "memory" | "sessions" | "settings" | "tools";

function relativeTime(value: string | null): string {
  if (!value) return "Not reported";
  const delta = Date.now() - Date.parse(value);
  if (!Number.isFinite(delta)) return value;
  const minutes = Math.max(0, Math.round(delta / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
      <CircleOff className="size-5" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function ModuleShell({ title, detail, icon: Icon, children }: { title: string; detail: string; icon: typeof Activity; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background" data-testid={`hermes-live-${title.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <Separator />
      {children}
    </section>
  );
}

function AgentsModule({ data }: { data: OperatorData }) {
  const agents = [...data.agents.active, ...data.agents.recent];
  return (
    <ModuleShell title="Runtime agents" detail="Live workers are separate from persistent Hermes profiles." icon={Bot}>
      {!data.agents.available ? <EmptyState>Agent worker API is unavailable. No workers were invented.</EmptyState> : agents.length === 0 ? <EmptyState>No active or recently completed runtime agents.</EmptyState> : (
        <div className="divide-y divide-border">
          {agents.map((agent) => (
            <div key={`${agent.id}-${agent.state}`} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{agent.task}</p>
                  <Badge variant={agent.error ? "destructive" : "secondary"}>{agent.state}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Profile {agent.profile ?? "not reported"} · Started {relativeTime(agent.startedAt)}
                </p>
                {agent.currentAction ? <p className="mt-1 truncate text-xs">Current: {agent.currentAction}</p> : null}
                {agent.error ? <p className="mt-1 text-xs text-destructive">{agent.error}</p> : agent.result ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{agent.result}</p> : null}
              </div>
              <Button variant="outline" size="sm" disabled title={agent.canInterrupt ? "Owner review is required before enabling this governed mutation" : "Installed API does not report a supported interrupt"}>
                Interrupt
              </Button>
            </div>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}

function MessagingModule({ data, query }: { data: OperatorData; query: string }) {
  const needle = query.trim().toLowerCase();
  const platforms = data.messaging.filter((item) => {
    const matches = !needle || `${item.name} ${item.connectionState}`.toLowerCase().includes(needle);
    const actionable = item.configured || item.enabled || !["disabled", "not configured"].includes(item.connectionState.toLowerCase());
    return matches && (Boolean(needle) || actionable);
  });
  const dormantCount = data.messaging.filter((item) => !item.configured && !item.enabled && ["disabled", "not configured"].includes(item.connectionState.toLowerCase())).length;
  return (
    <ModuleShell title="Messaging platforms" detail="Credential values are removed before this response reaches the browser." icon={Radio}>
      {platforms.length === 0 ? <EmptyState>No messaging platforms match this view.</EmptyState> : (
        <div className="divide-y divide-border">
          {platforms.map((platform) => (
            <div key={platform.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{platform.name}</p>
                  <Badge variant={platform.connectionState === "connected" ? "default" : "outline"}>{platform.connectionState}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Incoming {platform.incomingTriggers ? "enabled" : "disabled"} · Outbound {platform.outboundDelivery.replaceAll("_", " ")} · Destination {platform.accountOrChannel ?? "not configured"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Last success {relativeTime(platform.lastSuccessfulEvent)}{platform.lastError ? ` · Error: ${platform.lastError}` : ""}</p>
              </div>
              <Button variant="outline" size="sm" disabled>Test requires owner approval</Button>
            </div>
          ))}
          {!needle && dormantCount ? <p className="px-4 py-3 text-xs text-muted-foreground">{dormantCount} additional platforms are available but not configured. Search by platform name to inspect one.</p> : null}
        </div>
      )}
    </ModuleShell>
  );
}

function ArtifactsModule({ data, query }: { data: OperatorData; query: string }) {
  const needle = query.trim().toLowerCase();
  const artifacts = data.artifacts.filter((item) => !needle || `${item.name} ${item.kind}`.toLowerCase().includes(needle)).slice(0, 40);
  return (
    <ModuleShell title="Global artifacts" detail={`${data.artifacts.length} current Hermes-managed files indexed.`} icon={Box}>
      {artifacts.length === 0 ? <EmptyState>No artifacts match this view.</EmptyState> : (
        <div className="divide-y divide-border">
          {artifacts.map((artifact) => (
            <div key={artifact.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{artifact.name}</p>
                <p className="truncate text-xs text-muted-foreground">{artifact.kind} · {artifact.size.toLocaleString()} bytes · {relativeTime(artifact.createdAt)}</p>
              </div>
              <Badge variant="outline">{artifact.mimeType ?? "unknown type"}</Badge>
            </div>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}

function MemoryModule({ data }: { data: OperatorData }) {
  const graph = data.memoryGraph;
  return (
    <ModuleShell title="Memory and Starmap" detail="Only Hermes-reported nodes and edges are rendered." icon={Brain}>
      <div className="grid grid-cols-2 border-b border-border">
        <div className="px-4 py-3"><p className="text-lg font-semibold tabular-nums">{graph.stats.nodes}</p><p className="text-xs text-muted-foreground">Reported nodes</p></div>
        <div className="border-s border-border px-4 py-3"><p className="text-lg font-semibold tabular-nums">{graph.stats.edges}</p><p className="text-xs text-muted-foreground">Reported relationships</p></div>
      </div>
      {graph.nodes.length === 0 ? <EmptyState>Hermes reports an empty memory graph. No relationships are inferred.</EmptyState> : (
        <div className="divide-y divide-border">
          {graph.nodes.slice(0, 40).map((node) => <div key={node.id} className="px-4 py-2.5"><p className="text-sm font-medium">{node.label}</p><p className="text-xs text-muted-foreground">{node.source ?? "Unknown source"} · {relativeTime(node.age)} · {node.profile ?? "No profile reported"}</p></div>)}
        </div>
      )}
    </ModuleShell>
  );
}

function SessionsModule({ data, query }: { data: OperatorData; query: string }) {
  const needle = query.trim().toLowerCase();
  const sessions = data.sessions.filter((item) => !needle || `${item.title} ${item.profile ?? ""} ${item.status}`.toLowerCase().includes(needle)).slice(0, 50);
  return (
    <ModuleShell title="Sessions and archives" detail={`${data.sessions.length} canonical Hermes sessions reported.`} icon={Clock3}>
      {sessions.length === 0 ? <EmptyState>No sessions match this view.</EmptyState> : (
        <div className="divide-y divide-border">
          {sessions.map((session) => (
            <div key={session.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{session.title}</p>
                <p className="truncate text-xs text-muted-foreground">{session.profile ?? "No profile"} · {session.status} · Updated {relativeTime(session.updatedAt)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { window.location.href = "/agents"; }}>Open sessions</Button>
            </div>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}

const NOTIFICATION_EVENTS = [
  "Approval needed", "Input needed", "Turn complete", "Turn failed", "Background task complete", "Background task failed",
] as const;

function NotificationsModule() {
  const [permission, setPermission] = useState("unavailable");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(NOTIFICATION_EVENTS.map((event) => [event, true])));
  const [sound, setSound] = useState(true);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
      try {
        const saved = window.localStorage.getItem("cabinet.hermes.notifications.v1");
        if (saved) {
          const parsed = JSON.parse(saved) as { enabled?: Record<string, boolean>; sound?: boolean };
          if (parsed.enabled) setEnabled(parsed.enabled);
          if (typeof parsed.sound === "boolean") setSound(parsed.sound);
        }
      } catch {}
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const persist = (nextEnabled: Record<string, boolean>, nextSound: boolean) => {
    setEnabled(nextEnabled);
    setSound(nextSound);
    window.localStorage.setItem("cabinet.hermes.notifications.v1", JSON.stringify({ enabled: nextEnabled, sound: nextSound }));
  };
  return (
    <ModuleShell title="Cabinet-local notification preferences" detail={`Cabinet-local preferences mapped to Hermes events · Browser permission ${permission}. These are not canonical Hermes Desktop notification settings, and no permission prompt is triggered here.`} icon={Bell}>
      <FieldSet className="gap-0">
        <FieldLegend className="sr-only">Notification events</FieldLegend>
        <FieldGroup className="gap-0 divide-y divide-border">
          {NOTIFICATION_EVENTS.map((event) => <Field key={event} orientation="horizontal" className="px-4 py-2.5"><FieldLabel htmlFor={`notification-${event}`} className="font-normal">{event}</FieldLabel><Switch id={`notification-${event}`} checked={enabled[event] !== false} onCheckedChange={(checked) => persist({ ...enabled, [event]: checked }, sound)} aria-label={event} /></Field>)}
          <Field orientation="horizontal" className="px-4 py-2.5"><FieldLabel htmlFor="notification-sound" className="font-normal">Completion sound</FieldLabel><Switch id="notification-sound" checked={sound} onCheckedChange={(checked) => persist(enabled, checked)} aria-label="Completion sound" /></Field>
        </FieldGroup>
        <div className="flex justify-end px-4 py-3"><Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new CustomEvent("cabinet:toast", { detail: { kind: "success", message: "Cabinet notification test passed." } }))}>Test in-app notification</Button></div>
      </FieldSet>
    </ModuleShell>
  );
}

function VoiceModule({ data }: { data: OperatorData }) {
  const [permission, setPermission] = useState("unknown");
  useEffect(() => {
    if (!navigator.permissions?.query) return;
    void navigator.permissions.query({ name: "microphone" as PermissionName }).then((result) => setPermission(result.state)).catch(() => setPermission("unknown"));
  }, []);
  return (
    <ModuleShell title="Voice" detail="Voice input can prepare text, but never executes consequential work automatically." icon={Mic}>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Microphone permission</p><p className="mt-1 text-sm font-medium">{permission}</p></div>
        <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Hermes audio interfaces</p><p className="mt-1 text-sm font-medium">Transcribe {data.voice.transcriptionAvailable === null ? "unknown" : data.voice.transcriptionAvailable ? "available" : "unavailable"} · Speak {data.voice.speechAvailable === null ? "unknown" : data.voice.speechAvailable ? "available" : "unavailable"}</p></div>
      </div>
      <Separator />
      <div className="flex flex-wrap gap-2 p-4">
        <Button size="sm" disabled={permission !== "granted"}><Mic data-icon="inline-start" />Start recording</Button>
        <Button variant="outline" size="sm" disabled><Volume2 data-icon="inline-start" />Test voice</Button>
        <Badge variant="outline">Owner action: grant microphone permission when available</Badge>
      </div>
    </ModuleShell>
  );
}

function SettingsModule({ data, snapshot }: { data: OperatorData; snapshot: HermesControlCenterSnapshot }) {
  const gateway = snapshot.capabilities.find((item) => item.id === "gateway");
  return (
    <div className="flex flex-col gap-3">
      <ModuleShell title="Providers, models, and gateway" detail="Authentication health is projected without keys, tokens, or secret-bearing URLs." icon={Server}>
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Current model</p><p className="mt-1 truncate text-sm font-medium">{data.model.provider ?? "Unknown"} / {data.model.model ?? "Unknown"}</p></div>
          <div><p className="text-xs text-muted-foreground">Gateway</p><p className="mt-1 text-sm font-medium">{gateway?.operationalHealth === "conflicting_evidence" ? "Conflicting evidence" : `${data.runtime.gatewayMode} · ${data.runtime.gatewayState}`}</p></div>
          <div><p className="text-xs text-muted-foreground">Last connection</p><p className="mt-1 text-sm font-medium">{relativeTime(data.runtime.lastConnection)}</p></div>
        </div>
        <div className="divide-y divide-border">
          {data.providers.map((provider) => <div key={provider.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{provider.name}</p><p className="text-xs text-muted-foreground">{provider.totalModels} models{provider.warning ? ` · ${provider.warning}` : ""}</p></div><Badge variant={provider.authenticated ? "secondary" : "outline"}>{provider.authenticated ? "Authenticated" : "Not authenticated"}</Badge></div>)}
        </div>
      </ModuleShell>
      <NotificationsModule />
      <VoiceModule data={data} />
    </div>
  );
}

function ToolsModule({ snapshot, onRefresh, refreshing }: { snapshot: HermesControlCenterSnapshot; onRefresh: () => void; refreshing: boolean }) {
  return (
    <ModuleShell title="Browser and OpenCLI" detail="External OpenCLI connectivity is observed through a bounded server-side doctor check." icon={Activity}>
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-muted-foreground">Installed version</p><p className="mt-1 text-sm font-medium">{snapshot.live.openCliVersion ?? "Not detected"}</p></div>
        <div><p className="text-xs text-muted-foreground">Connection</p><p className="mt-1 text-sm font-medium">{snapshot.health.openCli}</p></div>
        <div><p className="text-xs text-muted-foreground">Browser profiles</p><p className="mt-1 text-sm font-medium">{snapshot.live.openCliProfiles} connected</p></div>
        <div><p className="text-xs text-muted-foreground">Last diagnostic</p><p className="mt-1 text-sm font-medium">{relativeTime(snapshot.checkedAt)}</p></div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className="break-all text-xs text-muted-foreground">Binary: {snapshot.live.openCliBinaryLocation ?? "Not reported"}</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(snapshot.live.openCliCapabilities).map(([name, supported]) => <Badge key={name} variant={supported ? "secondary" : "outline"}>{name} {supported ? "available" : "unavailable"}</Badge>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : undefined} data-icon="inline-start" />
            Run doctor / recheck
          </Button>
          <Button variant="outline" size="sm" disabled title="Restart requires owner review and a governed mutation path">Restart or reconnect</Button>
        </div>
        <p className="text-xs text-muted-foreground">Read-only acceptance supports a local page open, title and DOM read, and screenshot capture. No external write is performed.</p>
      </div>
    </ModuleShell>
  );
}

export function HermesLiveModules({ section, snapshot, query, onRefresh, refreshing }: { section: LiveSection; snapshot: HermesControlCenterSnapshot; query: string; onRefresh: () => void; refreshing: boolean }) {
  const data = snapshot.live.operator;
  if (section === "agents") return <AgentsModule data={data} />;
  if (section === "messaging") return <MessagingModule data={data} query={query} />;
  if (section === "artifacts") return <ArtifactsModule data={data} query={query} />;
  if (section === "memory") return <MemoryModule data={data} />;
  if (section === "sessions") return <SessionsModule data={data} query={query} />;
  if (section === "settings") return <SettingsModule data={data} snapshot={snapshot} />;
  if (section === "tools") return <ToolsModule snapshot={snapshot} onRefresh={onRefresh} refreshing={refreshing} />;
  return null;
}
