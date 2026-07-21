"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  HermesManagedSkill,
  HermesSkillAction,
  HermesSkillsManagementPreview,
  HermesSkillsManagementResult,
  HermesSkillsSnapshot,
} from "@/lib/hermes/skills-management-types";

type Filter = "installed" | "available";
type ApiResponse = { ok?: boolean; preview?: HermesSkillsManagementPreview; result?: HermesSkillsManagementResult; error?: string };

const ACTION_LABELS: Record<HermesSkillAction, string> = {
  install: "Install",
  enable: "Enable",
  disable: "Disable",
  update: "Update",
  remove: "Remove",
};

function age(observedAt: string): string {
  const elapsed = Date.now() - Date.parse(observedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "Observation time unknown";
  const minutes = Math.floor(elapsed / 60_000);
  return minutes < 1 ? "Observed just now" : minutes < 60 ? `Observed ${minutes}m ago` : `Observed ${Math.floor(minutes / 60)}h ago`;
}

function resultVariant(status: HermesSkillsManagementResult["status"]): "default" | "destructive" | "outline" | "secondary" {
  if (status === "verified_success") return "default";
  if (status === "outcome_unknown") return "destructive";
  if (status === "blocked_no_action") return "secondary";
  return "outline";
}

function SkillRow({ skill, onAction }: { skill: HermesManagedSkill; onAction: (skill: HermesManagedSkill, action: HermesSkillAction) => void }) {
  return (
    <article className="grid gap-3 border-b border-border px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" data-testid={`hermes-skill-${skill.name}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{skill.name}</h3>
          {skill.installed ? <Badge variant="outline">Installed</Badge> : <Badge variant="secondary">Available</Badge>}
          {skill.enabled === true ? <Badge>Enabled</Badge> : skill.enabled === false ? <Badge variant="outline">Disabled</Badge> : null}
          {skill.updateAvailable === true ? <Badge variant="secondary">Update available</Badge> : null}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {skill.profile} · {skill.source ?? skill.provenance ?? "Hermes"}{skill.version ? ` · ${skill.version}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {skill.supportedActions.map((action) => (
          <Button key={action} size="sm" variant={action === "remove" ? "outline" : "default"} onClick={() => onAction(skill, action)}>
            {ACTION_LABELS[action]}
          </Button>
        ))}
        {!skill.supportedActions.length ? <span className="text-xs text-muted-foreground">No managed action in Hermes 0.19.0</span> : null}
      </div>
    </article>
  );
}

export function HermesSkillsManagement() {
  const [snapshot, setSnapshot] = useState<HermesSkillsSnapshot | null>(null);
  const [filter, setFilter] = useState<Filter>("installed");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ skill: HermesManagedSkill; action: HermesSkillAction } | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<HermesSkillsManagementPreview | null>(null);
  const [result, setResult] = useState<HermesSkillsManagementResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [fixture, setFixture] = useState<boolean | null>(null);

  useEffect(() => {
    setFixture(new URLSearchParams(window.location.search).get("skillsFixture") === "acceptance");
  }, []);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (fixture === true) params.set("fixture", "acceptance");
      const response = await fetch(`/api/hermes/skills-management?${params}`, { cache: "no-store" });
      const body = await response.json() as HermesSkillsSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error || "Hermes Skills management is unavailable.");
      setSnapshot(body);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Hermes Skills management is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [fixture]);

  useEffect(() => { if (fixture !== null) void load(""); }, [fixture, load]);
  useEffect(() => {
    if (filter !== "available") return;
    const timer = setTimeout(() => void load(query), 300);
    return () => clearTimeout(timer);
  }, [filter, query, load]);

  const items = useMemo(() => {
    if (!snapshot) return [];
    const source = filter === "installed" ? snapshot.installed : snapshot.available;
    const needle = query.trim().toLowerCase();
    if (!needle || filter === "available") return source;
    return source.filter((skill) => [skill.name, skill.category, skill.source, skill.provenance, skill.profile].some((value) => value?.toLowerCase().includes(needle)));
  }, [filter, query, snapshot]);

  const close = () => {
    if (busy) return;
    setSelected(null);
    setReason("");
    setConfirmation("");
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const prepare = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/hermes/skills-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "prepare", action: selected.action, targetIdentity: selected.skill.identity, reason, query: filter === "available" ? query : "", fixture: fixture === true }),
      });
      const body = await response.json() as ApiResponse;
      if (!response.ok || !body.preview) throw new Error(body.error || "Hermes could not prepare this skill change.");
      setPreview(body.preview);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Hermes could not prepare this skill change.");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview || confirmation !== preview.confirmationPhrase) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/hermes/skills-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "commit", previewId: preview.previewId, targetIdentity: preview.targetIdentity, confirmationPhrase: confirmation, fixture: fixture === true }),
      });
      const body = await response.json() as ApiResponse;
      if (!response.ok || !body.result) throw new Error(body.error || "Hermes could not complete this skill change.");
      setResult(body.result);
      await load(filter === "available" ? query : "");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Hermes could not complete this skill change.");
    } finally {
      setBusy(false);
    }
  };

  const recheck = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/hermes/skills-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "recheck", previewId: preview.previewId, targetIdentity: preview.targetIdentity, fixture: fixture === true }),
      });
      const body = await response.json() as ApiResponse;
      if (!response.ok || !body.result) throw new Error(body.error || "Hermes could not reconcile this skill state.");
      setResult(body.result);
      await load(filter === "available" ? query : "");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Hermes could not reconcile this skill state.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3" data-testid="hermes-skills-management">
      {snapshot?.fixtureLabel ? (
        <Alert className="border-warning/40 bg-warning/5" data-testid="hermes-skills-fixture-label">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{snapshot.fixtureLabel}</AlertTitle>
          <AlertDescription>Every visible change uses the fake Hermes adapter.</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Skills</h2>
          <p className="text-xs text-muted-foreground">Canonical state from Hermes. Every change requires its own typed confirmation.</p>
        </div>
        <div className="flex items-center gap-2">
          {snapshot ? <span className="hidden text-xs text-muted-foreground sm:inline">{age(snapshot.observedAt)}</span> : null}
          <Button variant="outline" size="icon-sm" onClick={() => void load(filter === "available" ? query : "")} disabled={loading} aria-label="Refresh Hermes skills">
            <RefreshCw className={loading ? "animate-spin" : undefined} />
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="installed">Installed {snapshot ? snapshot.installed.length : 0}</TabsTrigger>
            <TabsTrigger value="available">Available {snapshot ? snapshot.available.length : 0}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute start-2.5 top-2 size-4 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={filter === "available" ? "Search Hermes catalog" : "Search installed skills"} aria-label="Search Hermes skills" className="ps-9" />
        </div>
      </div>
      {error && !selected ? <Alert variant="destructive"><TriangleAlert aria-hidden="true" /><AlertTitle>Skills unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading && !snapshot ? <p className="p-6 text-sm text-muted-foreground">Reading canonical Hermes skill state...</p> : items.length ? items.map((skill) => <SkillRow key={skill.identity} skill={skill} onAction={(nextSkill, action) => { setSelected({ skill: nextSkill, action }); setReason(""); setPreview(null); setResult(null); setError(null); }} />) : <p className="p-6 text-sm text-muted-foreground">{snapshot?.sourceState === "connected_empty" ? "Hermes is connected and reported no skills in this view." : "No skills match this view."}</p>}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="sm:max-w-xl" data-testid="hermes-skill-confirmation-dialog">
          <DialogHeader>
            <DialogTitle>{selected ? `${ACTION_LABELS[selected.action]} ${selected.skill.name}` : "Manage skill"}</DialogTitle>
            <DialogDescription>Cabinet prepares the exact request. Hermes remains the executor and source of truth.</DialogDescription>
          </DialogHeader>
          {result ? (
            <div className="space-y-3" data-testid={`hermes-skill-result-${result.status}`}>
              <div className="flex items-center gap-2">
                {result.status === "verified_success" ? <CheckCircle2 className="size-5 text-success" aria-hidden="true" /> : <TriangleAlert className="size-5 text-warning" aria-hidden="true" />}
                <Badge variant={resultVariant(result.status)}>{result.status.replaceAll("_", " ")}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
              <dl className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Request identity</dt><dd className="break-all font-medium">{result.requestIdentity}</dd></div>
                <div><dt className="text-muted-foreground">Retry attempted</dt><dd className="font-medium">No</dd></div>
                <div><dt className="text-muted-foreground">Mutation attempted</dt><dd className="font-medium">{result.mutationAttempted ? "Yes" : "No"}</dd></div>
                <div><dt className="text-muted-foreground">Verified</dt><dd className="font-medium">{result.verificationObservedAt ?? "Not verified"}</dd></div>
              </dl>
              {result.status === "outcome_unknown" ? <Button variant="outline" onClick={() => void recheck()} disabled={busy}>Read-only reconciliation</Button> : null}
            </div>
          ) : preview ? (
            <div className="space-y-3">
              <dl className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs" data-testid="hermes-skill-preview">
                {[
                  ["Action", ACTION_LABELS[preview.action]],
                  ["Target", preview.targetName],
                  ["Current state", preview.currentState.installed ? preview.currentState.enabled === false ? "Installed, disabled" : "Installed, enabled" : "Available, not installed"],
                  ["Target state", preview.targetState],
                  ["Profile", preview.profile],
                  ["Consequence", preview.expectedConsequence],
                  ["Reversibility", preview.reversibility],
                  ["Source", preview.sourceEvidence],
                  ["Evidence", preview.evidenceObservedAt],
                  ["Request identity", preview.requestIdentity],
                ].map(([label, value]) => <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}
              </dl>
              <div className="space-y-2">
                <label className="text-xs font-medium" htmlFor="hermes-skill-confirmation">Type <span className="select-all font-mono">{preview.confirmationPhrase}</span></label>
                <Input id="hermes-skill-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" data-testid="hermes-skill-confirmation-input" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
                <ShieldCheck className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
                <div><p className="text-sm font-medium">Prepare only</p><p className="text-xs text-muted-foreground">This step reads Hermes again and performs no mutation.</p></div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium" htmlFor="hermes-skill-reason">Reason</label>
                <Textarea id="hermes-skill-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this Hermes skill change needed?" />
              </div>
            </div>
          )}
          {error ? <Alert variant="destructive"><TriangleAlert aria-hidden="true" /><AlertTitle>Action blocked</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>Close</Button>
            {!preview && !result ? <Button onClick={() => void prepare()} disabled={busy || reason.trim().length < 8}>Prepare preview</Button> : null}
            {preview && !result ? <Button onClick={() => void commit()} disabled={busy || confirmation !== preview.confirmationPhrase}>Commit through Hermes</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
