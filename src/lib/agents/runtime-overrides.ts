import {
  defaultAdapterTypeForProvider,
  LEGACY_ADAPTER_BY_PROVIDER_ID,
} from "@/lib/agents/adapters";

/**
 * Shape of the per-request runtime override posted by the various composers
 * (cabinet home, tasks board new-task dialog, task-detail continue composer,
 * agents workspace, AI panel, status-bar pill). Every field is optional; when
 * omitted, the runner falls back to the conversation's stored meta / the
 * agent's default.
 */
export interface RequestedRuntimeOverride {
  providerId?: string;
  adapterType?: string;
  model?: string;
  effort?: string;
  runtimeMode?: "native" | "terminal";
}

/**
 * The fallback ("inherit") source of truth when the caller didn't explicitly
 * provide providerId / adapterType / adapterConfig. For new-task creates this
 * is the prompt-builder's output (agent's default); for continue-turns it's
 * the conversation's existing meta.
 */
export interface RuntimeOverrideFallback {
  providerId?: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
}

export interface NormalizedRuntime {
  providerId?: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  /** True when the caller explicitly asked for terminal-mode (PTY) routing. */
  isTerminal: boolean;
}

/**
 * Centralize the translation from a per-request runtime override + fallback
 * defaults into the triple the runner actually consumes: `providerId`,
 * `adapterType`, `adapterConfig`.
 *
 * Rules:
 *   1. providerId: request wins, else fallback.
 *   2. adapterType: request wins. If only providerId was given, derive the
 *      provider's default adapter. Otherwise fallback.
 *   3. Terminal mode: when runtimeMode === "terminal", force the adapterType
 *      to the provider's legacy PTY adapter. Model/effort are dropped in
 *      this mode — PTY runs use the CLI's own defaults and carrying
 *      model/effort into `adapterConfig` leaks stale values into meta.json.
 *   4. adapterConfig: start from fallback (inherit prior config), overlay
 *      any explicit model/effort from the request. Cleared when terminal.
 *
 * Prior to this helper, the new-task POST handler and the continue POST
 * handler implemented these rules independently and drifted — the new-task
 * path never stripped model/effort in terminal mode, so `adapterConfig`
 * carried stale fields that bled into meta.json and re-runs.
 */
export function normalizeRuntimeOverride(
  requested: RequestedRuntimeOverride,
  fallback: RuntimeOverrideFallback
): NormalizedRuntime {
  const requestedProviderId =
    typeof requested.providerId === "string" && requested.providerId.trim()
      ? requested.providerId.trim()
      : undefined;
  const requestedAdapterType =
    typeof requested.adapterType === "string" && requested.adapterType.trim()
      ? requested.adapterType.trim()
      : undefined;
  const requestedModel =
    typeof requested.model === "string" && requested.model.trim()
      ? requested.model.trim()
      : undefined;
  const requestedEffort =
    typeof requested.effort === "string" && requested.effort.trim()
      ? requested.effort.trim()
      : undefined;
  const isTerminal = requested.runtimeMode === "terminal";

  const providerId = requestedProviderId ?? fallback.providerId;

  let adapterType =
    requestedAdapterType ??
    (requestedProviderId
      ? defaultAdapterTypeForProvider(requestedProviderId)
      : fallback.adapterType);

  // Terminal mode: swap to the provider's legacy PTY adapter so the run
  // streams live through the xterm view. If no legacy adapter is registered
  // for this provider, fall through to whatever was resolved above.
  if (isTerminal && providerId) {
    const legacy = LEGACY_ADAPTER_BY_PROVIDER_ID[providerId];
    if (legacy) adapterType = legacy;
  }

  // Build adapterConfig. Inherit from fallback only when the caller didn't
  // switch providers (switching providers invalidates prior config), overlay
  // explicit model/effort. In terminal mode, drop model/effort entirely —
  // the CLI uses its own defaults and stored values just mislead the UI.
  const inheritBase =
    requestedProviderId && requestedProviderId !== fallback.providerId
      ? {}
      : { ...(fallback.adapterConfig ?? {}) };

  if (isTerminal) {
    // Strip native-mode fields that PTY adapters ignore. Keep any other
    // caller-set keys (e.g. skills, tool allowlists) that flow through.
    delete inheritBase.model;
    delete inheritBase.effort;
  } else {
    if (requestedModel) inheritBase.model = requestedModel;
    if (requestedEffort) inheritBase.effort = requestedEffort;
  }

  const adapterConfig =
    Object.keys(inheritBase).length > 0 ? inheritBase : undefined;

  return { providerId, adapterType, adapterConfig, isTerminal };
}
