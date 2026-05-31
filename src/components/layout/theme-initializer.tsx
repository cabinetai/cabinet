"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import {
  THEMES,
  applyTheme,
  getStoredThemeName,
  storeThemeName,
} from "@/lib/themes";

/**
 * Mounts once at the app root to ensure the custom theme CSS vars
 * are applied before any UI renders. This prevents flashes of the
 * wrong theme when navigating between panels.
 */
export function ThemeInitializer() {
  const { setTheme } = useTheme();

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { CabinetDesktop?: unknown }).CabinetDesktop
    ) {
      document.documentElement.classList.add("electron-desktop");
    }

    // Restore or default to Paper/Cabinet theme. applyTheme() loads only the
    // Google Font families that theme actually uses — see themes.ts.
    const stored = getStoredThemeName();
    const themeName = stored || "paper";
    const themeDef = THEMES.find((t) => t.name === themeName);
    if (themeDef) {
      applyTheme(themeDef);
      setTheme(themeDef.type);
      if (!stored) {
        storeThemeName(themeName);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
