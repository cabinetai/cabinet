import { NextResponse } from "next/server";
import {
  agentAdapterRegistry,
  defaultAdapterTypeForProvider,
} from "@/lib/agents/adapters";
import { providerRegistry } from "@/lib/agents/provider-registry";
import {
  getConfiguredDefaultProviderId,
  isProviderEnabled,
  readProviderSettings,
} from "@/lib/agents/provider-settings";
import {
  ProviderSettingsConflictError,
  getProviderUsage,
  updateProviderSettingsWithMigrations,
} from "@/lib/agents/provider-management";

// Short in-memory cache: the GET response is driven by spawning 8 CLI probes,
// and the page fires this endpoint on every mount. Cache shared across requests.
const RESPONSE_TTL_MS = 15_000;
let cachedResponse: { body: unknown; expiresAt: number } | null = null;
let inflightBuild: Promise<unknown> | null = null;

async function buildResponse() {
  const providers = providerRegistry.listAll();
  const settings = await readProviderSettings();
  const usage = await getProviderUsage();

  const results = await Promise.all(
      providers.map(async (p) => {
        const status = await p.healthCheck();
        const defaultAdapterType = defaultAdapterTypeForProvider(p.id);
        const adapters = agentAdapterRegistry
          .listAll()
          .filter((adapter) => adapter.providerId === p.id)
          .sort((left, right) => {
            const leftDefault = left.type === defaultAdapterType ? 0 : 1;
            const rightDefault = right.type === defaultAdapterType ? 0 : 1;
            if (leftDefault !== rightDefault) {
              return leftDefault - rightDefault;
            }

            const leftExperimental = left.experimental ? 1 : 0;
            const rightExperimental = right.experimental ? 1 : 0;
            if (leftExperimental !== rightExperimental) {
              return leftExperimental - rightExperimental;
            }

            return left.name.localeCompare(right.name);
          })
          .map((adapter) => ({
            type: adapter.type,
            name: adapter.name,
            description: adapter.description,
            experimental: adapter.experimental,
            executionEngine: adapter.executionEngine,
            supportsDetachedRuns: adapter.supportsDetachedRuns,
            supportsSessionResume: adapter.supportsSessionResume,
          }));

        return {
          id: p.id,
          name: p.name,
          type: p.type,
          icon: p.icon,
          iconAsset: p.iconAsset,
          installMessage: p.installMessage,
          installSteps: p.installSteps,
          models: p.models || [],
          effortLevels: p.effortLevels || [],
          // Capability flag so UIs switch on a trait, not a hardcoded id list
          // (§13 invariant). When true the `models` above are only an offline
          // fallback — the real, entitlement-gated set comes from
          // GET /api/agents/providers/:id/models.
          dynamicModels: typeof p.listModels === "function",
          defaultAdapterType,
          adapters,
          supportsTerminalResume: p.supportsTerminalResume === true,
          enabled: isProviderEnabled(p.id, settings),
          usage: usage[p.id] || {
            agentSlugs: [],
            jobs: [],
            agentCount: 0,
            jobCount: 0,
            totalCount: 0,
          },
          ...status,
        };
      })
    );

  return {
    providers: results,
    defaultProvider: getConfiguredDefaultProviderId(settings),
    defaultModel: settings.defaultModel || null,
    defaultEffort: settings.defaultEffort || null,
  };
}

export async function GET(req: Request) {
  try {
    const now = Date.now();
    // `?refresh=1` bypasses the cache — used right after a provider is installed
    // or signed in so the Settings list reflects it immediately.
    const fresh = new URL(req.url).searchParams.get("refresh") === "1";
    if (!fresh && cachedResponse && cachedResponse.expiresAt > now) {
      return NextResponse.json(cachedResponse.body);
    }
    if (fresh) cachedResponse = null;
    if (!inflightBuild) {
      inflightBuild = buildResponse().finally(() => {
        inflightBuild = null;
      });
    }
    const body = await inflightBuild;
    cachedResponse = { body, expiresAt: Date.now() + RESPONSE_TTL_MS };
    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    cachedResponse = null;
    const body = await req.json();
    const result = await updateProviderSettingsWithMigrations({
      defaultProvider:
        typeof body.defaultProvider === "string"
          ? body.defaultProvider
          : providerRegistry.defaultProvider,
      defaultModel:
        typeof body.defaultModel === "string"
          ? body.defaultModel
          : undefined,
      defaultEffort:
        typeof body.defaultEffort === "string"
          ? body.defaultEffort
          : undefined,
      disabledProviderIds: Array.isArray(body.disabledProviderIds)
        ? body.disabledProviderIds.filter((value: unknown): value is string => typeof value === "string")
        : [],
      migrations: Array.isArray(body.migrations)
        ? body.migrations.flatMap((value: unknown) => {
            if (!value || typeof value !== "object") return [];
            const migration = value as Record<string, unknown>;
            if (
              typeof migration.fromProviderId !== "string" ||
              typeof migration.toProviderId !== "string"
            ) {
              return [];
            }
            return [{
              fromProviderId: migration.fromProviderId,
              toProviderId: migration.toProviderId,
            }];
          })
        : [],
    });

    return NextResponse.json({
      ok: true,
      settings: result.settings,
      usage: result.usage,
      migrationsApplied: result.migrationsApplied,
    });
  } catch (error) {
    if (error instanceof ProviderSettingsConflictError) {
      return NextResponse.json({
        error: error.message,
        conflicts: error.conflicts,
      }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
