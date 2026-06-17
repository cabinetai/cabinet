import { create } from "zustand";

export interface VaultMetaClient {
  /** Folder name = display name (Obsidian-style: the vault IS its folder). */
  name: string;
  /** Whether this vault is the one the server is currently bound to. */
  active: boolean;
}

interface VaultsState {
  vaults: VaultMetaClient[];
  /** Name of the active vault (the server's current content root). */
  activeVault: string | null;
  loaded: boolean;
  loading: boolean;
  /** Fetch the vault list. No-op if already loaded unless `force`. */
  load: (force?: boolean) => Promise<void>;
  /** Create a new vault folder. Returns its name on success, null on failure. */
  create: (name: string) => Promise<string | null>;
  /**
   * Switch the active vault. Persists the choice server-side then restarts the
   * app — DATA_DIR is resolved once at boot, so rebinding the content root to a
   * different vault requires a fresh process (Obsidian-style reload-on-switch).
   */
  switchTo: (name: string) => Promise<void>;
}

/**
 * Client cache + mutations for the vault list. A vault is a root folder that is
 * a direct child of the data folder; each maps to an isolated Obsidian-style
 * workspace (its own rooms, agents, chats). `bookmarks.json` and other global
 * state live one level up in the parent data folder and are shared across
 * vaults — so switching vaults never loses your bookmarks.
 */
export const useVaultsStore = create<VaultsState>((set, get) => ({
  vaults: [],
  activeVault: null,
  loaded: false,
  loading: false,
  load: async (force = false) => {
    const { loaded, loading } = get();
    if (loading) return;
    if (loaded && !force) return;
    set({ loading: true });
    try {
      const res = await fetch("/api/vaults", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        vaults?: VaultMetaClient[];
        activeVault?: string | null;
      };
      set({
        vaults: data.vaults ?? [],
        activeVault: data.activeVault ?? null,
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
      const res = await fetch("/api/vaults", {
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
    const res = await fetch("/api/vaults", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    // Server has persisted the new active vault. Rebind the content root by
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
      window.location.reload();
    }
  },
}));
