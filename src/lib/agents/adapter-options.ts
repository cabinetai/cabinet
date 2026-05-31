import type { ProviderInfo } from "@/types/agents";

type ProviderAdapterInfo = NonNullable<ProviderInfo["adapters"]>[number];

export function getProviderInfo(
  providers: ProviderInfo[],
  providerId?: string | null,
  fallbackProviderId?: string | null
): ProviderInfo | undefined {
  const resolvedProviderId = providerId || fallbackProviderId || null;
  if (!resolvedProviderId) return undefined;
  return providers.find((provider) => provider.id === resolvedProviderId);
}

export function getAdapterOptionsForProvider(
  providers: ProviderInfo[],
  providerId?: string | null,
  fallbackProviderId?: string | null
): ProviderAdapterInfo[] {
  return getProviderInfo(providers, providerId, fallbackProviderId)?.adapters || [];
}

export function getDefaultAdapterTypeForProviderInfo(
  providers: ProviderInfo[],
  providerId?: string | null,
  fallbackProviderId?: string | null
): string | undefined {
  const provider = getProviderInfo(providers, providerId, fallbackProviderId);
  return provider?.defaultAdapterType || provider?.adapters?.[0]?.type;
}

export function resolveAdapterTypeForProvider(
  providers: ProviderInfo[],
  providerId?: string | null,
  adapterType?: string | null,
  fallbackProviderId?: string | null
): string | undefined {
  const adapterOptions = getAdapterOptionsForProvider(
    providers,
    providerId,
    fallbackProviderId
  );

  if (
    adapterType &&
    adapterOptions.some((option) => option.type === adapterType)
  ) {
    return adapterType;
  }

  return (
    getDefaultAdapterTypeForProviderInfo(
      providers,
      providerId,
      fallbackProviderId
    ) || adapterType || undefined
  );
}

export function formatAdapterOptionLabel(
  adapter: ProviderAdapterInfo
): string {
  return adapter.experimental
    ? `${adapter.name} (Experimental)`
    : adapter.name;
}
