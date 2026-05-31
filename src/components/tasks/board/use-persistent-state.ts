"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Like `useState` but seeded from and synced to `localStorage`. Used for
 * the v2 board's view + agent filter so refreshing the page doesn't snap
 * back to Kanban / All agents every time.
 *
 * The initial render always returns the default to match server-rendered
 * HTML (localStorage is unavailable during SSR); a `useEffect` rehydrates
 * from storage on the first client tick.
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
  parse: (raw: string) => T | null = (raw) => raw as unknown as T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        const parsed = parse(raw);
        if (parsed != null) setValue(parsed);
      }
    } catch {
      // localStorage unavailable / quota / malformed — fall back to default.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setPersistent = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        // ignore
      }
    },
    [key]
  );

  return [value, setPersistent];
}
