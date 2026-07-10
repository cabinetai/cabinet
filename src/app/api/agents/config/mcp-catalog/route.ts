import { NextResponse } from "next/server";
import { MCP_CATALOG, BUILT_IN_TOOLS } from "@/lib/agents/mcp-catalog";
import {
  connectedProvidersForEntry,
  credentialStatus,
} from "@/lib/agents/mcp-config-writer";
import { MCP_PROVIDERS } from "@/lib/agents/mcp-providers";
import { getSelectedEnvironments } from "@/lib/agents/integration-environments";
import { getRegistryPresence, verifyTier } from "@/lib/agents/mcp-registry-verify";
import { getDeploymentMode, resolveAuthBackend } from "@/lib/agents/deployment-mode";
import { getConfiguredDefaultProviderId } from "@/lib/agents/provider-settings";
import { isCloud } from "@/lib/cloud/tier";

/**
 * `/api/agents/config/mcp-catalog` — Integrations Hub data source.
 * Returns the curated catalog with registry-verified tiers, the full known
 * provider lineup (capable + per-integration transport support), the user's
 * selected environments, and per-integration connected state per provider.
 * Never returns secret values.
 */
export async function GET(): Promise<NextResponse> {
  const mode = getDeploymentMode();
  const presence = await getRegistryPresence();
  const selectedEnvironments = await getSelectedEnvironments();
  const defaultProvider = getConfiguredDefaultProviderId();

  const providers = MCP_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    iconAsset: p.iconAsset,
    capable: !!p.mcpConfig,
    transports: p.mcpConfig?.transports ?? [],
    configPath: p.mcpConfig?.displayPath,
  }));

  // On Cabinet Cloud, drop integrations whose sign-in needs a local terminal / desktop app the
  // hosted container can't reach (LinkedIn, Salesforce, Figma). Inert off-cloud.
  const catalog = isCloud()
    ? MCP_CATALOG.filter((entry) => !entry.cloudUnsupported)
    : MCP_CATALOG;

  const approved = catalog.map((entry) => {
    const supportedProviderIds = MCP_PROVIDERS.filter(
      (p) => p.mcpConfig?.transports.includes(entry.transport),
    ).map((p) => p.id);
    return {
      id: entry.id,
      label: entry.label,
      blurb: entry.blurb,
      iconSlug: entry.iconSlug,
      bgImage: entry.bgImage,
      logo: entry.logo,
      sourceUrl: entry.sourceUrl,
      actions: entry.actions,
      setupSteps: entry.setupSteps,
      credentials: entry.credentials,
      transport: entry.transport,
      verifiedTier: verifyTier(entry.trustTier, entry.registryId, presence),
      authBackend: resolveAuthBackend(entry, mode),
      supportedProviderIds,
      connectedProviderIds: connectedProvidersForEntry(entry),
      credentialStatus: credentialStatus(entry.credentials.map((c) => c.envKey)),
      // How (if at all) the connect panel can sign in at connect time:
      // "http" → driven through Claude Code; "stdio" → daemon runs the server's
      // own browser-OAuth loopback (connectAuth); null → deferred/none.
      signinKind: (entry.transport === "http"
        ? "http"
        : entry.connectAuth
          ? "stdio"
          : null) as "http" | "stdio" | null,
    };
  });

  return NextResponse.json(
    { deploymentMode: mode, providers, selectedEnvironments, defaultProvider, approved, builtins: BUILT_IN_TOOLS },
    { headers: { "Cache-Control": "no-store" } },
  );
}
