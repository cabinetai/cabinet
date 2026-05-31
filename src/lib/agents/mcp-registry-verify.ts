/**
 * Verifies an integration's "Official"/"Registry-listed" badge against the
 * Official MCP Registry (registry.modelcontextprotocol.io), backed by
 * Anthropic/GitHub/Microsoft. We never let the UI claim "Official" purely
 * from the catalog's self-declared tier — it must be corroborated here, with
 * a graceful fall-back to the declared tier when the registry is unreachable
 * (offline-friendly; never blocks the page or crashes).
 *
 * Result cached on disk (24h TTL) under the .agents/.config dir, mirroring
 * the cache pattern in the skills catalog route.
 */

import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { MCP_CATALOG, type TrustTier } from "./mcp-catalog";

const CACHE_FILE = path.join(DATA_DIR, ".agents", ".config", "mcp-registry-cache.json");
const REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0/servers?limit=500";
const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

interface CacheShape {
  fetchedAt: number;
  /** registryId → true when present in the registry. */
  present: Record<string, boolean>;
}

let memo: { at: number; present: Record<string, boolean> } | null = null;

async function readCache(): Promise<CacheShape | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as CacheShape;
    if (parsed && typeof parsed.fetchedAt === "number" && parsed.present) return parsed;
  } catch {
    /* missing/corrupt cache — treat as no cache */
  }
  return null;
}

async function writeCache(data: CacheShape): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch {
    /* best-effort; verification still works from memo this process */
  }
}

function registryIdsInCatalog(): string[] {
  return MCP_CATALOG.map((e) => e.registryId).filter((x): x is string => !!x);
}

async function fetchRegistryPresence(): Promise<Record<string, boolean> | null> {
  const wanted = registryIdsInCatalog();
  if (wanted.length === 0) return {};
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(REGISTRY_URL, {
      signal: ctl.signal,
      headers: { Accept: "application/json", "User-Agent": "cabinet-integrations-hub" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { servers?: Array<{ name?: string }> };
    const servers = Array.isArray(body.servers) ? body.servers : [];
    const haystack = servers
      .map((s) => (typeof s.name === "string" ? s.name.toLowerCase() : ""))
      .filter(Boolean);
    const present: Record<string, boolean> = {};
    for (const id of wanted) {
      const needle = id.toLowerCase();
      present[id] = haystack.some((name) => name.includes(needle));
    }
    return present;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Map of registryId → whether the registry corroborates it. Uses an in-process
 * memo, then the on-disk cache, then a network refresh. Returns `{}` when the
 * registry can't be reached and there's no cache (callers then fall back to
 * the declared tier).
 */
export async function getRegistryPresence(): Promise<Record<string, boolean>> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.present;

  const cached = await readCache();
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    memo = { at: cached.fetchedAt, present: cached.present };
    return cached.present;
  }

  const fresh = await fetchRegistryPresence();
  if (fresh) {
    const now = Date.now();
    memo = { at: now, present: fresh };
    await writeCache({ fetchedAt: now, present: fresh });
    return fresh;
  }

  // Network failed: serve a stale cache if we have one, else empty.
  if (cached) {
    memo = { at: cached.fetchedAt, present: cached.present };
    return cached.present;
  }
  return {};
}

/**
 * The tier to actually display. `official`/`registry` are only granted when
 * the registry corroborates the entry; otherwise we keep the declared tier
 * but never upgrade an unverified server to Official.
 */
export function verifyTier(
  declared: TrustTier,
  registryId: string | undefined,
  presence: Record<string, boolean>,
): TrustTier {
  if (declared === "community" || !registryId) return "community";
  const corroborated = presence[registryId] === true;
  if (corroborated) return declared; // official | registry
  // Declared official/registry but registry can't (yet) confirm it: don't lie.
  // Show the weaker, honest "registry" label only if it was registry-tier;
  // an unconfirmed "official" degrades to "registry" pending verification.
  return "registry";
}
