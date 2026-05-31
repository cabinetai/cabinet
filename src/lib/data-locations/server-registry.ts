import path from "path";
import fs from "fs/promises";
import { DATA_DIR, CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";
import { INSTALL_CONFIG_PATH, PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import type { DataLocation, DataLocationSnapshot, DataLocationStats } from "./types";

export function getServerDataLocations(): DataLocation[] {
  return [
    {
      id: "data-dir",
      label: "Cabinet data folder",
      pathOrKey: DATA_DIR,
      contains:
        "All your cabinets, pages, conversations, agent files, jobs — the source of truth.",
      leavesDevice: false,
      scope: "fs",
      onboarding: false,
    },
    {
      id: "sqlite-index",
      label: "SQLite index",
      pathOrKey: path.join(DATA_DIR, ".cabinet.db"),
      contains:
        "Cached index of files in the data folder. Rebuilt automatically from disk on demand.",
      leavesDevice: false,
      scope: "fs",
      onboarding: false,
    },
    {
      id: "cabinet-state",
      label: "Runtime state",
      pathOrKey: CABINET_INTERNAL_DIR,
      contains:
        "Internal app state: install metadata, runtime ports, update status, file-schema state.",
      leavesDevice: false,
      scope: "fs",
      onboarding: false,
    },
    {
      id: "install-config",
      label: "Install config (data-dir pointer)",
      pathOrKey: INSTALL_CONFIG_PATH,
      contains:
        "Cabinet's install metadata, including which folder it uses for your data.",
      leavesDevice: false,
      scope: "fs",
      onboarding: false,
    },
    {
      id: "api-keys-env",
      label: "API keys",
      pathOrKey: path.join(PROJECT_ROOT, ".cabinet.env"),
      contains:
        "Provider API keys (OpenAI, Anthropic, etc.) you set in Settings → Integrations → API Keys.",
      leavesDevice: false,
      scope: "fs",
      onboarding: false,
    },
  ];
}

async function statFsLocation(absPath: string): Promise<DataLocationStats> {
  try {
    const stat = await fs.stat(absPath);
    if (stat.isDirectory()) {
      let total = 0;
      let count = 0;
      const walk = async (dir: string) => {
        let entries: import("fs").Dirent[] = [];
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) {
            await walk(p);
          } else if (e.isFile()) {
            try {
              const s = await fs.stat(p);
              total += s.size;
              count += 1;
            } catch {
              // skip
            }
          }
        }
      };
      await walk(absPath);
      return { exists: true, sizeBytes: total, itemCount: count };
    }
    return { exists: true, sizeBytes: stat.size };
  } catch {
    return { exists: false };
  }
}

export async function snapshotServerDataLocations(): Promise<DataLocationSnapshot[]> {
  const rows = getServerDataLocations();
  const out: DataLocationSnapshot[] = [];
  for (const row of rows) {
    if (row.scope === "fs" && !row.pathOrKey.includes(" ")) {
      const stats = await statFsLocation(row.pathOrKey);
      out.push({ ...row, stats });
    } else {
      out.push(row);
    }
  }
  return out;
}
