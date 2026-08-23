/**
 * Shared filters for deciding which providers surface where in the UI.
 *
 * Provider surfaces should select providers with registered adapters rather
 * than branching on whether the adapter launches a CLI or calls an API.
 */

export interface ProviderSelectionInfo {
  defaultAdapterType?: string;
  adapters?: ReadonlyArray<{ type: string }>;
}

/**
 * Whether a provider has a registered execution adapter and can be shown in
 * user-facing runtime surfaces. Availability and authentication are separate
 * concerns handled by each surface.
 */
export function isAgentProviderSelectable(provider: ProviderSelectionInfo): boolean {
  if (!provider.defaultAdapterType || !provider.adapters) return false;
  return provider.adapters.some((adapter) => adapter.type === provider.defaultAdapterType);
}
