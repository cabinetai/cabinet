import { create } from "zustand";

interface GithubStatsState {
  stars: number | null;
  loading: boolean;
  hasFetchedOnce: boolean;
  fetchStars: () => Promise<void>;
}

const STATS_URL = "/api/github/repo";

export const useGithubStatsStore = create<GithubStatsState>((set, get) => ({
  stars: null,
  loading: false,
  hasFetchedOnce: false,
  fetchStars: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const res = await fetch(STATS_URL, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { stars?: number | null };
      if (typeof data.stars === "number") {
        set({ stars: data.stars, hasFetchedOnce: true });
      }
    } catch {
      /* ignore — keep showing the placeholder */
    } finally {
      set({ loading: false });
    }
  },
}));
