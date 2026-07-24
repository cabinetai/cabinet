import type { AgentProvider, ProviderRegistry, ProviderModel } from "./provider-interface";
import { claudeCodeProvider } from "./providers/claude-code";
import { codexCliProvider } from "./providers/codex-cli";
import { copilotCliProvider } from "./providers/copilot-cli";
import { cursorCliProvider } from "./providers/cursor-cli";
import { geminiCliProvider } from "./providers/gemini-cli";
import { grokCliProvider } from "./providers/grok-cli";
import { openCodeProvider } from "./providers/opencode";
import { piProvider } from "./providers/pi";

class ProviderRegistryImpl implements ProviderRegistry {
  providers = new Map<string, AgentProvider>();
  defaultProvider = "claude-code";
  #modelsCache = new Map<string, { models: ProviderModel[]; fetchedAt: number }>();
  readonly #CACHE_TTL = 60_000;

  register(provider: AgentProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): AgentProvider | undefined {
    return this.providers.get(id);
  }

  getDefault(): AgentProvider | undefined {
    return this.providers.get(this.defaultProvider);
  }

  listAll(): AgentProvider[] {
    return Array.from(this.providers.values());
  }

  async listAvailable(): Promise<AgentProvider[]> {
    const results: AgentProvider[] = [];
    for (const provider of this.providers.values()) {
      if (await provider.isAvailable()) {
        results.push(provider);
      }
    }
    return results;
  }

  /**
   * Get models for a provider, preferring the cached dynamic list over the
   * static fallback. This ensures lookups (e.g. contextWindow resolution)
   * find models discovered via `listModels()` even when their IDs differ
   * from the static fallback list.
   */
  getProviderModels(providerId: string): ProviderModel[] {
    const cached = this.#modelsCache.get(providerId);
    if (cached && Date.now() - cached.fetchedAt < this.#CACHE_TTL) {
      return cached.models;
    }
    return this.providers.get(providerId)?.models ?? [];
  }

  /** Cache dynamic models from a provider's `listModels()` response. */
  setProviderModelsCache(providerId: string, models: ProviderModel[]): void {
    this.#modelsCache.set(providerId, { models, fetchedAt: Date.now() });
  }
}

// Singleton registry
export const providerRegistry = new ProviderRegistryImpl();

// Register built-in providers
providerRegistry.register(claudeCodeProvider);
providerRegistry.register(codexCliProvider);
providerRegistry.register(geminiCliProvider);
providerRegistry.register(cursorCliProvider);
providerRegistry.register(openCodeProvider);
providerRegistry.register(piProvider);
providerRegistry.register(grokCliProvider);
providerRegistry.register(copilotCliProvider);

// Future providers will be registered here:
// providerRegistry.register(anthropicApiProvider);

/**
 * Does `providerId` advertise support for the given effort id?
 *
 * Used by the dispatcher to decide whether the parent's `effort` can travel
 * across providers when a child's resolved provider differs. Unknown provider
 * or missing effort list → `false` (safe drop rather than pass through junk).
 */
export function providerSupportsEffort(
  providerId: string | undefined,
  effort: string | undefined
): boolean {
  if (!providerId || !effort) return false;
  const provider = providerRegistry.get(providerId);
  if (!provider) return false;
  const levels = provider.effortLevels;
  if (!levels || levels.length === 0) return false;
  return levels.some((level) => level.id === effort);
}
