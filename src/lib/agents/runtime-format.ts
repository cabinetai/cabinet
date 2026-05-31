import { formatEffortName } from "./runtime-options";

/**
 * Minimal shape shared by `TaskMeta` and `ConversationMeta` — enough to derive
 * the human-readable runtime label without coupling to either type.
 */
export type RuntimeMetaLike = {
  adapterConfig?: Record<string, unknown> | null;
  providerId?: string | null;
};

function readModel(config?: Record<string, unknown> | null): string | null {
  if (!config || typeof config !== "object") return null;
  const model = (config as { model?: unknown }).model;
  return typeof model === "string" && model.trim() ? model.trim() : null;
}

/** Returns the *formatted* effort name (e.g. "High"), not the raw config value. */
function readEffort(config?: Record<string, unknown> | null): string | null {
  if (!config || typeof config !== "object") return null;
  const cfg = config as { effort?: unknown; reasoningEffort?: unknown };
  const raw =
    typeof cfg.effort === "string" && cfg.effort.trim()
      ? cfg.effort
      : typeof cfg.reasoningEffort === "string" && cfg.reasoningEffort.trim()
        ? cfg.reasoningEffort
        : null;
  return raw ? formatEffortName(raw) : null;
}

export function formatProviderLabel(providerId?: string | null): string | null {
  if (!providerId) return null;

  return providerId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => {
      const upper = segment.toUpperCase();
      if (upper === "API" || upper === "CLI") return upper;
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(" ");
}

/**
 * Builds the "model · Provider · Effort" runtime label shown in task chrome.
 * Returns `null` when nothing is known so callers can choose their own
 * fallback. Used by both the full-page header and the compact drawer so they
 * read identically.
 */
export function buildRuntimeLabel(meta: RuntimeMetaLike): string | null {
  const model = readModel(meta.adapterConfig);
  const effort = readEffort(meta.adapterConfig);
  const provider = formatProviderLabel(meta.providerId);

  if (model && provider && effort) return `${model} · ${provider} · ${effort}`;
  if (model && provider) return `${model} · ${provider}`;
  if (model && effort) return `${model} · ${effort}`;
  if (model) return model;
  if (provider && effort) return `${provider} · ${effort}`;
  if (provider) return `${provider} · default model`;
  return null;
}
