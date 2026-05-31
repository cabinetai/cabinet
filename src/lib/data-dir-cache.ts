import { dedupFetch } from "@/lib/api/dedup-fetch";

let cached: string | null = null;

export async function getDataDir(): Promise<string> {
  if (cached) return cached;
  const res = await dedupFetch("/api/health", { cache: "no-store" });
  const data = await res.json();
  cached = data.dataDir as string;
  return cached;
}
