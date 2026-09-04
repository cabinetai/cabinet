import { create } from "zustand";

export interface CabinetMetaClient {
  /** Folder name = display name (Obsidian-style: the cabinet IS its folder). */
  name: string;
  /** Whether this cabinet is the one the server is currently bound to. */
  active: boolean;
}

interface CabinetsState {
  cabinets: CabinetMetaClient[];
  /** Name of the active cabinet (the server's current content root). */
  activeCabinet: string | null;
  loaded: boolean;
  loading: boolean;
  /** Fetch the cabinet list. No-op if already loaded unless `force`. */
  load: (force?: boolean) => Promise<void>;
  /** Create a new cabinet folder. Returns its name on success, null on failure. */
  create: (name: string) => Promise<string | null>;
  /**
   * Switch the active cabinet. Persists the choice server-side then restarts the
   * app — DATA_DIR is resolved once at boot, so rebinding the content root to a
   * different cabinet requires a fresh process (Obsidian-style reload-on-switch).
   */
  switchTo: (name: string) => Promise<void>;
}

/**
 * Client cache + mutations for the cabinet list. A root cabinet is a folder that is
 * a direct child of the data folder; each maps to an isolated Obsidian-style
 * workspace (its own rooms, agents, chats). `bookmarks.json` and other global
 * state live one level up in the parent data folder and are shared across
 * cabinets — so switching cabinets never loses your bookmarks.
 */
export const useCabinetsStore = create<CabinetsState>((set, get) => ({
  cabinets: [],
  activeCabinet: null,
  loaded: false,
  loading: false,
  load: async (force = false) => {
    const { loaded, loading } = get();
    if (loading) return;
    if (loaded && !force) return;
    set({ loading: true });
    try {
      const res = await fetch("/api/cabinets", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        cabinets?: CabinetMetaClient[];
        activeCabinet?: string | null;
      };
      set({
        cabinets: data.cabinets ?? [],
        activeCabinet: data.activeCabinet ?? null,
        loaded: true,
      });
    } catch {
      // ignore — a later interaction retries
    } finally {
      set({ loading: false });
    }
  },
  create: async (name) => {
    try {
      const res = await fetch("/api/cabinets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { name?: string };
      await get().load(true);
      return data.name ?? null;
    } catch {
      return null;
    }
  },
  switchTo: async (name) => {
    const res = await fetch("/api/cabinets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    // Server has persisted the new active cabinet. Rebind the content root by
    // restarting: relaunch the desktop shell when running in Electron, else
    // fall back to a full page reload (dev still needs a manual server restart
    // for the new DATA_DIR to take effect).
    if (typeof window !== "undefined") {
      const desktop = (
        window as unknown as {
          CabinetDesktop?: { relaunch?: () => Promise<unknown> };
        }
      ).CabinetDesktop;
      if (desktop?.relaunch) {
        await desktop.relaunch();
        return;
      }
      // If we are not running in Electron (e.g. standard web browser in dev),
      // we must let the user know they need to manually restart their server
      // process for the new cabinet root path (DATA_DIR) to take effect.
      alert(
        `Cabinet switched to "${name}".\n\nPlease restart your Cabinet dev server/daemon process to apply the change.`
      );
      window.location.reload();
    }
  },
}));
