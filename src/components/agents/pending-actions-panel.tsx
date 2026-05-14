"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, ShieldAlert, X } from "lucide-react";
import type {
  ActionWarning,
  AgentAction,
  DispatchedAction,
  PendingAction,
} from "@/types/actions";
import { HARD_WARNINGS } from "@/types/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/stores/app-store";
import { formatEffortName, getModelEffortLevels } from "@/lib/agents/runtime-options";
import type { ProviderInfo } from "@/types/agents";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

const TYPE_COLORS: Record<string, string> = {
  LAUNCH_TASK: "bg-pink-500/15 text-pink-400 border-pink-500/20",
  SCHEDULE_JOB: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  SCHEDULE_TASK: "bg-violet-500/15 text-violet-400 border-violet-500/20",
};

const VISIBLE_ROW_CAP = 100;

interface RuntimeOverride {
  model?: string;
  effort?: string;
}

function actionHeadline(action: AgentAction): string {
  if (action.type === "SCHEDULE_JOB") {
    return `${action.agent} · ${action.name} · ${action.schedule}`;
  }
  if (action.type === "SCHEDULE_TASK") {
    return `${action.agent} · ${action.title} · ${action.when}`;
  }
  return `${action.agent} · ${action.title}`;
}

function hasHard(warnings: ActionWarning[]): boolean {
  return warnings.some((w) => HARD_WARNINGS.has(w.code));
}

function mergedRuntime(
  action: AgentAction,
  override: RuntimeOverride | undefined
): RuntimeOverride {
  return {
    model: override?.model ?? action.model,
    effort: override?.effort ?? action.effort,
  };
}

function pruneOverride(
  override: RuntimeOverride | undefined
): RuntimeOverride | undefined {
  if (!override) return undefined;
  const out: RuntimeOverride = {};
  if (override.model) out.model = override.model;
  if (override.effort) out.effort = override.effort;
  return out.model || out.effort ? out : undefined;
}

interface ActionRuntimePickerProps {
  action: AgentAction;
  override: RuntimeOverride | undefined;
  provider: ProviderInfo | undefined;
  disabled: boolean;
  onChange: (next: RuntimeOverride | undefined) => void;
}

function ActionRuntimePicker({
  action,
  override,
  provider,
  disabled,
  onChange,
}: ActionRuntimePickerProps) {
  const { t } = useLocale();
  const current = mergedRuntime(action, override);
  const overridden = !!(override?.model || override?.effort);

  const modelOptions = provider?.models || [];
  const effortOptions = useMemo(
    () => getModelEffortLevels(provider, current.model),
    [provider, current.model]
  );

  const setModel = (modelId: string | undefined) => {
    const merged: RuntimeOverride = { ...(override || {}) };
    if (modelId) merged.model = modelId;
    else delete merged.model;
    onChange(pruneOverride(merged));
  };

  const setEffort = (effortId: string | undefined) => {
    const merged: RuntimeOverride = { ...(override || {}) };
    if (effortId) merged.effort = effortId;
    else delete merged.effort;
    onChange(pruneOverride(merged));
  };

  const reset = () => onChange(undefined);

  const currentModelLabel =
    modelOptions.find((m) => m.id === current.model)?.name ||
    current.model ||
    "Default model";
  const currentEffortLabel =
    formatEffortName(current.effort) || "Default effort";

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 font-mono text-[10.5px] text-muted-foreground hover:text-foreground"
              disabled={disabled || modelOptions.length === 0}
              title={
                modelOptions.length === 0
                  ? "No models available for this conversation's provider"
                  : "Override the model for this dispatched task"
              }
            >
              <span className="text-muted-foreground">model</span>
              <span className="max-w-[140px] truncate">
                {currentModelLabel}
              </span>
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
          <DropdownMenuItem onClick={() => setModel(undefined)}>
            <span className="mr-2 inline-flex size-3 items-center justify-center">
              {!override?.model ? "✓" : ""}
            </span>
            Use default
          </DropdownMenuItem>
          {modelOptions.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onClick={() => setModel(model.id)}
            >
              <span className="mr-2 inline-flex size-3 items-center justify-center">
                {current.model === model.id ? "✓" : ""}
              </span>
              <span className="truncate">{model.name || model.id}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 font-mono text-[10.5px] text-muted-foreground hover:text-foreground"
              disabled={disabled || effortOptions.length === 0}
              title={
                effortOptions.length === 0
                  ? "No effort levels available for this model"
                  : "Override the reasoning effort for this dispatched task"
              }
            >
              <span className="text-muted-foreground">effort</span>
              <span className="max-w-[110px] truncate">
                {currentEffortLabel}
              </span>
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="max-h-72 w-48 overflow-y-auto">
          <DropdownMenuItem onClick={() => setEffort(undefined)}>
            <span className="mr-2 inline-flex size-3 items-center justify-center">
              {!override?.effort ? "✓" : ""}
            </span>
            Use default
          </DropdownMenuItem>
          {effortOptions.map((effort) => (
            <DropdownMenuItem
              key={effort.id}
              onClick={() => setEffort(effort.id)}
            >
              <span className="mr-2 inline-flex size-3 items-center justify-center">
                {current.effort === effort.id ? "✓" : ""}
              </span>
              <span className="truncate">
                {formatEffortName(effort.id) || effort.id}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {overridden && (
        <button
          type="button"
          className="text-[10px] text-muted-foreground hover:text-foreground"
          onClick={reset}
          disabled={disabled}
        >
          reset
        </button>
      )}
    </div>
  );
}

export interface PendingActionsPanelProps {
  conversationId: string;
  cabinetPath?: string;
  pending: PendingAction[];
  dispatched?: DispatchedAction[];
  /** Parent conversation's provider; scopes the per-row runtime picker. */
  parentProviderId?: string;
  parentAdapterType?: string;
  onRefresh?: () => void;
}

export function PendingActionsPanel({
  conversationId,
  cabinetPath,
  pending,
  dispatched,
  parentProviderId,
  onRefresh,
}: PendingActionsPanelProps) {
  const { t } = useLocale();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, RuntimeOverride>>({});

  const providers = useAppStore((s) => s.providers);
  const providersLoaded = useAppStore((s) => s.providersLoaded);
  const loadProviders = useAppStore((s) => s.loadProviders);
  const defaultProviderId = useAppStore((s) => s.defaultProviderId);

  useEffect(() => {
    if (!providersLoaded) void loadProviders();
  }, [providersLoaded, loadProviders]);

  const provider = useMemo(() => {
    const targetId = parentProviderId || defaultProviderId || undefined;
    if (!targetId) return providers[0];
    return providers.find((p) => p.id === targetId) || providers[0];
  }, [providers, parentProviderId, defaultProviderId]);

  const blockedByDispatcher = useMemo(
    () =>
      pending.length > 0 &&
      pending[0].warnings.some((w) => w.code === "persona_cannot_dispatch"),
    [pending]
  );

  const approvable = useMemo(
    () => pending.filter((item) => !hasHard(item.warnings)),
    [pending]
  );

  const allApprovableSelected =
    approvable.length > 0 && approvable.every((item) => selected.has(item.id));

  const visibleRows = showAll ? pending : pending.slice(0, VISIBLE_ROW_CAP);
  const hiddenCount = Math.max(0, pending.length - visibleRows.length);

  const toggle = (id: string, hard: boolean) => {
    if (hard) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(approvable.map((item) => item.id)));
  };

  const clearSelection = () => {
    setSelected(new Set());
  };

  const setOverrideFor = (id: string, next: RuntimeOverride | undefined) => {
    setOverrides((prev) => {
      const copy = { ...prev };
      if (!next) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  };

  const buildEdits = (
    ids: string[]
  ): Record<string, Partial<AgentAction>> | undefined => {
    const edits: Record<string, Partial<AgentAction>> = {};
    for (const id of ids) {
      const over = overrides[id];
      if (!over) continue;
      const patch: Partial<AgentAction> = {};
      if (over.model) patch.model = over.model;
      if (over.effort) patch.effort = over.effort;
      if (patch.model || patch.effort) edits[id] = patch;
    }
    return Object.keys(edits).length > 0 ? edits : undefined;
  };

  const submit = async (mode: "approve" | "reject", ids: string[]) => {
    if (ids.length === 0) return;
    setSubmitting(mode);
    setError(null);
    try {
      const body: Record<string, unknown> = { cabinetPath };
      if (mode === "approve") {
        body.approve = ids;
        const edits = buildEdits(ids);
        if (edits) body.edits = edits;
      } else {
        body.reject = ids;
      }
      const res = await fetch(
        `/api/agents/conversations/${encodeURIComponent(conversationId)}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      clearSelection();
      setOverrides({});
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(null);
    }
  };

  const pendingApproveIds = [...selected];
  const rejectIds = Array.from(selected);

  if (pending.length === 0 && (!dispatched || dispatched.length === 0)) {
    return null;
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border bg-muted/10">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-3.5 text-amber-400" />
          <h3 className="text-[12px] font-semibold">
            {pending.length > 0
              ? `Agent proposed ${pending.length} action${pending.length === 1 ? "" : "s"}`
              : `Actions resolved`}
          </h3>
          {dispatched && dispatched.length > 0 && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {dispatched.filter((a) => a.status === "dispatched").length} dispatched ·{" "}
              {dispatched.filter((a) => a.status === "rejected").length} rejected
            </span>
          )}
        </div>
        {pending.length > 0 && !blockedByDispatcher && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={allApprovableSelected ? clearSelection : selectAll}
              disabled={submitting !== null}
            >
              {allApprovableSelected ? "Deselect all" : "Select all"}
            </Button>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              disabled={submitting !== null || pending.length === 0}
              onClick={() =>
                void submit(
                  "reject",
                  pending.map((item) => item.id)
                )
              }
              title={t("pendingActions:rejectAll")}
            >
              {submitting === "reject" && selected.size === 0 ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <X className="size-3" />
              )}
              Reject all ({pending.length})
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              disabled={submitting !== null || approvable.length === 0}
              onClick={() =>
                void submit(
                  "approve",
                  approvable.map((item) => item.id)
                )
              }
              title={t("pendingActions:approveAll")}
            >
              {submitting === "approve" && selected.size === 0 ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
              Approve all ({approvable.length})
            </Button>
            {selected.size > 0 && (
              <>
                <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                  disabled={submitting !== null}
                  onClick={() => void submit("reject", rejectIds)}
                >
                  <X className="size-3" /> Reject selected
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px]"
                  disabled={submitting !== null}
                  onClick={() => void submit("approve", pendingApproveIds)}
                >
                  {submitting === "approve" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  Approve selected ({selected.size})
                </Button>
              </>
            )}
          </div>
        )}
      </header>

      {blockedByDispatcher && (
        <div className="border-b border-border bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-400">
          This agent does not have permission to assign tasks. Enable <em>Can
          assign tasks to other team members</em> on its agent page to let it
          dispatch work.
        </div>
      )}

      {error && (
        <div className="border-b border-border bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-400">
          {error}
        </div>
      )}

      {pending.length > 0 && (
        <ul className="divide-y divide-border">
          {visibleRows.map((item) => {
            const hard = hasHard(item.warnings);
            const checked = selected.has(item.id);
            const color =
              TYPE_COLORS[item.action.type] ||
              "bg-muted/30 text-muted-foreground border-border";
            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-start gap-2 px-3 py-2.5",
                  hard && "opacity-70"
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-3.5 shrink-0 accent-foreground disabled:opacity-50"
                  checked={checked}
                  disabled={hard || blockedByDispatcher || submitting !== null}
                  onChange={() => toggle(item.id, hard)}
                  aria-label={`Select ${item.action.type}`}
                />
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider",
                    color
                  )}
                >
                  {item.action.type}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-foreground/95">
                    {actionHeadline(item.action)}
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap break-words text-[11.5px] text-foreground/70">
                    {item.action.prompt}
                  </div>
                  {item.warnings.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.warnings.map((warning, wi) => {
                        const tone =
                          warning.severity === "hard"
                            ? "bg-rose-500/15 text-rose-400 border-rose-500/25"
                            : "bg-amber-500/15 text-amber-400 border-amber-500/25";
                        return (
                          <span
                            key={wi}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9.5px]",
                              tone
                            )}
                            title={warning.message}
                          >
                            <AlertTriangle className="size-2.5" />
                            {warning.code}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {!hard && !blockedByDispatcher && (
                    <ActionRuntimePicker
                      action={item.action}
                      override={overrides[item.id]}
                      provider={provider}
                      disabled={submitting !== null}
                      onChange={(next) => setOverrideFor(item.id, next)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hiddenCount > 0 && (
        <div className="border-t border-border bg-muted/30 px-3 py-1.5 text-center">
          <button
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            onClick={() => setShowAll(true)}
          >
            Show {hiddenCount} more…
          </button>
        </div>
      )}

      {dispatched && dispatched.length > 0 && pending.length === 0 && (
        <ul className="divide-y divide-border">
          {dispatched.slice(-20).map((entry) => {
            const tone =
              entry.status === "dispatched"
                ? "text-emerald-400"
                : "text-muted-foreground line-through";
            return (
              <li
                key={entry.id}
                className="flex items-start gap-2 px-3 py-1.5 text-[11.5px]"
              >
                <span className={cn("font-mono text-[10px] uppercase", tone)}>
                  {entry.status}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground/80">
                  {entry.action.type} → {entry.action.agent}
                </span>
                {entry.conversationId && (
                  <a
                    href={`/agents/conversations/${encodeURIComponent(entry.conversationId)}`}
                    className="text-[10.5px] text-primary hover:underline"
                  >
                    open
                  </a>
                )}
                {entry.jobId && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    job: {entry.jobId}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
