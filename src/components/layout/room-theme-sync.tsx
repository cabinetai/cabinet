"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import { useAppStore } from "@/stores/app-store";
import { useRoomsStore } from "@/stores/rooms-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { THEMES, applyTheme, getStoredThemeName } from "@/lib/themes";

/**
 * Applies the active room's theme whenever you switch rooms. Each room can pin
 * a theme in its `.cabinet` (`room.theme`); when unset we fall back to the
 * user's global theme. We never persist here (no `storeThemeName`), so the
 * global preference is preserved across rooms — only the live CSS vars change.
 *
 * Theme lives only in the DOM, so each window applies its own room's theme
 * independently (key for multi-window).
 */
export function RoomThemeSync() {
  const { setTheme } = useTheme();
  const cabinetPath =
    useAppStore((s) => s.section.cabinetPath) || ROOT_CABINET_PATH;
  const rooms = useRoomsStore((s) => s.rooms);
  const load = useRoomsStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Rooms are top-level cabinets, so a deep path resolves to its first segment.
    const top =
      cabinetPath === ROOT_CABINET_PATH
        ? ROOT_CABINET_PATH
        : cabinetPath.split("/")[0];
    const room = rooms.find((r) => r.path === top);
    const themeName = room?.theme || getStoredThemeName() || "paper";
    const def = THEMES.find((t) => t.name === themeName);
    if (def) {
      applyTheme(def);
      setTheme(def.type);
    }
  }, [cabinetPath, rooms, setTheme]);

  return null;
}
