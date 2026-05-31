/**
 * The user-selected set of CLI environments integrations install into.
 *
 * Chosen at install (onboarding) and editable later in Settings → Integrations.
 * This is just the *default candidate set* offered when connecting; per
 * integration the user can still pick a subset. Source of truth for whether a
 * given integration is actually installed somewhere is always the CLI config
 * itself (see `connectedProvidersForEntry`), not this file.
 */

import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { defaultSelectedEnvironments, isProviderCapable } from "./mcp-providers";

const FILE = path.join(DATA_DIR, ".agents", ".config", "integration-environments.json");

interface Stored {
  environments: string[];
}

function sanitize(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const cleaned = ids.filter(
    (x): x is string => typeof x === "string" && isProviderCapable(x),
  );
  // De-dup, preserve order.
  return [...new Set(cleaned)];
}

export async function getSelectedEnvironments(): Promise<string[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Stored;
    const clean = sanitize(parsed.environments);
    if (clean && clean.length > 0) return clean;
  } catch {
    /* missing/corrupt → fall through to default */
  }
  return defaultSelectedEnvironments();
}

export async function setSelectedEnvironments(ids: string[]): Promise<string[]> {
  const clean = sanitize(ids) ?? [];
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify({ environments: clean }, null, 2), "utf8");
  return clean;
}
