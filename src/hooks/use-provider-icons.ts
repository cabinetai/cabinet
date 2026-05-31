"use client";

import { useEffect, useState } from "react";
import { dedupFetch } from "@/lib/api/dedup-fetch";

interface ProviderIconInfo {
  id: string;
  name: string;
  icon?: string;
  iconAsset?: string;
}

// Module-level cache — one fetch across the whole app (the API's 8 providers
// are static and the icon payload is tiny). Refreshes on the next mount after
// `invalidateProviderIconCache()`.
let cache: Map<string, ProviderIconInfo> | null = null;
let inflight: Promise<Map<string, ProviderIconInfo>> | null = null;
const listeners = new Set<(m: Map<string, ProviderIconInfo>) => void>();

async function fetchProviderIcons(): Promise<Map<string, ProviderIconInfo>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await dedupFetch("/api/agents/providers", { cache: "no-store" });
      if (!res.ok) {
        inflight = null;
        return new Map();
      }
      const data = (await res.json()) as {
        providers?: Array<{
          id: string;
          name: string;
          icon?: string;
          iconAsset?: string;
        }>;
      };
      const map = new Map<string, ProviderIconInfo>();
      for (const p of data.providers ?? []) {
        map.set(p.id, {
          id: p.id,
          name: p.name,
          icon: p.icon,
          iconAsset: p.iconAsset,
        });
      }
      cache = map;
      inflight = null;
      for (const listener of listeners) listener(map);
      return map;
    } catch {
      inflight = null;
      return new Map();
    }
  })();
  return inflight;
}

export function invalidateProviderIconCache(): void {
  cache = null;
  inflight = null;
}

export function useProviderIcons(): Map<string, ProviderIconInfo> {
  const [icons, setIcons] = useState<Map<string, ProviderIconInfo>>(
    cache ?? new Map()
  );

  useEffect(() => {
    let cancelled = false;
    const listener = (map: Map<string, ProviderIconInfo>) => {
      if (!cancelled) setIcons(map);
    };
    listeners.add(listener);
    void fetchProviderIcons().then((map) => {
      if (!cancelled) setIcons(map);
    });
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);

  return icons;
}

export function useProviderIcon(providerId?: string): ProviderIconInfo | null {
  const icons = useProviderIcons();
  if (!providerId) return null;
  return icons.get(providerId) ?? null;
}
