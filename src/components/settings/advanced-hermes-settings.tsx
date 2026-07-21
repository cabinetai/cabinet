"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HermesSessionManager } from "@/components/agents/hermes-session-manager";
import { useCabinetRuntimeMode } from "@/hooks/use-cabinet-runtime-mode";
import type { HermesManagementSnapshot, HermesRunProjection } from "@/lib/hermes/types";
import { HERMES_CAPABILITY_STAGES, type HermesCapabilityEvidenceRecord, type HermesCapabilityStage } from "@/lib/hermes/capability-types";

type ActionPayload = Record<string, unknown>;

export function AdvancedHermesSettings() {
  const { status, loading, refresh } = useCabinetRuntimeMode();
  const [snapshot, setSnapshot] = useState<HermesManagementSnapshot | null>(null);
  const [managementError, setManagementError] = useState<string | null>(null);
  const [capabilityRecords, setCapabilityRecords] = useState<HermesCapabilityEvidenceRecord[]>([]);
  const [runs, setRuns] = useState<HermesRunProjection[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const healthy = status?.status === "online" || status?.status === "healthy";

  const loadManagement = useCallback(async () => {
    try {
      const response = await fetch("/api/hermes/management", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Hermes management is unavailable.");
      setSnapshot(body as HermesManagementSnapshot);
      setManagementError(null);
    } catch (error) {
      setManagementError(error instanceof Error ? error.message : "Hermes management is unavailable.");
    }
  }, []);

  const loadCapabilities = useCallback(async () => {
    const response = await fetch("/api/hermes/capabilities", { cache: "no-store" });
    if (response.ok) setCapabilityRecords(((await response.json()) as { records?: HermesCapabilityEvidenceRecord[] }).records ?? []);
  }, []);

  const loadRuns = useCallback(async () => {
    const response = await fetch("/api/hermes/runs", { cache: "no-store" });
    if (response.ok) setRuns(((await response.json()) as { runs?: HermesRunProjection[] }).runs ?? []);
  }, []);

  useEffect(() => { void Promise.all([loadManagement(), loadCapabilities(), loadRuns()]); }, [loadManagement, loadCapabilities, loadRuns]);

  const act = useCallback(async (action: string, payload: ActionPayload, reason: string) => {
    if (!window.confirm(`${reason}\n\nThis changes Hermes-owned state. Continue?`)) return;
    setBusy(action);
    try {
      const response = await fetch("/api/hermes/management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload, confirmed: true, reason, idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Hermes rejected the change.");
      await loadManagement();
    } catch (error) {
      setManagementError(error instanceof Error ? error.message : "Hermes rejected the change.");
    } finally { setBusy(null); }
  }, [loadManagement]);

  const promote = useCallback(async (payload: Record<string, unknown>, reason: string) => {
    if (!window.confirm(`${reason}\n\nThis records an operator-governed promotion. Continue?`)) return;
    setBusy("capability.promote");
    try {
      const response = await fetch("/api/hermes/capabilities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, confirmed: true, reason }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Capability promotion failed.");
      await loadCapabilities(); setManagementError(null);
    } catch (error) { setManagementError(error instanceof Error ? error.message : "Capability promotion failed."); }
    finally { setBusy(null); }
  }, [loadCapabilities]);

  const refreshAll = async () => { await Promise.all([refresh(), loadManagement(), loadCapabilities(), loadRuns()]); };

  return (
    <div className="space-y-6" data-testid="hermes-management-workspace">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[14px] font-semibold">Advanced Hermes</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Hermes owns execution, profiles, skills, schedules, memory, tools, approvals, secrets, sudo, and recovery. Cabinet presents governed controls over that canonical state.
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={loading || busy !== null} onClick={() => void refreshAll()}>
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} /> Refresh
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatusItem label="Runtime" value={status?.status || (loading ? "Checking" : "Unavailable")} healthy={healthy} />
          <StatusItem label="Profile" value={status?.profile || "operator-os"} healthy />
          <StatusItem label="Version" value={status?.version || "Not reported"} healthy={!!status?.version} />
        </div>
        {status?.message ? <p className="mt-3 text-[11px] text-muted-foreground">{status.message}</p> : null}
      </div>

      <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
        <div className="flex gap-2.5"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" /><div>
          <p className="text-xs font-semibold">Hermes source-of-truth boundary</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Every change below requires an explicit confirmation. Cabinet keeps no second profile, skill, scheduler, plugin, or memory catalog. The M7 cutover rule remains in force.</p>
        </div></div>
      </div>

      {managementError ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">{managementError}</div> : null}
      {snapshot ? <>
        <ProfilesPanel snapshot={snapshot} busy={busy} act={act} />
        <SkillsPanel snapshot={snapshot} busy={busy} act={act} />
        <JobsPanel snapshot={snapshot} busy={busy} act={act} />
        <MemoryPanel snapshot={snapshot} />
        <ToolingPanel snapshot={snapshot} busy={busy} act={act} />
        <CapabilityPanel snapshot={snapshot} records={capabilityRecords} busy={busy} promote={promote} />
        <RunEvidencePanel runs={runs} />
        <DiagnosticsPanel snapshot={snapshot} />
      </> : null}
      <HermesSessionManager />
    </div>
  );
}

type PanelProps = { snapshot: HermesManagementSnapshot; busy: string | null; act: (action: string, payload: ActionPayload, reason: string) => Promise<void> };

function ProfilesPanel({ snapshot, busy, act }: PanelProps) {
  const [name, setName] = useState(""); const [reason, setReason] = useState("");
  const [manifest, setManifest] = useState(snapshot.agentManifest.content); const [manifestProfile, setManifestProfile] = useState(snapshot.profile);
  return <Section title="Profiles and agent manifests" description="Profiles are created only for real credential, memory, or policy isolation boundaries.">
    <Rows>{snapshot.profiles.map((profile) => <Row key={profile.name} title={profile.name} detail={`${profile.skillCount} skills · ${profile.provider || "provider inherited"} · ${profile.model || "model inherited"}`} badge={profile.name === snapshot.profile ? "Active" : profile.isDefault ? "Default" : "Isolated"} />)}</Rows>
    <div className="mt-3 grid gap-2 sm:grid-cols-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New isolated profile name" /><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Isolation boundary and reason" /></div>
    <Button className="mt-2" size="sm" variant="outline" disabled={!name.trim() || !reason.trim() || busy !== null} onClick={() => void act("profile.create", { name, isolationReason: reason }, `Create isolated Hermes profile ${name}: ${reason}`)}>Create isolated profile</Button>
    <div className="mt-4 grid gap-2 sm:grid-cols-[180px_1fr]"><Input value={manifestProfile} onChange={(event) => setManifestProfile(event.target.value)} placeholder="Profile" /><textarea value={manifest} onChange={(event) => setManifest(event.target.value)} placeholder="Hermes agent manifest (SOUL.md)" className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-xs outline-none focus:border-ring" /></div>
    <Button className="mt-2" size="sm" variant="outline" disabled={!manifestProfile.trim() || !manifest.trim() || busy !== null} onClick={() => void act("profile.manifest", { name: manifestProfile, content: manifest }, `Replace the Hermes agent manifest for ${manifestProfile}`)}>Save agent manifest</Button>
  </Section>;
}

function SkillsPanel({ snapshot, busy, act }: PanelProps) {
  const [name, setName] = useState(""); const [content, setContent] = useState(""); const [hubIdentifier, setHubIdentifier] = useState("");
  return <Section title="Skills" description="Hermes-owned skills are listed, installed, enabled, created, and edited through the active profile.">
    <Rows>{snapshot.skills.map((skill) => <Row key={skill.name} title={skill.name} detail={`${skill.category} · ${skill.provenance} · ${skill.usage ?? 0} observed uses`} badge={skill.enabled ? "Enabled" : "Disabled"} action={<Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act("skill.toggle", { name: skill.name, enabled: !skill.enabled }, `${skill.enabled ? "Disable" : "Enable"} Hermes skill ${skill.name}`)}>{skill.enabled ? "Disable" : "Enable"}</Button>} />)}</Rows>
    <div className="mt-3 flex gap-2"><Input value={hubIdentifier} onChange={(event) => setHubIdentifier(event.target.value)} placeholder="Hermes skill hub identifier, for example official/gifs/gif-search" /><Button size="sm" variant="outline" disabled={!hubIdentifier.trim() || busy !== null} onClick={() => void act("skill.install", { identifier: hubIdentifier }, `Install Hermes skill ${hubIdentifier} from the skill hub for ${snapshot.profile}`)}>Install from hub</Button></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr]"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Skill name" /><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Complete SKILL.md content" className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-xs outline-none focus:border-ring" /></div>
    <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" disabled={!name.trim() || !content.trim() || busy !== null} onClick={() => void act("skill.create", { name, content }, `Create Hermes skill ${name}`)}>Create skill</Button><Button size="sm" variant="outline" disabled={!name.trim() || !content.trim() || busy !== null} onClick={() => void act("skill.update", { name, content }, `Replace the Hermes skill content for ${name}`)}>Update skill</Button></div>
  </Section>;
}

function JobsPanel({ snapshot, busy, act }: PanelProps) {
  const [name, setName] = useState(""); const [prompt, setPrompt] = useState(""); const [schedule, setSchedule] = useState(""); const [skills, setSkills] = useState("");
  return <Section title="Cron calendar and run controls" description="Hermes cron is canonical. Cabinet does not run a scheduler.">
    <Rows>{snapshot.jobs.map((job) => <Row key={job.id} title={job.name} detail={`${job.schedule} · next ${job.nextRunAt || "not scheduled"}${job.lastError ? ` · error: ${job.lastError}` : ""}`} badge={job.enabled ? "Enabled" : "Paused"} action={<div className="flex gap-1"><Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act(job.enabled ? "job.pause" : "job.resume", { id: job.id }, `${job.enabled ? "Pause" : "Resume"} Hermes job ${job.name}`)}>{job.enabled ? "Pause" : "Resume"}</Button><Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act("job.trigger", { id: job.id }, `Run Hermes job ${job.name} now`)}>Run now</Button></div>} />)}</Rows>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Job name" /><Input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Schedule, for example every day at 9am" /><Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Hermes job prompt" /><Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Attached skills, comma separated" /></div>
    <Button className="mt-2" size="sm" variant="outline" disabled={!prompt.trim() || !schedule.trim() || busy !== null} onClick={() => void act("job.create", { name, prompt, schedule, skills: skills.split(",").map((skill) => skill.trim()).filter(Boolean) }, `Create Hermes job ${name || "without a display name"}${skills.trim() ? ` with skills ${skills}` : ""}`)}>Create Hermes job</Button>
  </Section>;
}

function MemoryPanel({ snapshot }: { snapshot: HermesManagementSnapshot }) {
  return <Section title="Memory namespace and recall health" description="Credentials and raw memory never cross this boundary."><div className="grid gap-3 sm:grid-cols-4"><StatusItem label="Namespace" value={snapshot.memory.namespace} healthy /><StatusItem label="Provider" value={snapshot.memory.activeProvider} healthy={snapshot.memory.captureState !== "unconfigured"} /><StatusItem label="Capture" value={snapshot.memory.captureState} healthy={snapshot.memory.captureState !== "unconfigured"} /><StatusItem label="Recall" value={snapshot.memory.recallHealth} healthy={snapshot.memory.recallHealth === "healthy"} /></div><p className="mt-3 text-[11px] text-muted-foreground">Profile isolation: {snapshot.profile}. Built-in memory evidence: {snapshot.memory.builtInBytes} bytes. Configured providers: {snapshot.memory.providers.filter((item) => item.configured).length}.</p></Section>;
}

function ToolingPanel({ snapshot, busy, act }: PanelProps) {
  return <Section title="Plugins, MCP, Executor, and OpenCLI" description="Hermes selects execution tooling. Cabinet reports availability and governed enablement only.">
    <Rows>{snapshot.mcpServers.map((server) => <Row key={`mcp-${server.name}`} title={`MCP · ${server.name}`} detail={`${server.transport} · ${server.auth || "no auth"} · ${server.configured ? "configured" : "configuration missing"}`} badge={server.enabled ? "Enabled" : "Disabled"} action={<Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act("mcp.toggle", { name: server.name, enabled: !server.enabled }, `${server.enabled ? "Disable" : "Enable"} Hermes MCP server ${server.name}`)}>{server.enabled ? "Disable" : "Enable"}</Button>} />)}
      {snapshot.toolsets.map((tool) => <Row key={`tool-${tool.name}`} title={`Executor · ${tool.label}`} detail={`${tool.toolCount} tools · ${tool.configured ? "configured" : "needs configuration"}`} badge={tool.enabled ? "Enabled" : "Disabled"} action={<Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act("toolset.toggle", { name: tool.name, enabled: !tool.enabled }, `${tool.enabled ? "Disable" : "Enable"} Hermes toolset ${tool.label}`)}>{tool.enabled ? "Disable" : "Enable"}</Button>} />)}
      {snapshot.plugins.map((plugin) => <Row key={`plugin-${plugin.name}`} title={`Plugin · ${plugin.label}`} detail={`${plugin.version} · ${plugin.source}`} badge="Available" />)}
      <Row
        title="OpenCLI"
        detail={snapshot.openCli
          ? `${snapshot.openCli.message}${snapshot.skills.some((skill) => skill.name.toLowerCase().includes("opencli")) ? " A Hermes-native OpenCLI skill is also installed." : " No separate Hermes-native OpenCLI skill is installed."}`
          : snapshot.skills.some((skill) => skill.name.toLowerCase().includes("opencli")) ? "Hermes skill available" : "OpenCLI diagnostics unavailable"}
        badge={snapshot.openCli?.available && snapshot.openCli.daemon === "running" && snapshot.openCli.extension === "connected" ? "Connected" : snapshot.openCli?.available ? "Degraded" : "Unavailable"}
      />
    </Rows>
  </Section>;
}

function CapabilityPanel({ snapshot, records, busy, promote }: { snapshot: HermesManagementSnapshot; records: HermesCapabilityEvidenceRecord[]; busy: string | null; promote: (payload: Record<string, unknown>, reason: string) => Promise<void> }) {
  const [capability, setCapability] = useState(""); const [actor, setActor] = useState(""); const [reason, setReason] = useState("");
  const [to, setTo] = useState<HermesCapabilityStage>("Draft"); const [runId, setRunId] = useState(""); const [jobId, setJobId] = useState(""); const [outcome, setOutcome] = useState(""); const [metrics, setMetrics] = useState(""); const [shadowReview, setShadowReview] = useState("");
  return <Section title="Capability lifecycle and evidence" description="Lifecycle states are derived from current Hermes evidence. Approval and trust remain operator decisions.">
    <Rows>{snapshot.skills.map((skill) => { const record = records.find((item) => item.capability === skill.name && item.profile === snapshot.profile); return <Row key={`life-${skill.name}`} title={skill.name} detail={record ? `${record.history.length} recorded promotions. Latest operator: ${record.history.at(-1)?.actor}.` : `Hermes skill exists with ${skill.usage ?? 0} observed uses. No operator promotion recorded.`} badge={record?.stage ?? "Untracked"} />; })}</Rows>
    <div className="mt-3 grid gap-2 sm:grid-cols-3"><Input value={capability} onChange={(e) => setCapability(e.target.value)} placeholder="Canonical capability name" /><Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Operator identity" /><select value={to} onChange={(e) => setTo(e.target.value as HermesCapabilityStage)} className="h-9 rounded-md border border-input bg-transparent px-3 text-xs">{HERMES_CAPABILITY_STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select></div>
    <Input className="mt-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Promotion decision and reason" />
    <div className="mt-2 grid gap-2 sm:grid-cols-3"><Input value={runId} onChange={(e) => setRunId(e.target.value)} placeholder="Hermes run ID" /><Input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="Hermes job ID" /><Input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Outcome evidence" /><Input value={metrics} onChange={(e) => setMetrics(e.target.value)} placeholder="Performance metrics" /><Input value={shadowReview} onChange={(e) => setShadowReview(e.target.value)} placeholder="Shadow-mode review" /></div>
    <Button className="mt-2" size="sm" variant="outline" disabled={!capability.trim() || !actor.trim() || !reason.trim() || busy !== null} onClick={() => void promote({ capability, actor, to, evidence: { runId: runId || undefined, jobId: jobId || undefined, outcome: outcome || undefined, metrics: metrics || undefined, shadowReview: shadowReview || undefined } }, reason)}>Record next promotion</Button>
    <p className="mt-3 text-[11px] text-muted-foreground">Promotion sequence: Draft, Tested, Approved, Scheduled, Monitored, Trusted. Cabinet will not infer Approved or Trusted from AI-generated evidence.</p>
  </Section>;
}

function DiagnosticsPanel({ snapshot }: { snapshot: HermesManagementSnapshot }) {
  const [opening, setOpening] = useState(false); const [escapeStatus, setEscapeStatus] = useState<string | null>(null);
  const openDesktop = async () => {
    if (!window.confirm("Open Hermes Desktop for diagnostics or emergency recovery? Do not use it as a competing daily execution interface.")) return;
    setOpening(true); setEscapeStatus(null);
    try {
      const response = await fetch("/api/hermes/desktop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true, purpose: "diagnostic" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Hermes Desktop could not be opened.");
      setEscapeStatus("Hermes Desktop opened for diagnostics. Cabinet and Hermes histories were not changed.");
    } catch (error) { setEscapeStatus(error instanceof Error ? error.message : "Hermes Desktop could not be opened."); }
    finally { setOpening(false); }
  };
  return <Section title="Management diagnostics" description={`Version-pinned adapter ${snapshot.compatibility.adapter}, checked ${new Date(snapshot.checkedAt).toLocaleString()}.`}>
    <Rows>{snapshot.diagnostics.map((item, index) => <Row key={`${item.area}-${index}`} title={item.area} detail={item.message} badge={item.status} />)}</Rows>
    <div className="mt-4 rounded-md border border-amber-500/25 bg-amber-500/5 p-3"><p className="text-xs font-medium">Hermes Desktop diagnostic escape hatch</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Use only when Cabinet diagnostics are insufficient or emergency recovery requires the native Hermes surface. Opening it does not start work, copy state, or create a competing Cabinet history.</p><Button className="mt-2" size="sm" variant="outline" disabled={opening} onClick={() => void openDesktop()}>{opening ? "Opening…" : "Open Hermes Desktop diagnostics"}</Button>{escapeStatus ? <p className="mt-2 text-[11px] text-muted-foreground" role="status">{escapeStatus}</p> : null}</div>
  </Section>;
}

function RunEvidencePanel({ runs }: { runs: HermesRunProjection[] }) {
  return <Section title="Run history and performance evidence" description="This is a bounded, rebuildable projection of Hermes-owned runs tied to their originating Cabinet context."><Rows>{runs.length ? runs.map((run) => {
    const duration = Math.max(0, new Date(run.updatedAt).getTime() - new Date(run.startedAt).getTime());
    const tools = run.events.filter((event) => event.event === "tool.completed");
    const retries = run.events.filter((event) => event.event.includes("retry")).length;
    return <Row key={run.runId} title={run.capability || run.context} detail={`${run.runId} · ${duration} ms · ${tools.length} tool results · ${retries} retries · ${run.usage?.totalTokens ?? "cost unavailable"} total tokens${run.error ? ` · ${run.error}` : ""}`} badge={run.status} />;
  }) : <Row title="No projected runs" detail="Background work will appear here after Cabinet starts it through HermesRunClient." badge="Empty" />}</Rows></Section>;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="rounded-lg border border-border bg-card p-4"><h4 className="text-sm font-semibold">{title}</h4><p className="mt-1 text-[11px] text-muted-foreground">{description}</p><div className="mt-4">{children}</div></section>; }
function Rows({ children }: { children: React.ReactNode }) { return <div className="divide-y divide-border rounded-md border border-border">{children}</div>; }
function Row({ title, detail, badge, action }: { title: string; detail: string; badge: string; action?: React.ReactNode }) { return <div className="flex items-center gap-3 px-3 py-2.5"><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{title}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{detail}</p></div><span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{badge}</span>{action}</div>; }

function StatusItem({ label, value, healthy }: { label: string; value: string; healthy: boolean }) { const Icon = healthy ? CheckCircle2 : TriangleAlert; return <div className="rounded-md border border-border/70 bg-background px-3 py-2.5"><div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"><Icon className={healthy ? "size-3 text-emerald-500" : "size-3 text-amber-500"} />{label}</div><p className="mt-1 truncate text-xs font-medium capitalize">{value}</p></div>; }
