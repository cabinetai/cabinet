"use client";

import * as React from "react";

// Drop-in replacement for next-themes. The upstream `<ThemeProvider>` renders
// an inline <script> for FOUC prevention; React 19 + Next 16 logs that as a
// console error on every render. Cabinet only uses { theme, setTheme,
// resolvedTheme } from useTheme(), so a minimal context provider is enough
// and avoids the script tag entirely.

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme | undefined;
  setTheme: (next: Theme) => void;
  resolvedTheme: ResolvedTheme | undefined;
  systemTheme: ResolvedTheme | undefined;
  themes: string[];
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  attribute?: "class" | string | string[];
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  storageKey?: string;
}

const DEFAULT_STORAGE_KEY = "theme";
const COLOR_CLASSES = ["light", "dark"] as const;

function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTo(attribute: string, theme: ResolvedTheme) {
  const root = document.documentElement;
  if (attribute === "class") {
    root.classList.remove(...COLOR_CLASSES);
    root.classList.add(theme);
  } else {
    root.setAttribute(attribute, theme);
  }
}

function disableTransitionsBriefly(): () => void {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}"
    )
  );
  document.head.appendChild(style);
  return () => {
    // Force reflow so the transition-disable rule applies before we remove it.
    window.getComputedStyle(document.body);
    setTimeout(() => style.remove(), 1);
  };
}

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = false,
  storageKey = DEFAULT_STORAGE_KEY,
}: ThemeProviderProps) {
  // Initial state stays deterministic across server and first client render
  // to avoid hydration mismatches; the localStorage value is read after mount.
  const [theme, setThemeState] = React.useState<Theme | undefined>(undefined);
  const [systemTheme, setSystemTheme] = React.useState<ResolvedTheme | undefined>(undefined);

  React.useEffect(() => {
    let stored: Theme | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === "light" || raw === "dark" || raw === "system") {
        stored = raw;
      }
    } catch {
      // ignore — private mode etc.
    }
    setThemeState(stored ?? defaultTheme);
    setSystemTheme(readSystemTheme());

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [storageKey, defaultTheme]);

  const resolvedTheme: ResolvedTheme | undefined = React.useMemo(() => {
    if (theme === undefined || systemTheme === undefined) return undefined;
    if (theme === "system") return enableSystem ? systemTheme : "light";
    return theme;
  }, [theme, systemTheme, enableSystem]);

  React.useEffect(() => {
    if (!resolvedTheme) return;
    const restore = disableTransitionOnChange ? disableTransitionsBriefly() : null;
    if (Array.isArray(attribute)) {
      attribute.forEach((a) => applyTo(a, resolvedTheme));
    } else {
      applyTo(attribute, resolvedTheme);
    }
    restore?.();
  }, [resolvedTheme, attribute, disableTransitionOnChange]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      setThemeState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // ignore
      }
    },
    [storageKey]
  );

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      systemTheme,
      themes: enableSystem ? ["light", "dark", "system"] : ["light", "dark"],
    }),
    [theme, setTheme, resolvedTheme, systemTheme, enableSystem]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (ctx) return ctx;
  return {
    theme: undefined,
    setTheme: () => {},
    resolvedTheme: undefined,
    systemTheme: undefined,
    themes: ["light", "dark", "system"],
  };
}
