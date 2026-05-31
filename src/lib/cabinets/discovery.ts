import fs from "fs";
import path from "path";
import { createTtlCache } from "@/lib/cache/ttl-cache";
import { CABINET_MANIFEST_FILE } from "@/lib/cabinets/files";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { cabinetPathFromFs } from "@/lib/cabinets/server-paths";
import { DATA_DIR, isHiddenEntry } from "@/lib/storage/path-utils";

async function walkCabinets(
  dir: string,
  results: string[]
): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || isHiddenEntry(entry.name)) continue;

    const childDir = path.join(dir, entry.name);
    if (fs.existsSync(path.join(childDir, CABINET_MANIFEST_FILE))) {
      results.push(cabinetPathFromFs(childDir));
    }

    await walkCabinets(childDir, results);
  }
}

function walkCabinetsSync(dir: string, results: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || isHiddenEntry(entry.name)) continue;

    const childDir = path.join(dir, entry.name);
    if (fs.existsSync(path.join(childDir, CABINET_MANIFEST_FILE))) {
      results.push(cabinetPathFromFs(childDir));
    }

    walkCabinetsSync(childDir, results);
  }
}

// 10-second TTL. Cabinet discovery walks the full data/ tree; hit by the
// events SSE every 3s, scheduler, gallery, and persona manager.
const discoveryCache = createTtlCache<string[]>({ ttlMs: 10_000 });

export function invalidateCabinetDiscoveryCache() {
  discoveryCache.invalidate();
}

export async function discoverCabinetPaths(): Promise<string[]> {
  return discoveryCache.get("all", async () => {
    const results = [ROOT_CABINET_PATH];
    await walkCabinets(DATA_DIR, results);
    return results;
  });
}

export function discoverCabinetPathsSync(): string[] {
  const results = [ROOT_CABINET_PATH];
  walkCabinetsSync(DATA_DIR, results);
  return results;
}
