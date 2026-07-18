"use client";

import { useEffect, useState } from "react";

/**
 * Which connectors are actually connected, by catalog id. Shared by the
 * surfaces that badge or rank integrations (sidebar rail, home strip) —
 * the hub page keeps its own richer fetch (it also needs credentialStatus).
 */
export function useConnectedIntegrations(): Set<string> {
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    fetch("/api/agents/config/mcp-catalog", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data?.approved) return;
        const approved = data.approved as {
          id: string;
          connectedProviderIds?: string[];
        }[];
        setConnectedIds(
          new Set(
            approved
              .filter((a) => (a.connectedProviderIds?.length ?? 0) > 0)
              .map((a) => a.id),
          ),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return connectedIds;
}
