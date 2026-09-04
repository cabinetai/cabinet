import type {
  ProviderEffortLevel,
  ProviderInfo,
  ProviderModel,
} from "@/types/agents";

function matchesId<T extends { id: string }>(
  values: T[] | undefined,
  id?: string | null
): T | undefined {
  if (!id) return undefined;
  return values?.find((value) => value.id === id);
}

export function resolveProviderModel(
  provider: ProviderInfo | undefined,
  requestedModel?: string | null,
  fallbackModel?: string | null
): ProviderModel | undefined {
  const models = provider?.models || [];

  const direct =
    matchesId(models, requestedModel) || matchesId(models, fallbackModel);
  if (direct) return direct;

  // With no models at all there is nothing to resolve or preserve — return
  // undefined regardless of the dynamic flag so callers don't fabricate a
  // selection for a provider that exposes none.
  if (models.length === 0) return undefined;

  // Dynamic-discovery providers (e.g. OpenCode) ship only an offline fallback
  // list until the client hydrates the real, entitlement-gated set. During
  // that async window a saved id like `opencode/minimax-m2.5-free` won't be in
  // the fallback — preserve it as a synthetic entry instead of snapping to
  // `models[0]`, which `normalizeSelection` would then persist, silently
  // clobbering the user's selection. After hydration the real model wins.
  if (provider?.dynamicModels && !provider.modelsHydrated) {
    const preserved = requestedModel || fallbackModel;
    if (preserved) return { id: preserved, name: preserved };
  }

  return models[0];
}

export function getModelEffortLevels(
  provider: ProviderInfo | undefined,
  modelId?: string | null
): ProviderEffortLevel[] {
  if (!provider) return [];

  const model = matchesId(provider.models, modelId);
  if (model && "effortLevels" in model) {
    return model.effortLevels || [];
  }

  return provider.effortLevels || [];
}

export function resolveProviderEffort(
  provider: ProviderInfo | undefined,
  modelId?: string | null,
  requestedEffort?: string | null,
  fallbackEffort?: string | null
): ProviderEffortLevel | undefined {
  const effortLevels = getModelEffortLevels(provider, modelId);
  if (effortLevels.length === 0) return undefined;

  return (
    matchesId(effortLevels, requestedEffort) ||
    matchesId(effortLevels, fallbackEffort) ||
    undefined
  );
}

export function getSuggestedProviderEffort(
  provider: ProviderInfo | undefined,
  modelId?: string | null
): ProviderEffortLevel | undefined {
  const effortLevels = getModelEffortLevels(provider, modelId);
  if (effortLevels.length === 0) return undefined;

  return (
    matchesId(effortLevels, "medium") ||
    matchesId(effortLevels, "high") ||
    matchesId(effortLevels, "low") ||
    matchesId(effortLevels, "minimal") ||
    effortLevels[Math.floor((effortLevels.length - 1) / 2)] ||
    effortLevels[0]
  );
}

export function formatEffortName(value?: string | null): string | null {
  if (!value) return null;

  switch (value.trim().toLowerCase()) {
    case "xhigh":
      return "Extra High";
    case "max":
      return "Max";
    case "none":
      return "None";
    default:
      return value
        .trim()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
  }
}
