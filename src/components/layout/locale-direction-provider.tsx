"use client";

import { DirectionProvider } from "@base-ui/react/direction-provider";
import { useLocale } from "@/i18n/use-locale";

/**
 * Base UI components are LTR by default and do NOT read `document.dir` —
 * their Positioner side/align, open/close animations, and arrow-key
 * navigation only mirror when they're inside a `DirectionProvider`. We feed
 * it the active locale's direction so every menu, popover, select, tooltip
 * and submenu flips as one when the user switches to Hebrew (or any future
 * RTL locale). Re-renders on locale change because `useLocale` subscribes
 * to the locale store.
 */
export function LocaleDirectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { dir } = useLocale();
  return <DirectionProvider direction={dir}>{children}</DirectionProvider>;
}
