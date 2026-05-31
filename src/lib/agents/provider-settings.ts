import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { providerRegistry } from "./provider-registry";

const CONFIG_DIR = path.join(DATA_DIR, ".agents", ".config");
const PROVIDERS_FILE = path.join(CONFIG_DIR, "providers.json");

export interface ProviderSettings {
  defaultProvider: string;
  defaultModel?: string;
  defaultEffort?: string;
  disabledProviderIds: string[];
}

function knownProviderIds(): string[] {
  return providerRegistry.listAll().map((provider) => provider.id);
}

export function normalizeProviderSettings(raw: unknown): ProviderSettings {
  const knownIds = new Set(knownProviderIds());
  const fallbackDefault = providerRegistry.defaultProvider;
  const object = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const disabledProviderIds = Array.isArray(object.disabledProviderIds)
    ? object.disabledProviderIds.filter(
        (value): value is string => typeof value === "string" && knownIds.has(value)
      )
    : [];
  const enabledIds = knownProviderIds().filter((id) => !disabledProviderIds.includes(id));
  const requestedDefault =
    typeof object.defaultProvider === "string" && knownIds.has(object.defaultProvider)
      ? object.defaultProvider
      : fallbackDefault;
  const defaultProvider =
    enabledIds.includes(requestedDefault)
      ? requestedDefault
      : enabledIds.includes(fallbackDefault)
        ? fallbackDefault
        : enabledIds[0] || fallbackDefault;

  const defaultModel =
    typeof object.defaultModel === "string" && object.defaultModel.trim()
      ? object.defaultModel.trim()
      : undefined;

  const defaultEffort =
    typeof object.defaultEffort === "string" && object.defaultEffort.trim()
      ? object.defaultEffort.trim()
      : undefined;

  return {
    defaultProvider,
    defaultModel,
    defaultEffort,
    disabledProviderIds,
  };
}

export function readProviderSettingsSync(): ProviderSettings {
  try {
    const raw = fs.readFileSync(PROVIDERS_FILE, "utf8");
    return normalizeProviderSettings(JSON.parse(raw));
  } catch {
    return normalizeProviderSettings(null);
  }
}

export async function readProviderSettings(): Promise<ProviderSettings> {
  try {
    const raw = await fsp.readFile(PROVIDERS_FILE, "utf8");
    return normalizeProviderSettings(JSON.parse(raw));
  } catch {
    return normalizeProviderSettings(null);
  }
}

export async function writeProviderSettings(input: ProviderSettings): Promise<ProviderSettings> {
  const normalized = normalizeProviderSettings(input);
  await fsp.mkdir(CONFIG_DIR, { recursive: true });
  await fsp.writeFile(PROVIDERS_FILE, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export function isProviderEnabled(providerId: string, settings?: ProviderSettings): boolean {
  const resolved = settings || readProviderSettingsSync();
  return !resolved.disabledProviderIds.includes(providerId);
}

export function getConfiguredDefaultProviderId(settings?: ProviderSettings): string {
  return (settings || readProviderSettingsSync()).defaultProvider;
}

export function resolveEnabledProviderId(
  providerId?: string,
  settings?: ProviderSettings
): string {
  const resolvedSettings = settings || readProviderSettingsSync();
  if (
    providerId &&
    providerRegistry.get(providerId) &&
    isProviderEnabled(providerId, resolvedSettings)
  ) {
    return providerId;
  }

  const defaultProviderId = getConfiguredDefaultProviderId(resolvedSettings);
  if (
    defaultProviderId &&
    providerRegistry.get(defaultProviderId) &&
    isProviderEnabled(defaultProviderId, resolvedSettings)
  ) {
    return defaultProviderId;
  }

  const firstEnabledProvider = providerRegistry.listAll().find((provider) =>
    isProviderEnabled(provider.id, resolvedSettings)
  );
  if (firstEnabledProvider) {
    return firstEnabledProvider.id;
  }

  return defaultProviderId || providerRegistry.defaultProvider;
}
