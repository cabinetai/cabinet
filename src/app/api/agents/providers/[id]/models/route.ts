import { NextResponse } from "next/server";
import { providerRegistry } from "@/lib/agents/provider-registry";
import type { ProviderModel } from "@/lib/agents/provider-interface";

interface CachedModels {
  models: ProviderModel[];
  fetchedAt: number;
  // true = the list came from the provider's live `listModels()`; false = the
  // CLI couldn't be queried and we returned the offline static fallback. The
  // picker uses this to show a "configure + Refresh" hint and to decide
  // whether the resolver may treat the list as authoritative.
  dynamic: boolean;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CachedModels>();

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const provider = providerRegistry.get(id);
  if (!provider) {
    return NextResponse.json({ error: `Unknown provider: ${id}` }, { status: 404 });
  }

  // `?refresh=1` bypasses the cache. opencode's own env/auth gating is live
  // (add a key, re-run, the models appear) so the only staleness is *this*
  // 60s cache — refresh lets a freshly-added key surface in seconds.
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";

  const now = Date.now();
  const cached = cache.get(id);
  if (!refresh && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      providerId: id,
      models: cached.models,
      cached: true,
      ageMs: now - cached.fetchedAt,
      dynamic: cached.dynamic,
    });
  }

  let models: ProviderModel[];
  let dynamic = false;
  if (provider.listModels) {
    try {
      // listModels now throws on a genuine CLI failure (not installed /
      // not runnable); the fallback lives here so `dynamic` honestly
      // reflects whether the user is seeing their real model list.
      models = await provider.listModels();
      dynamic = true;
    } catch {
      models = provider.models || [];
    }
  } else {
    models = provider.models || [];
  }

  cache.set(id, { models, fetchedAt: now, dynamic });

  return NextResponse.json({
    providerId: id,
    models,
    cached: false,
    dynamic,
    ttlMs: CACHE_TTL_MS,
  });
}
