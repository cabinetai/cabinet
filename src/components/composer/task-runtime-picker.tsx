"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { BrainCircuit, Check, Sparkles, Terminal } from "lucide-react";
import { ProviderGlyph } from "@/components/agents/provider-glyph";
import { cn } from "@/lib/utils";
import {
  formatEffortName,
  getModelEffortLevels,
  resolveProviderEffort,
  resolveProviderModel,
} from "@/lib/agents/runtime-options";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
    bg: "bg-slate-100 border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700",
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
    bg: "bg-slate-100 border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700",
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
    bg: "bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800/60",
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
    bg: "bg-amber-50 border border-amber-200 dark:bg-amber-900/30 dark:border-amber-800/60",
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
    bg: "bg-orange-50 border border-orange-200 dark:bg-orange-900/30 dark:border-orange-800/60",
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
    bg: "bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800/60",
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
    bg: "bg-rose-50 border border-rose-200 dark:bg-rose-900/30 dark:border-rose-800/60",
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
    bg: "bg-red-50 border border-red-200 dark:bg-red-900/30 dark:border-red-800/60",
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

function SelectionRadio({
  checked,
  label,
  onSelect,
  toneId,
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
  toneId?: string;
}) {
  const tone = getEffortTone(toneId);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      className={cn(
        "inline-flex size-[22px] items-center justify-center rounded-full border-[2.5px] transition-[border-color,background-color,box-shadow] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-1",
        tone.focus,
        checked
          ? tone.selected
          : cn("bg-background", tone.idle)
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
    >
      <span
        className={cn(
          "size-[9px] rounded-full transition-transform",
          checked ? cn("scale-100", tone.selectedDot) : "scale-0 bg-transparent"
        )}
      />
    </button>
  );
}

function ProviderRuntimeMatrix({
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
  const matrixEffortColumns = getProviderEffortColumns(provider);
  const models = provider.models || [];

  if (models.length === 0) {
    return (
      <div className="px-3 py-5 text-center text-[10px] text-muted-foreground">
        No models are available for this provider yet.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <div
          role="radiogroup"
          aria-label={`Task runtime matrix for ${provider.name}`}
          className="min-w-max"
        >
          <table className="w-full border-collapse text-[9px]">
            <thead className="bg-muted/25">
              <tr>
                <th className="min-w-[9.5rem] px-2.5 py-1.5 text-left font-medium text-foreground">
                  Model
                </th>
                {[{ id: AUTO_EFFORT_ID, name: "Auto" }, ...matrixEffortColumns].map(
                  (effort) => {
                    const tone = getEffortTone(effort.id);
                    const label =
                      effort.id === AUTO_EFFORT_ID
                        ? "Auto"
                        : formatEffortName(effort.name) || effort.name;

                    return (
                      <th
                        key={effort.id}
                        className="min-w-[3.1rem] px-1 py-1 text-center"
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className={cn(
                              "text-[8.5px] font-semibold",
                              tone.header
                            )}
                          >
                            {label}
                          </span>
                          <span className="flex w-full items-center gap-1">
                            <span
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                tone.dot
                              )}
                            />
                            <span
                              className={cn(
                                "h-0.5 flex-1 rounded-full",
                                tone.line
                              )}
                            />
                          </span>
                        </div>
                      </th>
                    );
                  }
                )}
              </tr>
            </thead>
            <tbody>
              {models.map((model) => {
                const modelEfforts = getModelEffortLevels(provider, model.id);
                const isCurrentModel =
                  currentProviderId === provider.id && currentModelId === model.id;

                return (
                  <tr
                    key={model.id}
                    className={cn(
                      "border-t border-border/60",
                      isCurrentModel && "bg-muted/20"
                    )}
                  >
                    <td className="px-2.5 py-1.5 align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1 text-[11.5px] font-medium text-foreground">
                          {model.name}
                          {model.requires === "api_key" ? (
                            <span
                              title="Requires an OpenAI API key. Not available on ChatGPT-plan Codex accounts — picking this model will fail with 'model not supported when using Codex with a ChatGPT account'."
                              className="inline-flex items-center rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-px text-[8.5px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
                            >
                              API key
                            </span>
                          ) : null}
                        </span>
                        {model.description ? (
                          <span className="max-w-[11rem] text-[9px] leading-3.5 text-muted-foreground">
                            {model.description}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-1 py-1 text-center align-middle">
                      <SelectionRadio
                        checked={isCurrentModel && !selectedEffortId}
                        label={`${model.name}, default effort`}
                        toneId={AUTO_EFFORT_ID}
                        onSelect={() => onSelect(model.id)}
                      />
                    </td>

                    {matrixEffortColumns.map((effort) => {
                      const available = modelEfforts.some(
                        (item) => item.id === effort.id
                      );
                      const checked =
                        isCurrentModel && selectedEffortId === effort.id;

                      return (
                        <td
                          key={`${model.id}:${effort.id}`}
                          className="px-1 py-1 text-center align-middle"
                        >
                          {available ? (
                            <SelectionRadio
                              checked={checked}
                              label={`${model.name}, ${effort.name}`}
                              toneId={effort.id}
                              onSelect={() => onSelect(model.id, effort.id)}
                            />
                          ) : (
                            <span className="text-muted-foreground/35">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-border/60 bg-muted/15 px-2.5 py-1.5 text-[8px] text-muted-foreground">
        Auto uses the model default. Radios only appear where that effort is
        supported.
      </div>
    </>
  );
}

export type RuntimeMode = "native" | "terminal";

export interface RuntimeMatrixValue {
  providerId?: string | null;
  model?: string | null;
  effort?: string | null;
  runtimeMode?: RuntimeMode | null;
}

interface RuntimeSelectionBannerProps {
  providers: ProviderInfo[];
  value: RuntimeMatrixValue;
  label?: string;
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * Colored summary row showing the currently selected provider/model/effort.
 * Same look used in the task composer dropdown, now reused in settings.
 */
export function RuntimeSelectionBanner({
  providers,
  value,
  label = "Selected Model",
  trailing,
  className,
}: RuntimeSelectionBannerProps) {
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

  const currentEffort = useMemo(
    () =>
      resolveProviderEffort(
        currentProvider,
        currentModel?.id,
        value.effort ?? undefined,
        undefined
      ),
    [currentModel?.id, currentProvider, value.effort]
  );

  const effortTone = getEffortTone(value.effort ?? AUTO_EFFORT_ID);
  const effortName =
    currentEffort?.name ||
    (value.effort ? formatEffortName(value.effort) : "Auto");
  const isTerminal = value.runtimeMode === "terminal";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-2",
        isTerminal ? "bg-zinc-900 text-zinc-100" : effortTone.bg,
        className
      )}
    >
      <span
        className={cn(
          "shrink-0 text-[9px] font-semibold uppercase tracking-wide",
          isTerminal ? "text-zinc-400" : "text-muted-foreground/60"
        )}
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {currentProvider ? (
          <>
            <div
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded border",
                isTerminal
                  ? "border-zinc-700 bg-zinc-800 text-zinc-300"
                  : "border-border/70 bg-background text-muted-foreground"
              )}
            >
              {isTerminal ? (
                <Terminal className="h-2.5 w-2.5" />
              ) : (
                <ProviderGlyph icon={currentProvider.icon} className="h-2.5 w-2.5" />
              )}
            </div>
            {isTerminal ? (
              <>
                <span className="truncate text-[11px] font-medium text-zinc-100">
                  Terminal
                </span>
                <span className="shrink-0 text-[9px] text-zinc-500">·</span>
                <span className="shrink-0 text-[10px] font-medium text-zinc-300">
                  {currentProvider.name}
                </span>
                <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                  PTY
                </span>
              </>
            ) : (
              <>
                <span className={cn("truncate text-[11px] font-medium", effortTone.header)}>
                  {currentModel?.name || currentProvider.name}
                </span>
                <span className="shrink-0 text-[9px] text-muted-foreground/50">·</span>
                <span className={cn("shrink-0 text-[9px] font-medium", effortTone.header)}>
                  {effortName}
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground">No provider selected</span>
        )}
      </div>
      {trailing}
    </div>
  );
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
}

/**
 * Inline provider/model/effort matrix — same UI the task composer runtime
 * picker renders inside its dropdown, but usable as an inline component.
 * Reused by Settings → Providers for default selection.
 */
export function RuntimeMatrixPicker({
  providers,
  value,
  onChange,
  includeUnavailable = false,
  showRuntimeModeToggle = false,
  className,
  emptyText = "No providers available.",
}: RuntimeMatrixPickerProps) {
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

  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);

  const readyProviderIds = useMemo(
    () =>
      new Set(
        selectableProviders
          .filter((provider) => isProviderReady(provider))
          .map((provider) => provider.id)
      ),
    [selectableProviders]
  );

  useEffect(() => {
    const requested = resolveSelectedProvider(
      selectableProviders,
      value.providerId ?? undefined,
      undefined
    );
    if (requested && readyProviderIds.has(requested.id)) {
      setActiveProviderId(requested.id);
      return;
    }
    const firstReady = selectableProviders.find((provider) =>
      readyProviderIds.has(provider.id)
    );
    setActiveProviderId(firstReady?.id ?? requested?.id ?? null);
  }, [readyProviderIds, selectableProviders, value.providerId]);

  const activeProviderIdValue = useMemo(() => {
    const explicit = resolveSelectedProvider(
      selectableProviders,
      activeProviderId || undefined,
      undefined
    );
    if (explicit && readyProviderIds.has(explicit.id)) return explicit.id;
    const requestedReady = value.providerId && readyProviderIds.has(value.providerId)
      ? value.providerId
      : null;
    if (requestedReady) return requestedReady;
    const firstReady = selectableProviders.find((provider) =>
      readyProviderIds.has(provider.id)
    );
    return firstReady?.id ?? explicit?.id;
  }, [activeProviderId, readyProviderIds, selectableProviders, value.providerId]);

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
      activeProviderIdValue ||
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

  return (
    <div className={cn("flex flex-col", className)}>
      {showRuntimeModeToggle && (
        <div
          role="tablist"
          aria-label="Runtime mode"
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
            title="Cabinet's native transcript — structured JSON stream, artifacts, summary, the full UX"
          >
            <Sparkles className="h-4 w-4" />
            <span>Native</span>
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
            title="Run the CLI in a live PTY terminal session (experimental hacker mode)"
          >
            <Terminal className="h-4 w-4" />
            <span>Terminal</span>
          </button>
        </div>
      )}

      {isTerminal ? (
        <TerminalProviderPanel
          providers={selectableProviders}
          readyProviderIds={readyProviderIds}
          selectedProviderId={value.providerId ?? activeProviderIdValue ?? null}
          onSelect={(providerId) =>
            onChange({ providerId, runtimeMode: "terminal" })
          }
        />
      ) : (
        <Tabs
          value={activeProviderIdValue}
          onValueChange={setActiveProviderId}
          className="gap-0"
        >
          <div className="overflow-hidden rounded-lg border border-border/70 bg-background">
            <div className="flex px-1.5 pt-1.5 overflow-x-auto scrollbar-none">
              <TabsList
                variant="line"
                aria-label="Providers"
                className="h-auto w-max min-w-full justify-start gap-1.5 rounded-none bg-transparent p-0 !border-b-0"
              >
                {selectableProviders.map((provider) => {
                  const ready = readyProviderIds.has(provider.id);
                  const isActive = activeProviderIdValue === provider.id;
                  const unreadyReason = describeProviderUnreadyReason(provider);
                  return (
                    <TabsTrigger
                      key={provider.id}
                      value={provider.id}
                      disabled={!ready}
                      aria-disabled={!ready}
                      title={
                        ready
                          ? provider.name
                          : `${provider.name} — ${unreadyReason || "Not available"}`
                      }
                      className={cn(
                        "relative -mb-px flex h-7 flex-none items-center gap-1.5 rounded-t-md rounded-b-none border-0 !bg-muted/60 py-1 text-[9px] font-medium text-muted-foreground shadow-none after:hidden data-active:z-10 data-active:!bg-background data-active:text-foreground data-active:shadow-none",
                        // Active tabs widen to show icon + name; inactive
                        // collapse to icon-only so all 8 providers fit without
                        // horizontal scroll. Name still available via title.
                        isActive ? "px-2.5" : "justify-center px-1.5",
                        ready
                          ? "hover:text-foreground"
                          : "cursor-not-allowed opacity-50 grayscale data-[disabled]:pointer-events-none"
                      )}
                    >
                      <ProviderGlyph icon={provider.icon} className="h-3 w-3" />
                      {isActive && <span>{provider.name}</span>}
                      {isActive && !ready && (
                        <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                          Not ready
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {selectableProviders.map((provider) => (
              <TabsContent
                key={provider.id}
                value={provider.id}
                className="mt-0 bg-background"
              >
                <ProviderRuntimeMatrix
                  provider={provider}
                  currentProviderId={currentProvider?.id}
                  currentModelId={currentModel?.id}
                  selectedEffortId={value.effort ?? undefined}
                  onSelect={(modelId, effortId) =>
                    onChange({
                      providerId: provider.id,
                      model: modelId,
                      effort: effortId,
                      runtimeMode: "native",
                    })
                  }
                />
              </TabsContent>
            ))}
          </div>
        </Tabs>
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
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[10px] font-medium text-zinc-300">
        <Terminal className="size-3 text-emerald-400" />
        <span>Pick a CLI to spawn in a PTY:</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3">
        {providers.map((provider) => {
          const ready = readyProviderIds.has(provider.id);
          const unreadyReason = describeProviderUnreadyReason(provider);
          const selected = ready && selectedProviderId === provider.id;
          const statusLabel = ready
            ? "Ready"
            : provider.available
              ? "Log in"
              : "Not installed";
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
                  ? `Click to launch ${provider.name} in a PTY terminal`
                  : `${provider.name} — ${unreadyReason || "Not available"}`
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
            Cabinet still writes to your KB — the agent uses its own tools.
            What you lose is the structured UI layer: no artifact extraction
            from the stream, no live summaries, no &quot;what happened&quot;
            panels. You&apos;re watching the raw CLI. Think of it as running
            your own tmux inside Cabinet — for hackers who want to drive the
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
          </a>{" "}
          — happy to help wire up stream-parsing + session resume for it.
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
}: {
  value: TaskRuntimeSelection;
  onChange: (value: TaskRuntimeSelection) => void;
  align?: "start" | "center" | "end";
  className?: string;
}) {
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

  const selectionSummary = currentProvider
    ? [
        currentModel?.name || currentProvider.name,
        currentEffort?.name ||
          (normalizedValue.effort
            ? formatEffortName(normalizedValue.effort)
            : "Default"),
        currentProvider.name,
      ]
        .filter(Boolean)
        .join(" · ")
    : loading
      ? "Loading providers..."
      : "No providers available";

  const triggerTitle = currentProvider
    ? `Task model: ${selectionSummary}`
    : loading
      ? "Loading available providers…"
      : "Task model — using system default (click to pick)";

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
          "inline-flex h-8 items-center gap-1 rounded-md border px-2 transition-colors disabled:pointer-events-none disabled:opacity-50",
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
              <span className="text-[11px] font-medium text-zinc-100">
                {currentProvider.name}
              </span>
              <span className="text-[9px] text-zinc-500">·</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                Terminal
              </span>
            </>
          ) : (
            <>
              <div className="flex size-4 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/30">
                <ProviderGlyph icon={currentProvider.icon} className="h-2.5 w-2.5" />
              </div>
              <span className={cn("text-[11px] font-medium", getEffortTone(normalizedValue.effort ?? AUTO_EFFORT_ID).header)}>
                {currentModel?.name || currentProvider.name}
              </span>
              <span className="text-[9px] text-muted-foreground/40">·</span>
              <span className={cn("text-[9px] font-medium", getEffortTone(normalizedValue.effort ?? AUTO_EFFORT_ID).header)}>
                {currentEffort?.name || (normalizedValue.effort ? formatEffortName(normalizedValue.effort) : "Auto")}
              </span>
            </>
          )
        ) : loading ? (
          <BrainCircuit className="h-4 w-4 opacity-50" />
        ) : (
          <>
            <BrainCircuit className="h-4 w-4" />
            <span className="text-[11px] font-medium">Auto</span>
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        className="w-[min(32rem,calc(100vw-1rem))] min-w-[17rem] max-w-[calc(100vw-1rem)] p-0"
      >
        <DropdownMenuGroup>
          <RuntimeSelectionBanner
            providers={providers}
            value={{
              providerId: normalizedValue.providerId,
              model: normalizedValue.model,
              effort: normalizedValue.effort,
            }}
            className="mx-1.5 mt-1.5"
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
                  appDefaultModelInfo?.name || "Default model",
                  appDefaultSelection.effort
                    ? formatEffortName(appDefaultSelection.effort)
                    : "Auto",
                  appDefaultProvider?.name || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                {sameSelection(normalizedValue, appDefaultSelection)
                  ? "App default"
                  : "Select app default"}
              </button>
            }
          />
        </DropdownMenuGroup>

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
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
