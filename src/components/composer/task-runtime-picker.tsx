"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { dedupFetch } from "@/lib/api/dedup-fetch";
import {
  BrainCircuit,
  Check,
  ChevronDown,
  RefreshCw,
  Search,
  Terminal,
} from "lucide-react";
import { ProviderGlyph } from "@/components/agents/provider-glyph";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";
import {
  formatEffortName,
  getModelEffortLevels,
  resolveProviderEffort,
  resolveProviderModel,
} from "@/lib/agents/runtime-options";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDefaultAdapterTypeForProviderInfo } from "@/lib/agents/adapter-options";
import type {
  ConversationRuntimeMode,
  ConversationRuntimeOverride,
} from "@/types/conversations";
import type {
  ProviderEffortLevel,
  ProviderInfo,
  ProviderModel,
} from "@/types/agents";

export type TaskRuntimeSelection = ConversationRuntimeOverride;


const AUTO_EFFORT_ID = "__auto__";

const EFFORT_TONES: Record<
  string,
  {
    header: string;
    bg: string;
    line: string;
    dot: string;
    selected: string;
    selectedDot: string;
    focus: string;
    idle: string;
  }
> = {
  [AUTO_EFFORT_ID]: {
    header: "text-slate-600 dark:text-slate-200",
    bg: "bg-slate-100 dark:bg-slate-800/50",
    line: "bg-slate-400 dark:bg-slate-500",
    dot: "bg-slate-500 dark:bg-slate-400",
    selected:
      "border-slate-600 bg-slate-100 shadow-[0_0_0_1px_rgba(71,85,105,0.24)] dark:border-slate-400 dark:bg-slate-800/60 dark:shadow-[0_0_0_1px_rgba(203,213,225,0.18)]",
    selectedDot: "bg-slate-700 dark:bg-slate-200",
    focus: "focus-visible:ring-slate-400/80",
    idle:
      "border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500",
  },
  none: {
    header: "text-slate-600 dark:text-slate-200",
    bg: "bg-slate-100 dark:bg-slate-800/50",
    line: "bg-slate-400 dark:bg-slate-500",
    dot: "bg-slate-500 dark:bg-slate-400",
    selected:
      "border-slate-600 bg-slate-100 shadow-[0_0_0_1px_rgba(71,85,105,0.24)] dark:border-slate-400 dark:bg-slate-800/60 dark:shadow-[0_0_0_1px_rgba(203,213,225,0.18)]",
    selectedDot: "bg-slate-700 dark:bg-slate-200",
    focus: "focus-visible:ring-slate-400/80",
    idle:
      "border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500",
  },
  minimal: {
    header: "text-yellow-700 dark:text-yellow-300",
    bg: "bg-yellow-50 dark:bg-yellow-900/30",
    line: "bg-yellow-400 dark:bg-yellow-500",
    dot: "bg-yellow-500 dark:bg-yellow-400",
    selected:
      "border-yellow-600 bg-yellow-50 shadow-[0_0_0_1px_rgba(234,179,8,0.26)] dark:border-yellow-400 dark:bg-yellow-900/40 dark:shadow-[0_0_0_1px_rgba(250,204,21,0.28)]",
    selectedDot: "bg-yellow-600 dark:bg-yellow-300",
    focus: "focus-visible:ring-yellow-400/80",
    idle:
      "border-yellow-300 hover:border-yellow-400 dark:border-yellow-800/60 dark:hover:border-yellow-600",
  },
  low: {
    header: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-50 dark:bg-amber-900/30",
    line: "bg-amber-400 dark:bg-amber-500",
    dot: "bg-amber-500 dark:bg-amber-400",
    selected:
      "border-amber-600 bg-amber-50 shadow-[0_0_0_1px_rgba(245,158,11,0.26)] dark:border-amber-400 dark:bg-amber-900/40 dark:shadow-[0_0_0_1px_rgba(251,191,36,0.28)]",
    selectedDot: "bg-amber-600 dark:bg-amber-300",
    focus: "focus-visible:ring-amber-400/80",
    idle:
      "border-amber-300 hover:border-amber-400 dark:border-amber-800/60 dark:hover:border-amber-600",
  },
  medium: {
    header: "text-orange-700 dark:text-orange-300",
    bg: "bg-orange-50 dark:bg-orange-900/30",
    line: "bg-orange-400 dark:bg-orange-500",
    dot: "bg-orange-500 dark:bg-orange-400",
    selected:
      "border-orange-600 bg-orange-50 shadow-[0_0_0_1px_rgba(249,115,22,0.28)] dark:border-orange-400 dark:bg-orange-900/40 dark:shadow-[0_0_0_1px_rgba(251,146,60,0.28)]",
    selectedDot: "bg-orange-600 dark:bg-orange-300",
    focus: "focus-visible:ring-orange-400/80",
    idle:
      "border-orange-300 hover:border-orange-400 dark:border-orange-800/60 dark:hover:border-orange-600",
  },
  high: {
    header: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    line: "bg-emerald-400 dark:bg-emerald-500",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    selected:
      "border-emerald-600 bg-emerald-50 shadow-[0_0_0_1px_rgba(16,185,129,0.26)] dark:border-emerald-400 dark:bg-emerald-900/40 dark:shadow-[0_0_0_1px_rgba(52,211,153,0.28)]",
    selectedDot: "bg-emerald-600 dark:bg-emerald-300",
    focus: "focus-visible:ring-emerald-400/80",
    idle:
      "border-emerald-300 hover:border-emerald-400 dark:border-emerald-800/60 dark:hover:border-emerald-600",
  },
  xhigh: {
    header: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-50 dark:bg-rose-900/30",
    line: "bg-rose-400 dark:bg-rose-500",
    dot: "bg-rose-500 dark:bg-rose-400",
    selected:
      "border-rose-600 bg-rose-50 shadow-[0_0_0_1px_rgba(244,63,94,0.26)] dark:border-rose-400 dark:bg-rose-900/40 dark:shadow-[0_0_0_1px_rgba(251,113,133,0.28)]",
    selectedDot: "bg-rose-600 dark:bg-rose-300",
    focus: "focus-visible:ring-rose-400/80",
    idle:
      "border-rose-300 hover:border-rose-400 dark:border-rose-800/60 dark:hover:border-rose-600",
  },
  max: {
    header: "text-red-700 dark:text-red-300",
    bg: "bg-red-50 dark:bg-red-900/30",
    line: "bg-red-400 dark:bg-red-500",
    dot: "bg-red-500 dark:bg-red-400",
    selected:
      "border-red-600 bg-red-50 shadow-[0_0_0_1px_rgba(239,68,68,0.28)] dark:border-red-400 dark:bg-red-900/40 dark:shadow-[0_0_0_1px_rgba(248,113,113,0.28)]",
    selectedDot: "bg-red-600 dark:bg-red-300",
    focus: "focus-visible:ring-red-400/80",
    idle:
      "border-red-300 hover:border-red-400 dark:border-red-800/60 dark:hover:border-red-600",
  },
};

function getEffortTone(id?: string) {
  if (!id) return EFFORT_TONES[AUTO_EFFORT_ID];
  return EFFORT_TONES[id.toLowerCase()] || EFFORT_TONES[AUTO_EFFORT_ID];
}

function isProviderReady(provider: ProviderInfo): boolean {
  return (
    (provider.enabled ?? true) &&
    provider.available &&
    (provider.authenticated ?? true)
  );
}

function describeProviderUnreadyReason(provider: ProviderInfo): string | null {
  if (provider.enabled === false) {
    return "Disabled in Settings. Re-enable it below.";
  }
  if (!provider.available) {
    return "Not installed on this machine. Follow the install guide below.";
  }
  if (provider.authenticated === false) {
    return "Installed but not authenticated. Finish the login step.";
  }
  return null;
}

function getSelectableProviders(providers: ProviderInfo[]): ProviderInfo[] {
  const enabled = providers.filter((provider) => provider.enabled ?? true);
  const ready = enabled.filter(isProviderReady);
  if (ready.length > 0) return ready;
  if (enabled.length > 0) return enabled;
  return providers;
}

function resolveSelectedProvider(
  providers: ProviderInfo[],
  providerId?: string,
  fallbackProviderId?: string | null
): ProviderInfo | undefined {
  const selectable = getSelectableProviders(providers);
  return (
    selectable.find((provider) => provider.id === providerId) ||
    selectable.find((provider) => provider.id === fallbackProviderId) ||
    selectable[0] ||
    providers.find((provider) => provider.id === providerId) ||
    providers.find((provider) => provider.id === fallbackProviderId)
  );
}

function resolveSelectedModel(
  provider: ProviderInfo | undefined,
  requestedModel?: string,
  fallbackModel?: string | null
): ProviderModel | undefined {
  return resolveProviderModel(provider, requestedModel, fallbackModel);
}

function hasExplicitRuntimeSelection(value: TaskRuntimeSelection): boolean {
  return Boolean(
    value.providerId ||
      value.adapterType ||
      value.model ||
      value.effort
  );
}

function getProviderEffortColumns(
  provider: ProviderInfo | undefined
): ProviderEffortLevel[] {
  if (!provider) return [];

  const seen = new Set<string>();
  const columns: ProviderEffortLevel[] = [];

  const pushLevels = (levels?: ProviderEffortLevel[]) => {
    for (const level of levels || []) {
      if (seen.has(level.id)) continue;
      seen.add(level.id);
      columns.push(level);
    }
  };

  pushLevels(provider.effortLevels);
  for (const model of provider.models || []) {
    pushLevels(model.effortLevels);
  }

  return columns;
}

function normalizeSelection(
  value: TaskRuntimeSelection,
  providers: ProviderInfo[],
  defaultProviderId?: string | null,
  defaultModel?: string | null,
  defaultEffort?: string | null
): TaskRuntimeSelection {
  const selectedProvider = resolveSelectedProvider(
    providers,
    value.providerId,
    defaultProviderId
  );
  const selectedModel = resolveSelectedModel(
    selectedProvider,
    value.model,
    selectedProvider?.id === defaultProviderId ? defaultModel : undefined
  );
  const allowDefaultEffortFallback = !hasExplicitRuntimeSelection(value);
  const selectedEffort = resolveProviderEffort(
    selectedProvider,
    selectedModel?.id,
    value.effort,
    allowDefaultEffortFallback && selectedProvider?.id === defaultProviderId
      ? defaultEffort
      : undefined
  );

  const runtimeMode: ConversationRuntimeMode =
    value.runtimeMode === "terminal" ? "terminal" : "native";
  const isTerminal = runtimeMode === "terminal";
  return {
    providerId: selectedProvider?.id,
    adapterType: getDefaultAdapterTypeForProviderInfo(
      providers,
      selectedProvider?.id,
      defaultProviderId
    ),
    // Terminal mode delegates model/effort to the CLI's own defaults — drop
    // them so they don't round-trip into the normalized selection.
    model: isTerminal
      ? undefined
      : selectedModel?.id,
    effort: isTerminal
      ? undefined
      : value.effort
        ? selectedEffort?.id
        : allowDefaultEffortFallback
          ? selectedEffort?.id
          : undefined,
    runtimeMode,
  };
}

function sameSelection(
  left: TaskRuntimeSelection,
  right: TaskRuntimeSelection
): boolean {
  return (
    (left.providerId || "") === (right.providerId || "") &&
    (left.adapterType || "") === (right.adapterType || "") &&
    (left.model || "") === (right.model || "") &&
    (left.effort || "") === (right.effort || "") &&
    (left.runtimeMode || "native") === (right.runtimeMode || "native")
  );
}

function groupModelsBySubProvider(
  models: ProviderModel[]
): Array<{ group: string; items: ProviderModel[] }> {
  const groups = new Map<string, ProviderModel[]>();
  for (const model of models) {
    const slash = model.id.indexOf("/");
    const group = slash > 0 ? model.id.slice(0, slash) : "other";
    const bucket = groups.get(group);
    if (bucket) bucket.push(model);
    else groups.set(group, [model]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group, items]) => ({ group, items }));
}

// Cap rendered rows so a ~100+ entitlement-gated catalog can't jank the
// dropdown; the search box narrows long lists well before the cap bites.
const COMBOBOX_RENDER_CAP = 200;

/**
 * Searchable, sub-provider-grouped model list. Replaces the fixed matrix for
 * providers that do per-machine dynamic discovery (OpenCode, Pi) where the
 * real list is dozens-to-hundreds of `vendor/model` ids. Triggers lazy
 * hydration of the real list on mount and exposes a refresh (bust the 60s
 * server cache after the user adds an API key).
 */
function ProviderModelCombobox({
  provider,
  currentProviderId,
  currentModelId,
  selectedEffortId,
  onSelect,
}: {
  provider: ProviderInfo;
  currentProviderId?: string;
  currentModelId?: string;
  selectedEffortId?: string;
  onSelect: (modelId: string, effortId?: string) => void;
}) {
  const ensureProviderModels = useAppStore((s) => s.ensureProviderModels);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // Own fetch for *display* so this works whether the parent feeds store
  // providers (composer) or a local snapshot (Settings/onboarding). The
  // store action is still called so the composer's resolveProviderModel
  // guard flips (provider.modelsHydrated). dedupFetch + the 60s server
  // cache collapse the two calls into one request.
  const [fetchedModels, setFetchedModels] = useState<ProviderModel[] | null>(
    null
  );
  // null = unknown/loading, "live" = real per-machine list, "offline" = the
  // CLI couldn't be queried and we're showing static defaults.
  const [discovery, setDiscovery] = useState<"live" | "offline" | null>(null);

  const loadModels = useCallback(
    async (refresh: boolean) => {
      void ensureProviderModels(provider.id, refresh ? { refresh: true } : undefined);
      try {
        const response = await dedupFetch(
          `/api/agents/providers/${encodeURIComponent(provider.id)}/models${
            refresh ? "?refresh=1" : ""
          }`
        );
        if (!response.ok) {
          setDiscovery("offline");
          return;
        }
        const data = (await response.json()) as {
          models?: ProviderModel[];
          dynamic?: boolean;
        };
        setDiscovery(data.dynamic === true ? "live" : "offline");
        if (Array.isArray(data.models) && data.models.length > 0) {
          setFetchedModels(data.models);
        }
      } catch {
        // keep the offline fallback already on `provider.models`
        setDiscovery("offline");
      }
    },
    [ensureProviderModels, provider.id]
  );

  useEffect(() => {
    setFetchedModels(null);
    setDiscovery(null);
    void loadModels(false);
  }, [loadModels]);

  const models = useMemo(
    () => fetchedModels ?? provider.models ?? [],
    [fetchedModels, provider.models]
  );
  const hydrating =
    Boolean(provider.dynamicModels) &&
    fetchedModels === null &&
    !provider.modelsHydrated;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (model) =>
        model.id.toLowerCase().includes(q) ||
        model.name.toLowerCase().includes(q)
    );
  }, [models, query]);

  const groups = useMemo(
    () => groupModelsBySubProvider(filtered.slice(0, COMBOBOX_RENDER_CAP)),
    [filtered]
  );

  const effortColumns = getProviderEffortColumns(provider);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadModels(true);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="bg-background">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-2">
        <Search className="size-3 shrink-0 text-muted-foreground/60" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search models (e.g. minimax, glm, gpt)"
          className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/50"
          autoFocus
        />
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/50">
          {filtered.length}/{models.length}
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh: re-read the CLI's model list (use after adding an API key)"
          className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
        </button>
      </div>

      {discovery === "offline" && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[9.5px] leading-relaxed text-amber-700 dark:text-amber-400">
          Showing offline defaults. {provider.name} couldn&apos;t be queried.
          Install &amp; configure it (set a provider API key or run{" "}
          <code className="rounded bg-amber-500/15 px-1 py-px font-mono">
            {provider.id === "pi" ? "pi --list-models" : "opencode auth login"}
          </code>
          ), then hit{" "}
          <RefreshCw className="inline size-2.5 -mt-px" /> Refresh to see your
          own models.
        </div>
      )}

      <div className="max-h-[15rem] overflow-y-auto">
        {hydrating && models.length === 0 ? (
          <div className="px-3 py-5 text-center text-[10px] text-muted-foreground">
            Loading your models…
          </div>
        ) : groups.length === 0 ? (
          <div className="px-3 py-5 text-center text-[10px] text-muted-foreground">
            {query
              ? `No models match “${query}”.`
              : "No models are available for this provider yet."}
          </div>
        ) : (
          groups.map(({ group, items }) => (
            <div key={group}>
              <div className="sticky top-0 z-10 bg-muted/60 px-2.5 py-1 text-[8.5px] font-semibold uppercase tracking-wide text-muted-foreground/70 backdrop-blur">
                {group}
              </div>
              {items.map((model) => {
                const checked =
                  currentProviderId === provider.id &&
                  currentModelId === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => onSelect(model.id, selectedEffortId)}
                    title={model.description || model.id}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors",
                      checked
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-3 shrink-0 items-center justify-center rounded-full border",
                        checked
                          ? "border-foreground/70 bg-foreground/80"
                          : "border-border"
                      )}
                    >
                      {checked && (
                        <span className="size-1.5 rounded-full bg-background" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                      {model.id}
                    </span>
                    {model.requires === "api_key" && (
                      <span className="shrink-0 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-px text-[8px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        API key
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
        {filtered.length > COMBOBOX_RENDER_CAP && (
          <div className="px-2.5 py-1.5 text-center text-[8.5px] text-muted-foreground/60">
            +{filtered.length - COMBOBOX_RENDER_CAP} more, keep typing to filter
          </div>
        )}
      </div>

      {effortColumns.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-border/60 bg-muted/15 px-2.5 py-1.5 scrollbar-none">
          <span className="shrink-0 text-[8.5px] font-semibold uppercase tracking-wide text-muted-foreground/60">
            Effort
          </span>
          {[{ id: AUTO_EFFORT_ID, name: "Auto" }, ...effortColumns].map(
            (effort) => {
              const isAuto = effort.id === AUTO_EFFORT_ID;
              const active = isAuto
                ? !selectedEffortId
                : selectedEffortId === effort.id;
              const tone = getEffortTone(effort.id);
              return (
                <button
                  key={effort.id}
                  type="button"
                  onClick={() => {
                    if (!currentModelId) return;
                    onSelect(currentModelId, isAuto ? undefined : effort.id);
                  }}
                  disabled={!currentModelId}
                  title={
                    currentModelId
                      ? effort.name
                      : "Pick a model first"
                  }
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium transition-colors disabled:opacity-40",
                    active
                      ? tone.selected
                      : cn("bg-background", tone.idle, tone.header)
                  )}
                >
                  {isAuto
                    ? "Auto"
                    : formatEffortName(effort.name) || effort.name}
                </button>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}

export type RuntimeMode = "native" | "terminal";

export interface RuntimeMatrixValue {
  providerId?: string | null;
  model?: string | null;
  effort?: string | null;
  runtimeMode?: RuntimeMode | null;
}

interface RuntimeMatrixPickerProps {
  providers: ProviderInfo[];
  value: RuntimeMatrixValue;
  onChange: (value: {
    providerId: string;
    model?: string;
    effort?: string;
    runtimeMode?: RuntimeMode;
  }) => void;
  /**
   * When true, show all enabled providers including ones that aren't installed
   * or authenticated yet. Useful for settings surfaces where the user is
   * configuring a default.
   */
  includeUnavailable?: boolean;
  /**
   * When true, render the Native/Terminal toggle above the tabs. Terminal mode
   * hides the model/effort matrix since PTY runs always use the CLI's default
   * flags. Off by default so settings surfaces (which configure defaults) don't
   * expose the toggle unless explicitly asked.
   */
  showRuntimeModeToggle?: boolean;
  className?: string;
  emptyText?: string;
  /** Rendered right-aligned at the end of the sentence row (e.g. the
   *  composer's "App default" reset pill). */
  trailing?: React.ReactNode;
}

/**
 * Inline provider/model/effort picker rendered as a sentence —
 * "Run agents with <provider> using <model> at <effort> effort." Each chip
 * expands an option panel below the sentence. Same component the task
 * composer runtime picker renders inside its dropdown; reused by Settings →
 * Providers for default selection.
 */
export function RuntimeMatrixPicker({
  providers,
  value,
  onChange,
  includeUnavailable = false,
  showRuntimeModeToggle = false,
  className,
  emptyText = "No providers available.",
  trailing,
}: RuntimeMatrixPickerProps) {
  const { t } = useLocale();
  const runtimeMode: RuntimeMode = value.runtimeMode === "terminal" ? "terminal" : "native";
  const selectableProviders = useMemo(() => {
    const base = includeUnavailable
      ? providers.filter((provider) => provider.enabled ?? true)
      : getSelectableProviders(providers);
    const ready: ProviderInfo[] = [];
    const unready: ProviderInfo[] = [];
    for (const provider of base) {
      if (isProviderReady(provider)) ready.push(provider);
      else unready.push(provider);
    }
    return [...ready, ...unready];
  }, [providers, includeUnavailable]);

  const readyProviderIds = useMemo(
    () =>
      new Set(
        selectableProviders
          .filter((provider) => isProviderReady(provider))
          .map((provider) => provider.id)
      ),
    [selectableProviders]
  );

  // Which chip's option panel is expanded below the sentence.
  const [openPanel, setOpenPanel] = useState<
    "provider" | "model" | "effort" | null
  >(null);

  const currentProvider = useMemo(
    () =>
      resolveSelectedProvider(providers, value.providerId ?? undefined, undefined),
    [providers, value.providerId]
  );

  const currentModel = useMemo(
    () =>
      resolveSelectedModel(currentProvider, value.model ?? undefined, undefined),
    [currentProvider, value.model]
  );

  const currentEffortLevels = useMemo(
    () => getModelEffortLevels(currentProvider, currentModel?.id),
    [currentProvider, currentModel?.id]
  );

  if (selectableProviders.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-border/70 px-3 py-5 text-center text-[10px] text-muted-foreground",
          className
        )}
      >
        {emptyText}
      </div>
    );
  }

  const setRuntimeMode = (nextMode: RuntimeMode) => {
    const targetProviderId =
      value.providerId ||
      currentProvider?.id ||
      selectableProviders[0]?.id ||
      "";
    if (!targetProviderId) return;
    if (nextMode === "terminal") {
      onChange({
        providerId: targetProviderId,
        runtimeMode: "terminal",
      });
    } else {
      onChange({
        providerId: targetProviderId,
        model: value.model ?? undefined,
        effort: value.effort ?? undefined,
        runtimeMode: "native",
      });
    }
  };

  const isTerminal = runtimeMode === "terminal";

  const togglePanel = (panel: "provider" | "model" | "effort") =>
    setOpenPanel((prev) => (prev === panel ? null : panel));

  const pickProvider = (provider: ProviderInfo) => {
    setOpenPanel(null);
    if (provider.id === currentProvider?.id) return;
    onChange({
      providerId: provider.id,
      model: resolveProviderModel(provider, undefined, undefined)?.id,
      effort: undefined,
      runtimeMode: "native",
    });
  };

  const pickModel = (modelId: string) => {
    setOpenPanel(null);
    if (!currentProvider) return;
    // Keep the current effort only if the new model supports it.
    const supported = getModelEffortLevels(currentProvider, modelId);
    const keepEffort =
      value.effort && supported.some((level) => level.id === value.effort)
        ? value.effort
        : undefined;
    onChange({
      providerId: currentProvider.id,
      model: modelId,
      effort: keepEffort,
      runtimeMode: "native",
    });
  };

  const pickEffort = (effortId?: string) => {
    setOpenPanel(null);
    if (!currentProvider) return;
    onChange({
      providerId: currentProvider.id,
      model: currentModel?.id,
      effort: effortId,
      runtimeMode: "native",
    });
  };

  const currentEffort = resolveProviderEffort(
    currentProvider,
    currentModel?.id,
    value.effort ?? undefined,
    undefined
  );
  const effortName = value.effort
    ? currentEffort?.name || formatEffortName(value.effort) || value.effort
    : t("runtime:auto");
  const effortTone = getEffortTone(value.effort ?? AUTO_EFFORT_ID);

  const chipClass =
    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold text-foreground transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className={cn("flex flex-col", className)}>
      {showRuntimeModeToggle && (
        <div
          role="tablist"
          aria-label={t("runtime:modeAriaLabel")}
          className="relative z-10 grid grid-cols-2 gap-1 -mb-px px-2 pt-2 text-[12px] font-medium"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isTerminal}
            onClick={() => setRuntimeMode("native")}
            className={cn(
              "relative inline-flex h-9 items-center justify-center gap-2 rounded-t-md border border-b-0 px-4 transition-colors",
              !isTerminal
                ? "border-border/70 bg-background text-foreground shadow-[0_-1px_0_0_var(--border)]"
                : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
            title={t("runtime:nativeTranscriptTitle")}
          >
            <span>{t("runtime:native")}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isTerminal}
            onClick={() => setRuntimeMode("terminal")}
            className={cn(
              "relative inline-flex h-9 items-center justify-center gap-2 rounded-t-md border border-b-0 px-4 transition-colors",
              isTerminal
                ? "border-emerald-500/50 bg-zinc-950 text-zinc-100 shadow-[0_-1px_0_0_rgba(16,185,129,0.5)] dark:border-emerald-400/50"
                : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
            title={t("runtime:terminalTitle")}
          >
            <Terminal className="h-4 w-4" />
            <span>{t("runtime:terminal")}</span>
          </button>
        </div>
      )}

      {isTerminal ? (
        <TerminalProviderPanel
          providers={selectableProviders}
          readyProviderIds={readyProviderIds}
          selectedProviderId={value.providerId ?? currentProvider?.id ?? null}
          onSelect={(providerId) =>
            onChange({ providerId, runtimeMode: "terminal" })
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl bg-card">
          <div className="flex items-center gap-x-1.5 whitespace-nowrap px-3 py-2.5 text-[12.5px] [&>span]:shrink-0">
            <span className="text-muted-foreground">
              {t("runtime:sentenceRunWith")}
            </span>
            <button
              type="button"
              aria-expanded={openPanel === "provider"}
              onClick={() => togglePanel("provider")}
              className={cn(
                chipClass,
                "shrink-0 bg-muted/70 hover:bg-muted",
                openPanel === "provider" && "bg-muted"
              )}
            >
              {currentProvider ? (
                <>
                  <ProviderGlyph
                    icon={currentProvider.icon}
                    className="h-3 w-3"
                  />
                  <span>{currentProvider.name}</span>
                </>
              ) : (
                <span>{t("runtime:noProvider")}</span>
              )}
              <ChevronDown
                className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform",
                  openPanel === "provider" && "rotate-180"
                )}
              />
            </button>
            <span className="text-muted-foreground">
              {t("runtime:sentenceUsing")}
            </span>
            <button
              type="button"
              aria-expanded={openPanel === "model"}
              onClick={() => togglePanel("model")}
              className={cn(
                chipClass,
                "min-w-0 bg-muted/70 hover:bg-muted",
                openPanel === "model" && "bg-muted"
              )}
            >
              <span className="min-w-0 max-w-[14rem] truncate">
                {currentModel?.name || t("runtime:chooseModel")}
              </span>
              <ChevronDown
                className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform",
                  openPanel === "model" && "rotate-180"
                )}
              />
            </button>
            {currentEffortLevels.length > 0 && (
              <>
                <span className="text-muted-foreground">
                  {t("runtime:sentenceAt")}
                </span>
                <button
                  type="button"
                  aria-expanded={openPanel === "effort"}
                  onClick={() => togglePanel("effort")}
                  className={cn(
                    chipClass,
                    "shrink-0",
                    effortTone.bg,
                    effortTone.header
                  )}
                >
                  <span
                    className={cn("size-1.5 rounded-full", effortTone.dot)}
                  />
                  <span>{effortName}</span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 opacity-60 transition-transform",
                      openPanel === "effort" && "rotate-180"
                    )}
                  />
                </button>
                <span className="text-muted-foreground">
                  {t("runtime:sentenceEffort")}
                </span>
              </>
            )}
            {trailing ? (
              <span className="ms-auto shrink-0 ps-2">{trailing}</span>
            ) : null}
          </div>

          {openPanel === "provider" && (
            <div className="max-h-[15rem] overflow-y-auto border-t border-border/60">
              {selectableProviders.map((provider) => {
                const ready = readyProviderIds.has(provider.id);
                const selected = currentProvider?.id === provider.id;
                const unreadyReason = describeProviderUnreadyReason(provider);
                return (
                  <button
                    key={provider.id}
                    type="button"
                    disabled={!ready}
                    onClick={() => pickProvider(provider)}
                    title={
                      ready
                        ? provider.name
                        : `${provider.name}: ${unreadyReason || t("runtime:notAvailable")}`
                    }
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                      selected
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/50",
                      !ready && "cursor-not-allowed opacity-50 grayscale"
                    )}
                  >
                    <ProviderGlyph
                      icon={provider.icon}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                      {provider.name}
                    </span>
                    {!ready && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                        {t("runtime:notAvailable")}
                      </span>
                    )}
                    {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {openPanel === "model" && currentProvider && (
            <div className="border-t border-border/60">
              {currentProvider.dynamicModels ? (
                <ProviderModelCombobox
                  provider={currentProvider}
                  currentProviderId={currentProvider.id}
                  currentModelId={currentModel?.id}
                  selectedEffortId={value.effort ?? undefined}
                  onSelect={(modelId, effortId) => {
                    setOpenPanel(null);
                    onChange({
                      providerId: currentProvider.id,
                      model: modelId,
                      effort: effortId,
                      runtimeMode: "native",
                    });
                  }}
                />
              ) : (currentProvider.models || []).length === 0 ? (
                <div className="px-3 py-5 text-center text-[10px] text-muted-foreground">
                  No models are available for this provider yet.
                </div>
              ) : (
                <div className="max-h-[15rem] overflow-y-auto">
                  {(currentProvider.models || []).map((model) => {
                    const selected = currentModel?.id === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => pickModel(model.id)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                          selected
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-[12px] font-medium">
                            {model.name}
                            {model.requires === "api_key" ? (
                              <span
                                title={t("runtime:ptyWarningTitle")}
                                className="inline-flex items-center rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-px text-[8.5px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
                              >
                                API key
                              </span>
                            ) : null}
                          </span>
                          {model.description ? (
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {model.description}
                            </span>
                          ) : null}
                        </div>
                        {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {openPanel === "effort" &&
            currentProvider &&
            currentEffortLevels.length > 0 && (
              <div className="max-h-[15rem] overflow-y-auto border-t border-border/60">
                {[
                  { id: AUTO_EFFORT_ID, name: t("runtime:auto") },
                  ...currentEffortLevels,
                ].map((effort) => {
                  const isAuto = effort.id === AUTO_EFFORT_ID;
                  const selected = isAuto
                    ? !value.effort
                    : value.effort === effort.id;
                  const tone = getEffortTone(effort.id);
                  const label = isAuto
                    ? t("runtime:auto")
                    : formatEffortName(effort.name) || effort.name;
                  return (
                    <button
                      key={effort.id}
                      type="button"
                      onClick={() => pickEffort(isAuto ? undefined : effort.id)}
                      title={
                        "description" in effort ? effort.description : undefined
                      }
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                        selected ? "bg-accent" : "hover:bg-muted/50"
                      )}
                    >
                      <span
                        className={cn("size-2 shrink-0 rounded-full", tone.dot)}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-[12px] font-medium",
                          tone.header
                        )}
                      >
                        {label}
                      </span>
                      {selected && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
        </div>
      )}
    </div>
  );
}

/**
 * Dedicated Terminal-mode picker. Replaces the Tabs/matrix layout with a
 * grid of CLI cards — one click = spawn. No model/effort because PTY always
 * uses the CLI's own defaults. Ready providers highlight their selected
 * state; unready providers render disabled with the reason in the title.
 */
function TerminalProviderPanel({
  providers,
  readyProviderIds,
  selectedProviderId,
  onSelect,
}: {
  providers: ProviderInfo[];
  readyProviderIds: Set<string>;
  selectedProviderId: string | null;
  onSelect: (providerId: string) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[10px] font-medium text-zinc-300">
        <Terminal className="size-3 text-emerald-400" />
        <span>{t("composerExtras:pickCliPty")}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3">
        {providers.map((provider) => {
          const ready = readyProviderIds.has(provider.id);
          const unreadyReason = describeProviderUnreadyReason(provider);
          const selected = ready && selectedProviderId === provider.id;
          const statusLabel = ready
            ? t("runtime:ready")
            : provider.available
              ? t("runtime:loginRequired")
              : t("runtime:notInstalled");
          return (
            <button
              key={provider.id}
              type="button"
              disabled={!ready}
              onClick={() => {
                if (!ready) return;
                onSelect(provider.id);
              }}
              title={
                ready
                  ? t("runtime:clickToLaunch", { name: provider.name })
                  : `${provider.name}: ${unreadyReason || t("runtime:notAvailable")}`
              }
              className={cn(
                "group relative flex flex-col items-start gap-1.5 rounded-md border px-2.5 py-2 text-left transition-all",
                selected
                  ? "border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]"
                  : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600 hover:bg-zinc-900",
                !ready &&
                  "cursor-not-allowed opacity-50 grayscale hover:border-zinc-800 hover:bg-zinc-900/40"
              )}
            >
              <div className="flex w-full items-center gap-1.5">
                <div
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded",
                    selected
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-zinc-800 text-zinc-400 group-hover:text-zinc-200"
                  )}
                >
                  <ProviderGlyph icon={provider.icon} className="size-3" />
                </div>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[11.5px] font-medium",
                    selected ? "text-emerald-100" : "text-zinc-100"
                  )}
                >
                  {provider.name}
                </span>
                {selected && (
                  <Check className="size-3 shrink-0 text-emerald-400" />
                )}
              </div>
              <span
                className={cn(
                  "text-[9px] font-medium uppercase tracking-wide",
                  ready
                    ? selected
                      ? "text-emerald-400/90"
                      : "text-emerald-500/70"
                    : "text-zinc-500"
                )}
              >
                {statusLabel}
              </span>
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5 border-t border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[9.5px] leading-relaxed text-zinc-500">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-sm bg-red-500 px-1 py-px text-[8.5px] font-bold uppercase tracking-wider text-white">
            Experimental
          </span>
          <span className="rounded-sm bg-emerald-500/20 px-1 py-px font-mono text-[8.5px] font-bold uppercase tracking-wider text-emerald-300">
            Hacker mode
          </span>
          <span className="text-zinc-300">
            Cabinet still writes to your KB. The agent uses its own tools.
            What you lose is the structured UI layer: no artifact extraction
            from the stream, no live summaries, no &quot;what happened&quot;
            panels. You&apos;re watching the raw CLI. Think of it as running
            your own tmux inside Cabinet, for hackers who want to drive the
            CLI directly.
          </span>
        </p>
        <p>
          Model &amp; effort use each CLI&apos;s own defaults. Resume{" "}
          <span className="text-zinc-400">--resume</span>/<span className="text-zinc-400">--session</span>{" "}
          is wired for Claude, Cursor, and OpenCode.
        </p>
        <p className="text-zinc-400">
          Want tighter Cabinet integration for your CLI?{" "}
          <a
            href="https://discord.gg/hJa5TRTbTH"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-400 underline-offset-2 hover:underline"
          >
            Join our Discord
          </a>
          {", "}we&apos;re happy to help wire up stream-parsing + session resume for it.
        </p>
      </div>
    </div>
  );
}

export function TaskRuntimePicker({
  value,
  onChange,
  align = "start",
  className,
  compact = false,
}: {
  value: TaskRuntimeSelection;
  onChange: (value: TaskRuntimeSelection) => void;
  align?: "start" | "center" | "end";
  className?: string;
  /** Icon-only trigger (no model/effort labels) — used in tight surfaces
   *  like the side-panel conversation composer. */
  compact?: boolean;
}) {
  const { t } = useLocale();
  const providers = useAppStore((s) => s.providers);
  const defaultProviderId = useAppStore((s) => s.defaultProviderId);
  const defaultModel = useAppStore((s) => s.defaultModel);
  const defaultEffort = useAppStore((s) => s.defaultEffort);
  const loading = useAppStore((s) => s.providersLoading);
  const [open, setOpen] = useState(false);


  const normalizedValue = useMemo(
    () =>
      providers.length > 0
        ? normalizeSelection(
            value,
            providers,
            defaultProviderId,
            defaultModel,
            defaultEffort
          )
        : value,
    [defaultEffort, defaultModel, defaultProviderId, providers, value]
  );

  const appDefaultSelection = useMemo(
    () =>
      providers.length > 0
        ? normalizeSelection(
            {},
            providers,
            defaultProviderId,
            defaultModel,
            defaultEffort
          )
        : {},
    [defaultEffort, defaultModel, defaultProviderId, providers]
  );

  useEffect(() => {
    if (providers.length === 0) return;
    if (!sameSelection(value, normalizedValue)) {
      onChange(normalizedValue);
    }
  }, [normalizedValue, onChange, providers.length, value]);

  const currentProvider = useMemo(
    () =>
      resolveSelectedProvider(
        providers,
        normalizedValue.providerId,
        defaultProviderId
      ),
    [defaultProviderId, normalizedValue.providerId, providers]
  );

  const currentModel = useMemo(
    () =>
      resolveSelectedModel(
        currentProvider,
        normalizedValue.model,
        currentProvider?.id === defaultProviderId ? defaultModel : undefined
      ),
    [currentProvider, defaultModel, defaultProviderId, normalizedValue.model]
  );

  const currentEffort = useMemo(
    () =>
      resolveProviderEffort(
        currentProvider,
        currentModel?.id,
        normalizedValue.effort,
        undefined
      ),
    [currentModel?.id, currentProvider, normalizedValue.effort]
  );

  const appDefaultProvider = useMemo(
    () =>
      resolveSelectedProvider(
        providers,
        appDefaultSelection.providerId,
        defaultProviderId
      ),
    [appDefaultSelection.providerId, defaultProviderId, providers]
  );

  const appDefaultModelInfo = useMemo(
    () =>
      resolveSelectedModel(
        appDefaultProvider,
        appDefaultSelection.model,
        appDefaultProvider?.id === defaultProviderId ? defaultModel : undefined
      ),
    [
      appDefaultProvider,
      appDefaultSelection.model,
      defaultModel,
      defaultProviderId,
    ]
  );

  // Audit #052: the prior tooltip "Task model: Claude Opus 4.7 · Medium ·
  // Claude Code" read as a compound model identifier, sending users to
  // search Anthropic for a non-existent product. Split the three concepts
  // (model, effort tier, provider) explicitly so each is recognisable.
  const triggerTitle = currentProvider
    ? t("runtime:triggerSummary", {
        model: currentModel?.name || currentProvider.name,
        effort:
          currentEffort?.name ||
          (normalizedValue.effort
            ? formatEffortName(normalizedValue.effort)
            : t("runtime:defaultLabel")),
        provider: currentProvider.name,
      })
    : loading
      ? t("runtime:loadingAvailableProviders")
      : t("runtime:triggerSystemDefault");

  function applySelection(
    providerId: string,
    modelId?: string,
    effortId?: string,
    runtimeMode?: RuntimeMode
  ) {
    const normalized = normalizeSelection(
      {
        providerId,
        model: modelId,
        effort: effortId,
      },
      providers,
      defaultProviderId,
      defaultModel,
      defaultEffort
    );
    onChange({
      ...normalized,
      runtimeMode: runtimeMode ?? value.runtimeMode ?? "native",
      // Terminal mode should not carry model/effort — PTY uses the CLI's own
      // defaults, so clear them to keep the conversation override honest.
      ...(runtimeMode === "terminal"
        ? { model: undefined, effort: undefined }
        : {}),
    });
    // Only close the dropdown on provider/model selection, not when toggling
    // mode — users should see the toggle animate.
    if (runtimeMode === undefined) setOpen(false);
  }

  function resetToDefault() {
    onChange(appDefaultSelection);
    setOpen(false);
  }

  const isTerminalTrigger = value.runtimeMode === "terminal";
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-8 items-center rounded-md border transition-colors disabled:pointer-events-none disabled:opacity-50",
          compact ? "gap-0 px-1.5" : "gap-1 px-2",
          isTerminalTrigger
            ? "border-emerald-500/40 bg-zinc-950 text-zinc-100 hover:bg-zinc-900"
            : "border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          className
        )}
        aria-label={isTerminalTrigger ? `${triggerTitle} (Terminal)` : triggerTitle}
        title={isTerminalTrigger ? `${triggerTitle} · Terminal (PTY)` : triggerTitle}
        disabled={loading && providers.length === 0}
      >
        {currentProvider ? (
          isTerminalTrigger ? (
            <>
              <div className="flex size-4 shrink-0 items-center justify-center rounded border border-emerald-500/40 bg-zinc-900 text-emerald-400">
                <Terminal className="h-2.5 w-2.5" />
              </div>
              {!compact && (
                <>
                  <span className="text-[11px] font-medium text-zinc-100">
                    {currentProvider.name}
                  </span>
                  <span className="text-[9px] text-zinc-500">·</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                    Terminal
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <div className="flex size-4 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/30">
                <ProviderGlyph icon={currentProvider.icon} className="h-2.5 w-2.5" />
              </div>
              {!compact && (
                <>
                  <span className={cn("text-[11px] font-medium", getEffortTone(normalizedValue.effort ?? AUTO_EFFORT_ID).header)}>
                    {currentModel?.name || currentProvider.name}
                  </span>
                  <span className="text-[9px] text-muted-foreground/40">·</span>
                  <span className={cn("text-[9px] font-medium", getEffortTone(normalizedValue.effort ?? AUTO_EFFORT_ID).header)}>
                    {currentEffort?.name || (normalizedValue.effort ? formatEffortName(normalizedValue.effort) : t("runtime:auto"))}
                  </span>
                </>
              )}
            </>
          )
        ) : loading ? (
          <BrainCircuit className="h-4 w-4 opacity-50" />
        ) : (
          <>
            <BrainCircuit className="h-4 w-4" />
            {!compact && (
              <span className="text-[11px] font-medium">{t("runtime:auto")}</span>
            )}
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        className="w-[min(43rem,calc(100vw-1rem))] min-w-[17rem] max-w-[calc(100vw-1rem)] p-0"
      >
        <div className="px-0 pb-0">
          <RuntimeMatrixPicker
            providers={providers}
            value={{
              providerId: normalizedValue.providerId,
              model: normalizedValue.model,
              effort: normalizedValue.effort,
              runtimeMode: value.runtimeMode ?? "native",
            }}
            showRuntimeModeToggle
            onChange={({ providerId, model, effort, runtimeMode }) =>
              applySelection(providerId, model, effort, runtimeMode)
            }
            trailing={
              <button
                type="button"
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-medium transition-colors",
                  sameSelection(normalizedValue, appDefaultSelection)
                    ? "border-foreground/20 bg-accent text-accent-foreground"
                    : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                )}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  resetToDefault();
                }}
                title={[
                  appDefaultModelInfo?.name || t("runtime:defaultModel"),
                  appDefaultSelection.effort
                    ? formatEffortName(appDefaultSelection.effort)
                    : t("runtime:auto"),
                  appDefaultProvider?.name || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                {sameSelection(normalizedValue, appDefaultSelection)
                  ? t("runtime:appDefault")
                  : t("runtime:selectAppDefault")}
              </button>
            }
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
