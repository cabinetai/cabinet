"use client";

import { useState } from "react";
import {
  Activity,
  AlertCircle,
  Database,
  ExternalLink,
  FileText,
  Fingerprint,
  GitBranch,
  Link2,
  ListChecks,
  Loader2,
  Play,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { confirmDialog } from "@/lib/ui/confirm";
import { cn } from "@/lib/utils";
import type { OptaleActionDefinition } from "@/lib/optale/action-registry";
import type { OptaleResourceRecord } from "@/lib/optale/resource-registry";
import type { OptaleActionRunRecord } from "@/lib/optale/action-run-ledger";
import type { OptaleAuditEventRecord } from "@/lib/optale/audit-event-log";
import type { OptaleLineageEdgeRecord } from "@/lib/optale/lineage-edge-table";
import type { OptalePolicyDecisionRecord } from "@/lib/optale/policy-decision-log";
import {
  optaleOagObjectSchemaForType,
  type OptaleOagFieldSchema,
  type OptaleOagRelationshipSchema,
} from "@/lib/optale/oag-schema";
import {
  buildOagObjectCommandDraft,
  resolveOagObjectReference,
  type OagObjectReferenceIndex,
  type OagObjectRelationshipInstance,
  type OagObjectRelatedRecords,
} from "@/components/optale/oag-object-explorer-state";

type EvidenceItem = {
  label: string;
  value: string | number | boolean;
};

function formatTime(value?: string): string {
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

function tokenLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function listLabel(values: string[] | undefined): string {
  if (!values || values.length === 0) return "";
  return values.map(tokenLabel).join(", ");
}

function valueType(value: EvidenceItem["value"]): string {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

function statusTone(value?: string): string {
  const normalized = value?.toLowerCase() || "";
  if (
    normalized.includes("allow") ||
    normalized.includes("completed") ||
    normalized.includes("active") ||
    normalized.includes("info")
  ) {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (
    normalized.includes("deny") ||
    normalized.includes("blocked") ||
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("rejected")
  ) {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (
    normalized.includes("review") ||
    normalized.includes("pending") ||
    normalized.includes("running") ||
    normalized.includes("warning")
  ) {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

function Pill({ value }: { value?: string | number | boolean }) {
  if (value === undefined || value === "") return null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize",
        statusTone(String(value)),
      )}
    >
      <span className="truncate">{tokenLabel(String(value))}</span>
    </span>
  );
}

function MetaLine({
  label,
  value,
}: {
  label: string;
  value?: string | number | boolean;
}) {
  if (value === undefined || value === "") return null;
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 text-[11px] leading-5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground/80">{String(value)}</dd>
    </div>
  );
}

function ReferenceValue({
  value,
  targetId,
  targetLabel,
  onSelectResource,
}: {
  value: string;
  targetId?: string;
  targetLabel?: string;
  onSelectResource?: (resourceId: string) => void;
}) {
  if (!targetId || !onSelectResource) {
    return <span className="break-words text-foreground/80">{value}</span>;
  }

  return (
    <button
      type="button"
      title={targetLabel ? `Open ${targetLabel}` : "Open object"}
      onClick={() => onSelectResource(targetId)}
      className="inline-flex max-w-full items-center gap-1 text-left font-medium text-primary hover:underline"
    >
      <span className="truncate">{value}</span>
      <ExternalLink className="size-3 shrink-0" />
    </button>
  );
}

function ReferenceMetaLine({
  label,
  value,
  targetId,
  targetLabel,
  onSelectResource,
}: {
  label: string;
  value: string;
  targetId?: string;
  targetLabel?: string;
  onSelectResource?: (resourceId: string) => void;
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 text-[11px] leading-5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">
        <ReferenceValue
          value={value}
          targetId={targetId}
          targetLabel={targetLabel}
          onSelectResource={onSelectResource}
        />
      </dd>
    </div>
  );
}

function EvidencePreview({
  evidence,
  limit = 3,
}: {
  evidence: EvidenceItem[];
  limit?: number;
}) {
  if (evidence.length === 0) return null;
  return (
    <dl className="mt-2 space-y-1">
      {evidence.slice(0, limit).map((item) => (
        <MetaLine
          key={`${item.label}:${String(item.value)}`}
          label={item.label}
          value={item.value}
        />
      ))}
    </dl>
  );
}

function InspectorSection({
  title,
  count,
  icon,
  empty,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border/70 px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          {icon}
          <span className="truncate">{title}</span>
        </h3>
        <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}

function MoreCount({
  shown,
  total,
}: {
  shown: number;
  total: number;
}) {
  if (total <= shown) return null;
  return (
    <p className="pt-2 text-[11px] text-muted-foreground">
      +{total - shown} more
    </p>
  );
}

function RunRow({ run }: { run: OptaleActionRunRecord }) {
  return (
    <div className="border-t border-border/50 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {run.label}
          </p>
          <p className="mt-0.5 break-all text-[11px] text-muted-foreground">
            {run.id}
          </p>
        </div>
        <Pill value={run.status} />
      </div>
      <dl className="mt-2 space-y-1">
        <MetaLine label="Source" value={tokenLabel(run.source)} />
        <MetaLine label="Agent" value={run.agentSlug} />
        <MetaLine label="Conversation" value={run.conversationId} />
        <MetaLine label="Updated" value={formatTime(run.updatedAt || run.createdAt)} />
      </dl>
      <EvidencePreview evidence={run.evidence} />
      {run.href && (
        <a
          href={run.href}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <ExternalLink className="size-3" />
          Open run
        </a>
      )}
    </div>
  );
}

function PolicyRow({ decision }: { decision: OptalePolicyDecisionRecord }) {
  return (
    <div className="border-t border-border/50 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {tokenLabel(decision.reasonCode)}
          </p>
          <p className="mt-0.5 break-all text-[11px] text-muted-foreground">
            {decision.id}
          </p>
        </div>
        <Pill value={decision.outcome} />
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {decision.explanation}
      </p>
      <dl className="mt-2 space-y-1">
        <MetaLine label="Action Run" value={decision.subjectId} />
        <MetaLine label="Actor" value={decision.actor} />
        <MetaLine label="Evaluated" value={formatTime(decision.evaluatedAt)} />
      </dl>
    </div>
  );
}

function LineageRow({
  edge,
  referenceIndex,
  onSelectResource,
}: {
  edge: OptaleLineageEdgeRecord;
  referenceIndex: OagObjectReferenceIndex;
  onSelectResource?: (resourceId: string) => void;
}) {
  const sourceTarget = resolveOagObjectReference(referenceIndex, [
    edge.source.id,
    `${edge.source.kind}:${edge.source.id}`,
    edge.source.label,
  ]);
  const targetTarget = resolveOagObjectReference(referenceIndex, [
    edge.target.id,
    `${edge.target.kind}:${edge.target.id}`,
    edge.target.label,
  ]);

  return (
    <div className="border-t border-border/50 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex min-w-0 flex-wrap items-center gap-1 text-sm font-medium text-foreground">
            <ReferenceValue
              value={edge.source.label}
              targetId={sourceTarget?.resourceId}
              targetLabel={sourceTarget?.label}
              onSelectResource={onSelectResource}
            />
            <span className="text-muted-foreground">to</span>
            <ReferenceValue
              value={edge.target.label}
              targetId={targetTarget?.resourceId}
              targetLabel={targetTarget?.label}
              onSelectResource={onSelectResource}
            />
          </p>
          <p className="mt-0.5 break-all text-[11px] text-muted-foreground">
            {edge.id}
          </p>
        </div>
        <Pill value={edge.kind} />
      </div>
      <dl className="mt-2 space-y-1">
        <ReferenceMetaLine
          label="Source"
          value={`${edge.source.kind}:${edge.source.id}`}
          targetId={sourceTarget?.resourceId}
          targetLabel={sourceTarget?.label}
          onSelectResource={onSelectResource}
        />
        <ReferenceMetaLine
          label="Target"
          value={`${edge.target.kind}:${edge.target.id}`}
          targetId={targetTarget?.resourceId}
          targetLabel={targetTarget?.label}
          onSelectResource={onSelectResource}
        />
        <MetaLine label="Created" value={formatTime(edge.createdAt)} />
      </dl>
    </div>
  );
}

function AuditRow({ event }: { event: OptaleAuditEventRecord }) {
  return (
    <div className="border-t border-border/50 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {event.summary}
          </p>
          <p className="mt-0.5 break-all text-[11px] text-muted-foreground">
            {event.id}
          </p>
        </div>
        <Pill value={event.severity} />
      </div>
      <dl className="mt-2 space-y-1">
        <MetaLine label="Subject" value={`${event.subjectType}:${event.subjectId}`} />
        <MetaLine label="Actor" value={event.actor} />
        <MetaLine label="Occurred" value={formatTime(event.occurredAt)} />
      </dl>
    </div>
  );
}

function ActionRow({
  action,
  resource,
  running,
  onRun,
}: {
  action: OptaleActionDefinition;
  resource: OptaleResourceRecord;
  running: boolean;
  onRun: (action: OptaleActionDefinition) => void;
}) {
  const draft = buildOagObjectCommandDraft(resource, action);
  const availability = action.facts.find(
    (fact) => fact.label === "Availability",
  )?.value;

  return (
    <div className="border-t border-border/50 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {action.label}
          </p>
          <p className="mt-0.5 break-all text-[11px] text-muted-foreground">
            {action.id}
          </p>
        </div>
        <Pill value={availability || action.status} />
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {action.description}
      </p>
      <dl className="mt-2 space-y-1">
        <MetaLine label="Kind" value={action.kind} />
        <MetaLine label="Risk" value={action.risk} />
        <MetaLine label="Approval" value={action.oagContract?.approval} />
        <MetaLine
          label="Targets"
          value={listLabel(action.oagContract?.targetObjectTypes)}
        />
        <MetaLine
          label="Results"
          value={listLabel(action.oagContract?.resultObjectTypes)}
        />
        <MetaLine label="Inputs" value={action.inputs.length} />
        <MetaLine label="Path" value={action.executionPath} />
      </dl>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="min-w-0 text-[11px] leading-5 text-muted-foreground">
          {draft.disabledReason || "Runs through Command Center policy gates."}
        </p>
        <Button
          type="button"
          size="sm"
          variant={draft.executable ? "default" : "outline"}
          disabled={!draft.executable || running}
          onClick={() => onRun(action)}
          className="h-7 shrink-0 px-2 text-xs"
        >
          {running ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <Play className="mr-1 size-3" />
          )}
          {draft.buttonLabel}
        </Button>
      </div>
    </div>
  );
}

function SchemaFieldRow({
  fact,
}: {
  fact: OptaleResourceRecord["facts"][number];
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_70px] gap-3 border-t border-border/50 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">
          {fact.label}
        </p>
        <p className="mt-0.5 break-words text-[11px] leading-5 text-muted-foreground">
          {String(fact.value)}
        </p>
      </div>
      <div className="flex justify-end">
        <Pill value={valueType(fact.value)} />
      </div>
    </div>
  );
}

function SchemaDefinitionRow({ field }: { field: OptaleOagFieldSchema }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_70px] gap-3 border-t border-border/50 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <p className="truncate text-xs font-medium text-foreground">
            {field.label}
          </p>
          {field.required && <Pill value="required" />}
        </div>
        <p className="mt-0.5 break-words text-[11px] leading-5 text-muted-foreground">
          {field.description}
        </p>
        <dl className="mt-1 space-y-1">
          <MetaLine label="Name" value={field.name} />
          <MetaLine label="Source" value={field.source} />
          <MetaLine label="References" value={listLabel(field.references)} />
          <MetaLine label="Values" value={listLabel(field.enumValues)} />
        </dl>
      </div>
      <div className="flex justify-end">
        <Pill value={field.kind} />
      </div>
    </div>
  );
}

function RelationshipDefinitionRow({
  relationship,
}: {
  relationship: OptaleOagRelationshipSchema;
}) {
  return (
    <div className="border-t border-border/50 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">
            {relationship.label}
          </p>
          <p className="mt-0.5 break-words text-[11px] leading-5 text-muted-foreground">
            {relationship.description}
          </p>
        </div>
        <Pill value={relationship.cardinality} />
      </div>
      <dl className="mt-1 space-y-1">
        <MetaLine label="Name" value={relationship.name} />
        <MetaLine label="Direction" value={relationship.direction} />
        <MetaLine label="Target" value={listLabel(relationship.targetTypes)} />
        <MetaLine label="Source" value={relationship.materializedBy} />
      </dl>
    </div>
  );
}

function RelationshipInstanceRow({
  relationship,
  onSelectResource,
}: {
  relationship: OagObjectRelationshipInstance;
  onSelectResource?: (resourceId: string) => void;
}) {
  return (
    <div className="border-t border-border/50 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {tokenLabel(relationship.label)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            <ReferenceValue
              value={relationship.target.label}
              targetId={relationship.target.resourceId}
              targetLabel={relationship.target.label}
              onSelectResource={onSelectResource}
            />
          </p>
        </div>
        <Pill value={relationship.direction} />
      </div>
      <dl className="mt-2 space-y-1">
        <MetaLine label="Type" value={relationship.name} />
        <MetaLine label="Target" value={relationship.target.kind} />
        <MetaLine label="Source" value={relationship.materializedBy} />
      </dl>
      <EvidencePreview evidence={relationship.evidence} limit={2} />
    </div>
  );
}

export function OagObjectInspector({
  resource,
  related,
  relationships,
  actions,
  referenceIndex,
  onSelectResource,
  onActionExecuted,
  loading,
  error,
}: {
  resource: OptaleResourceRecord | null;
  related: OagObjectRelatedRecords | null;
  relationships?: OagObjectRelationshipInstance[];
  actions?: OptaleActionDefinition[];
  referenceIndex?: OagObjectReferenceIndex;
  onSelectResource?: (resourceId: string) => void;
  onActionExecuted?: () => void;
  loading?: boolean;
  error?: string | null;
}) {
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  if (!resource) {
    return (
      <aside className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Select an object to inspect.
      </aside>
    );
  }

  const runs = related?.runs || [];
  const policyDecisions = related?.policyDecisions || [];
  const lineageEdges = related?.lineageEdges || [];
  const auditEvents = related?.auditEvents || [];
  const objectRelationships = relationships || [];
  const objectActions = actions || [];
  const refs = referenceIndex || {};
  const objectSchema = resource.oag
    ? optaleOagObjectSchemaForType(resource.oag.objectType)
    : null;
  const totalRelated =
    runs.length + policyDecisions.length + lineageEdges.length + auditEvents.length;

  const runObjectAction = async (action: OptaleActionDefinition) => {
    const draft = buildOagObjectCommandDraft(resource, action);
    if (!draft.executable || !draft.payload) return;

    const payload = { ...draft.payload };
    if (draft.prompt) {
      const value = window.prompt(draft.prompt.label, draft.prompt.placeholder);
      if (!value?.trim()) return;
      payload[draft.prompt.field] = value.trim();
    }
    if (draft.confirmation) {
      const ok = await confirmDialog({
        title: action.label,
        message: draft.confirmation,
        confirmText: draft.buttonLabel,
        destructive: action.risk === "destructive",
      });
      if (!ok) return;
    }

    setRunningActionId(action.id);
    setActionFeedback(null);
    try {
      const response = await fetch("/api/optale/command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(failure?.error || `Command failed: ${response.status}`);
      }
      setActionFeedback({
        tone: "success",
        message: `${action.label} completed.`,
      });
      onActionExecuted?.();
    } catch (err) {
      setActionFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "Command failed.",
      });
    } finally {
      setRunningActionId(null);
    }
  };

  return (
    <aside className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-normal text-muted-foreground">
              <Link2 className="size-3.5" />
              Object Inspector
            </p>
            <h2 className="break-words text-lg font-semibold tracking-normal text-foreground">
              {resource.label}
            </h2>
            <p className="mt-1 break-all text-[11px] text-muted-foreground">
              {resource.id}
            </p>
          </div>
          <Pill value={resource.status || resource.kind} />
        </div>
        {resource.description && (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {resource.description}
          </p>
        )}
        <dl className="mt-3 space-y-1">
          <MetaLine label="Source" value={resource.source} />
          <MetaLine label="Cabinet" value={resource.cabinetPath} />
          <MetaLine label="Updated" value={formatTime(resource.updatedAt)} />
          <MetaLine label="Related" value={loading ? "loading" : totalRelated} />
        </dl>
        {resource.href && (
          <a
            href={resource.href}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" />
            Open object
          </a>
        )}
        {error && (
          <div className="mt-3 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {actionFeedback && (
          <div
            className={cn(
              "mt-3 flex gap-2 rounded-md border px-2.5 py-2 text-xs",
              actionFeedback.tone === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {actionFeedback.tone === "success" ? (
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
        )}
      </header>

      <Tabs defaultValue="overview" className="gap-0 border-t border-border/70">
        <div className="border-b border-border/70 px-4 py-2">
          <TabsList variant="line" className="h-8 w-full justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0">
          <InspectorSection
            title="Identity"
            count={resource.oag ? 1 : 0}
            icon={<Fingerprint className="size-3.5" />}
            empty="No canonical OAG identity has been projected yet."
          >
            {resource.oag && (
              <dl className="space-y-1">
                <MetaLine label="Canonical" value={resource.oag.canonicalId} />
                <MetaLine label="Type" value={resource.oag.objectType} />
                <MetaLine label="Object ID" value={resource.oag.objectId} />
                <MetaLine label="Schema" value={resource.oag.schemaRef} />
                <MetaLine label="Scope" value={resource.oag.scope} />
                <MetaLine label="Visibility" value={resource.oag.visibility} />
                <MetaLine label="Memory" value={resource.oag.memoryLane} />
                <MetaLine label="Temporal" value={resource.oag.temporalMode} />
                <MetaLine label="Source" value={resource.oag.sourceSystem} />
              </dl>
            )}
          </InspectorSection>

          <InspectorSection
            title="Object Neighbors"
            count={objectRelationships.length}
            icon={<GitBranch className="size-3.5" />}
            empty="No concrete OAG relationship instances are visible for this object yet."
          >
            {objectRelationships.slice(0, 6).map((relationship) => (
              <RelationshipInstanceRow
                key={relationship.id}
                relationship={relationship}
                onSelectResource={onSelectResource}
              />
            ))}
            <MoreCount shown={6} total={objectRelationships.length} />
          </InspectorSection>

          <InspectorSection
            title="Facts"
            count={resource.facts.length}
            icon={<FileText className="size-3.5" />}
            empty="No facts projected for this object."
          >
            <dl className="space-y-1">
              {resource.facts.map((fact) => (
                <MetaLine
                  key={`${resource.id}:${fact.label}`}
                  label={fact.label}
                  value={fact.value}
                />
              ))}
            </dl>
          </InspectorSection>
        </TabsContent>

        <TabsContent value="schema" className="mt-0">
          <InspectorSection
            title="Type Contract"
            count={objectSchema ? 1 : 0}
            icon={<Database className="size-3.5" />}
            empty="No OAG type metadata has been projected yet."
          >
            {resource.oag && objectSchema && (
              <dl className="space-y-1">
                <MetaLine label="Ontology" value={resource.oag.ontologyVersion} />
                <MetaLine label="Schema" value={resource.oag.schemaRef} />
                <MetaLine label="Type" value={resource.oag.objectType} />
                <MetaLine label="Category" value={objectSchema.category} />
                <MetaLine label="Primary" value={objectSchema.primaryKey} />
                <MetaLine label="Display" value={objectSchema.displayField} />
                <MetaLine label="Fields" value={objectSchema.fields.length} />
                <MetaLine
                  label="Relations"
                  value={objectSchema.relationships.length}
                />
                <MetaLine label="Actions" value={objectSchema.actions.length} />
                <MetaLine
                  label="Systems"
                  value={listLabel(objectSchema.sourceSystems)}
                />
                <MetaLine label="Object ID" value={resource.oag.objectId} />
                <MetaLine label="Source Ref" value={resource.oag.sourceRef} />
                <MetaLine label="Source" value={resource.oag.sourceSystem} />
                <MetaLine label="Cabinet" value={resource.oag.cabinetPath} />
              </dl>
            )}
          </InspectorSection>

          <InspectorSection
            title="Field Contract"
            count={objectSchema?.fields.length || 0}
            icon={<FileText className="size-3.5" />}
            empty="No field contract is available for this object type yet."
          >
            <div>
              {objectSchema?.fields.map((field) => (
                <SchemaDefinitionRow
                  key={`${resource.id}:field-contract:${field.name}`}
                  field={field}
                />
              ))}
            </div>
          </InspectorSection>

          <InspectorSection
            title="Relationship Types"
            count={objectSchema?.relationships.length || 0}
            icon={<GitBranch className="size-3.5" />}
            empty="No relationship types are available for this object type yet."
          >
            <div>
              {objectSchema?.relationships.map((relationship) => (
                <RelationshipDefinitionRow
                  key={`${resource.id}:relationship:${relationship.name}`}
                  relationship={relationship}
                />
              ))}
            </div>
          </InspectorSection>

          <InspectorSection
            title="Projected Fields"
            count={resource.facts.length}
            icon={<FileText className="size-3.5" />}
            empty="No projected fields are available for this object yet."
          >
            <div>
              {resource.facts.map((fact) => (
                <SchemaFieldRow
                  key={`${resource.id}:schema:${fact.label}`}
                  fact={fact}
                />
              ))}
            </div>
          </InspectorSection>
        </TabsContent>

        <TabsContent value="actions" className="mt-0">
          <InspectorSection
            title="Object Actions"
            count={objectActions.length}
            icon={<ListChecks className="size-3.5" />}
            empty="No contextual actions are projected for this object yet."
          >
            {objectActions.slice(0, 6).map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                resource={resource}
                running={runningActionId === action.id}
                onRun={(nextAction) => void runObjectAction(nextAction)}
              />
            ))}
            <MoreCount shown={6} total={objectActions.length} />
          </InspectorSection>
        </TabsContent>

        <TabsContent value="activity" className="mt-0">
          <InspectorSection
            title="Runs"
            count={runs.length}
            icon={<Activity className="size-3.5" />}
            empty="No action runs are linked yet."
          >
            {runs.slice(0, 5).map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
            <MoreCount shown={5} total={runs.length} />
          </InspectorSection>

          <InspectorSection
            title="Policy"
            count={policyDecisions.length}
            icon={<ShieldCheck className="size-3.5" />}
            empty="No policy decisions are linked yet."
          >
            {policyDecisions.slice(0, 4).map((decision) => (
              <PolicyRow key={decision.id} decision={decision} />
            ))}
            <MoreCount shown={4} total={policyDecisions.length} />
          </InspectorSection>

          <InspectorSection
            title="Lineage"
            count={lineageEdges.length}
            icon={<GitBranch className="size-3.5" />}
            empty="No lineage edges are linked yet."
          >
            {lineageEdges.slice(0, 4).map((edge) => (
              <LineageRow
                key={edge.id}
                edge={edge}
                referenceIndex={refs}
                onSelectResource={onSelectResource}
              />
            ))}
            <MoreCount shown={4} total={lineageEdges.length} />
          </InspectorSection>

          <InspectorSection
            title="Audit"
            count={auditEvents.length}
            icon={<ScrollText className="size-3.5" />}
            empty="No audit events are linked yet."
          >
            {auditEvents.slice(0, 4).map((event) => (
              <AuditRow key={event.id} event={event} />
            ))}
            <MoreCount shown={4} total={auditEvents.length} />
          </InspectorSection>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
