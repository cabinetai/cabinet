import { create } from "zustand";
import { subscribeRoomsChanged } from "@/lib/cabinets/rooms-events";

export interface RoomMetaClient {
  path: string;
  name: string;
  icon: string | null;
  theme: string | null;
  color: string | null;
  isRoot: boolean;
}

interface RoomsState {
  rooms: RoomMetaClient[];
  /** Slug of the room to open on launch (from data/.home/home.json). */
  defaultRoom: string | null;
  loaded: boolean;
  loading: boolean;
  /** Fetch the room list. No-op if already loaded unless `force`. */
  load: (force?: boolean) => Promise<void>;
}

/**
 * Shared client cache of the room list, used by the home-button switcher,
 * the sidebar drawer, the per-room theme sync and the app-shell landing
 * redirect so they don't each fetch independently. Refreshes are triggered:
 *   • on `visibilitychange` → visible and on `window.focus` (debounced) —
 *     catches changes made while this window was in the background;
 *   • on a `BroadcastChannel('cabinet-rooms')` "rooms:invalidated" message —
 *     any window that mutates rooms broadcasts so peers refetch;
 *   • explicitly via `load(true)` after a known mutation in the same window.
 */
export const useRoomsStore = create<RoomsState>((set, get) => ({
  rooms: [],
  defaultRoom: null,
  loaded: false,
  loading: false,
  load: async (force = false) => {
    const { loaded, loading } = get();
    if (loading) return;
    if (loaded && !force) return;
    set({ loading: true });
    try {
      const res = await fetch("/api/rooms", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        rooms?: RoomMetaClient[];
        defaultRoom?: string | null;
      };
      set({
        rooms: data.rooms ?? [],
        defaultRoom: data.defaultRoom ?? null,
        loaded: true,
      });
    } catch {
      // ignore — a later interaction retries
    } finally {
      set({ loading: false });
    }
  },
}));

if (typeof window !== "undefined") {
  let lastRefreshAt = 0;
  const REFRESH_DEBOUNCE_MS = 1_500;

  const refreshFromOutside = () => {
    const now = Date.now();
    if (now - lastRefreshAt < REFRESH_DEBOUNCE_MS) return;
    lastRefreshAt = now;
    void useRoomsStore.getState().load(true);
  };

  // Refresh when this window comes back into focus — catches changes made
  // in another window, in the CLI, or by the migration script while we were
  // hidden. Debounced so tab-switching doesn't thrash the API.
  window.addEventListener("focus", refreshFromOutside);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshFromOutside();
  });

  // Cross-window invalidation (Electron multi-window or browser tabs sharing
  // origin). Every mutation site emits `rooms:invalidated`; peers refetch.
  subscribeRoomsChanged(refreshFromOutside);
}
