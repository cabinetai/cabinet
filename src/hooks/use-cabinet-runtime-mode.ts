"use client";

import { useCallback, useEffect, useState } from "react";

export interface HermesRuntimeStatus {
  enabled: boolean;
  status: string;
  version: string | null;
  profile: string | null;
  gatewayState: string | null;
  checkedAt: string;
  message: string;
}

interface RuntimeModeState {
  loading: boolean;
  hermesMode: boolean;
  status: HermesRuntimeStatus | null;
}

// Fail closed until the server confirms Cabinet mode. This prevents a first-paint
// flash of legacy provider, model, skill, and scheduler controls in Hermes mode.
let cachedState: RuntimeModeState = {
  loading: true,
  hermesMode: true,
  status: null,
};
let pending: Promise<void> | null = null;
const listeners = new Set<(state: RuntimeModeState) => void>();

function publish(state: RuntimeModeState) {
  cachedState = state;
  for (const listener of listeners) listener(state);
}

function loadRuntimeMode(force = false): Promise<void> {
  if (!force && !cachedState.loading) return Promise.resolve();
  if (pending && !force) return pending;
  pending = fetch("/api/hermes/health", { cache: "no-store" })
    .then(async (response) => {
      const status = (await response.json()) as HermesRuntimeStatus;
      publish({ loading: false, hermesMode: status.enabled !== false, status });
    })
    .catch(() => {
      publish({ loading: false, hermesMode: true, status: null });
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useCabinetRuntimeMode() {
  const [state, setState] = useState(cachedState);

  useEffect(() => {
    listeners.add(setState);
    void loadRuntimeMode();
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const refresh = useCallback(() => loadRuntimeMode(true), []);
  return { ...state, refresh };
}

export function useHermesMode(): boolean {
  return useCabinetRuntimeMode().hermesMode;
}
