import { NextRequest, NextResponse } from "next/server";
import { getCatalogEntry } from "@/lib/agents/mcp-catalog";
import {
  writeEntry,
  removeEntry,
  connectedProvidersForEntry,
  type ProviderWriteResult,
} from "@/lib/agents/mcp-config-writer";
import { resolveAuthBackend } from "@/lib/agents/deployment-mode";
import { getSelectedEnvironments } from "@/lib/agents/integration-environments";
import { isValidKey, upsertCabinetEnv } from "@/lib/runtime/cabinet-env";

/**
 * `/api/agents/config/mcp-catalog/connect`
 *
 * POST   — register the integration's MCP server into the chosen environments
 *          (defaults to the user's selected set) and, for token/user-app
 *          backends, persist credentials to .cabinet.env. Idempotent.
 * DELETE — remove the `cabinet-<id>` server entry from the chosen environments
 *          (defaults to wherever it's currently connected). Credentials kept.
 *
 * Secrets are written ONLY to .cabinet.env, never into any CLI config.
 * Per-provider results are returned so the UI can show partial success.
 */

async function resolveTargets(
  requested: unknown,
  fallback: () => Promise<string[]> | string[],
): Promise<string[]> {
  if (Array.isArray(requested) && requested.every((x) => typeof x === "string")) {
    return requested as string[];
  }
  return await fallback();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, credentials, providers } = (body ?? {}) as {
    id?: unknown;
    credentials?: Record<string, string>;
    providers?: unknown;
  };
  const entry = typeof id === "string" ? getCatalogEntry(id) : undefined;
  if (!entry) {
    return NextResponse.json({ error: "Unknown integration id" }, { status: 400 });
  }
  const backend = resolveAuthBackend(entry);
  const creds = credentials && typeof credentials === "object" ? credentials : {};

  // Persist credentials for token / user-app backends. Validate required ones.
  if (backend === "token" || backend === "user-app") {
    for (const c of entry.credentials) {
      const raw = creds[c.envKey];
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value) {
        if (c.required) {
          return NextResponse.json(
            { error: `Missing required credential: ${c.label}` },
            { status: 400 },
          );
        }
        continue;
      }
      if (!isValidKey(c.envKey)) {
        return NextResponse.json(
          { error: `Invalid env var name for ${c.label}` },
          { status: 400 },
        );
      }
      try {
        upsertCabinetEnv(c.envKey, value);
      } catch (err) {
        return NextResponse.json(
          {
            error: err instanceof Error ? err.message : "Failed to store credential",
            partial: "some credentials may have been saved; retry is safe",
          },
          { status: 500 },
        );
      }
    }
  }

  const targets = await resolveTargets(providers, getSelectedEnvironments);
  if (targets.length === 0) {
    return NextResponse.json(
      { error: "No environments selected. Pick at least one in Settings → Integrations." },
      { status: 400 },
    );
  }

  const results: ProviderWriteResult[] = targets.map((pid) => writeEntry(pid, entry));
  const anyOk = results.some((r) => r.ok);
  const next =
    backend === "cli-pkce" || backend === "user-app" || entry.transport === "http"
      ? "cli-oauth"
      : "ready";

  return NextResponse.json(
    {
      ok: anyOk,
      results,
      connectedProviderIds: connectedProvidersForEntry(entry),
      next,
      message: anyOk
        ? next === "cli-oauth"
          ? "Registered. Each environment's CLI opens a browser to finish sign-in the first time it uses this."
          : "Connected and ready to use."
        : "Could not register in any selected environment.",
    },
    { status: anyOk ? 200 : 500 },
  );
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const entry = id ? getCatalogEntry(id) : undefined;
  if (!entry) {
    return NextResponse.json({ error: "Unknown integration id" }, { status: 400 });
  }
  const providersParam = url.searchParams.get("providers");
  const requested = providersParam
    ? providersParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const targets = await resolveTargets(requested, () => connectedProvidersForEntry(entry));

  const results: ProviderWriteResult[] = targets.map((pid) => removeEntry(pid, entry));
  return NextResponse.json({
    ok: results.every((r) => r.ok),
    results,
    connectedProviderIds: connectedProvidersForEntry(entry),
    removableEnvKeys: entry.credentials.map((c) => c.envKey),
    note:
      entry.transport === "http"
        ? "Removed. OAuth tokens are held by each CLI — revoke in the service for full removal."
        : "Removed. Saved credentials are kept unless you remove them.",
  });
}
