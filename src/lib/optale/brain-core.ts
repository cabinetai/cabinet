import {
  readOptaleBrainSources,
  readOptaleMcpServers,
  type OptaleBrainSource,
} from "@/lib/optale/context-registry";
import { resolveOptaleBrainContext } from "@/lib/optale/brain-context";
import { readOptaleMcpPolicy, type OptaleMcpPolicyServer } from "@/lib/optale/mcp-policy";
import { getPublicCommandBrainBridgeStatus } from "@/lib/optale/command-brain-bridge";
import {
  buildBrainRequestContext,
  buildPromotionBoundary,
  buildProvisioningProfile,
  capabilitiesForBrainSource,
  namespaceForBrainSource,
  type OptaleBrainAdapterBinding,
  type OptaleBrainAdapterStatus,
  type OptaleBrainCoreStatus,
} from "@/lib/optale/brain-contracts";
import { buildOptaleBrainMemorySourceBinding } from "@/lib/optale/brain-memory-config";
import { buildOptaleBrainDreamsSourceBinding } from "@/lib/optale/brain-dreams-config";
import { resolveOptaleCompanyBrainReviewerAddon } from "@/lib/optale/brain-company-brain-addon";

function statusForSource(input: {
  source: OptaleBrainSource;
  policyServer?: OptaleMcpPolicyServer;
  registryConfigured: boolean;
}): { status: OptaleBrainAdapterStatus; reason?: string } {
  if (!input.registryConfigured) {
    return {
      status: "unconfigured",
      reason: "MCP server is not configured in the Observatory registry.",
    };
  }
  if (!input.policyServer) {
    return {
      status: "blocked",
      reason: "MCP server is not present in the active MCP policy.",
    };
  }
  if (!input.policyServer.enabled) {
    return {
      status: "blocked",
      reason: "MCP server is disabled by the active MCP policy.",
    };
  }
  if (!input.policyServer.permissions.includes("read")) {
    return {
      status: "blocked",
      reason: "MCP server does not grant read permission for this Brain context.",
    };
  }
  return { status: "healthy" };
}

function buildSourceBindings(input: {
  sources: OptaleBrainSource[];
  policyServers: OptaleMcpPolicyServer[];
  registryServerIds: Set<string>;
  context: Parameters<typeof namespaceForBrainSource>[1];
}): OptaleBrainAdapterBinding[] {
  const policyByServer = new Map(
    input.policyServers.map((server) => [server.serverId, server])
  );

  return input.sources.map((source) => {
    if (!source.mcpServerId) {
      if (source.kind === "memory") {
        return buildOptaleBrainMemorySourceBinding(input.context);
      }
      if (source.kind === "dreams") {
        return buildOptaleBrainDreamsSourceBinding(input.context);
      }
      const binding = namespaceForBrainSource(source, input.context);
      return {
        id: source.id,
        name: source.name,
        kind: source.kind,
        source: "native",
        status: "unconfigured",
        statusReason: "Native adapter is not configured for this Brain source.",
        readOnly: true,
        scopes: source.scopes,
        permissions: [],
        rawPolicyPermissions: [],
        capabilities: [],
        namespace: binding.namespace,
        profile: binding.profile,
        description: source.description,
      };
    }

    const policyServer = policyByServer.get(source.mcpServerId);
    const status = statusForSource({
      source,
      policyServer,
      registryConfigured: input.registryServerIds.has(source.mcpServerId),
    });
    const binding = namespaceForBrainSource(source, input.context);

    const rawPolicyPermissions = policyServer?.permissions || [];
    const permissions = rawPolicyPermissions.filter((permission) => permission === "read");

    return {
      id: source.id,
      name: source.name,
      kind: source.kind,
      source: "native",
      status: status.status,
      statusReason: status.reason,
      readOnly: true,
      scopes: source.scopes,
      mcpServerId: source.mcpServerId,
      permissions,
      rawPolicyPermissions,
      capabilities: capabilitiesForBrainSource(source),
      namespace: binding.namespace,
      profile: binding.profile,
      description: source.description,
    };
  });
}

export async function readOptaleBrainCoreStatus(input: {
  cabinetPath?: string | null;
  actor?: unknown;
  requestId?: string;
} = {}): Promise<OptaleBrainCoreStatus> {
  const context = await resolveOptaleBrainContext(input.cabinetPath);
  const [policy, bridge, companyBrainReviewer] = await Promise.all([
    readOptaleMcpPolicy(context.cabinetPath),
    Promise.resolve(getPublicCommandBrainBridgeStatus()),
    resolveOptaleCompanyBrainReviewerAddon(context.cabinetPath),
  ]);
  const generatedAt = new Date().toISOString();
  const sources = readOptaleBrainSources();
  const registryServerIds = new Set(
    readOptaleMcpServers()
      .filter((server) => server.status === "configured")
      .map((server) => server.id)
  );
  const sourceBindings = buildSourceBindings({
    sources,
    policyServers: policy.servers,
    registryServerIds,
    context,
  });
  const companyBrainAddon = companyBrainReviewer.addon;
  const companyBrainStatus: OptaleBrainAdapterStatus = !companyBrainAddon.enabled
    ? "blocked"
    : !companyBrainAddon.targetId
      ? "unconfigured"
      : bridge.enabled
        ? "healthy"
        : "unconfigured";
  const companyBrainBinding: OptaleBrainAdapterBinding = {
    id: "company-brain",
    name: "Company Brain",
    kind: "company_brain",
    source: "bridge",
    status: companyBrainStatus,
    statusReason: !companyBrainAddon.enabled
      ? companyBrainAddon.reason
      : !companyBrainAddon.targetId
        ? "Company Brain reviewer add-on is enabled, but no target id is bound to this scope."
        : bridge.reason,
    readOnly: true,
    scopes: ["company", "personal", "system"],
    permissions: companyBrainAddon.enabled && bridge.enabled ? ["read"] : [],
    capabilities: companyBrainAddon.enabled && bridge.enabled ? ["read"] : [],
    namespace: companyBrainAddon.targetId || context.companyBrainTargetId,
    profile: context.mcpClientProfile,
    description:
      "Add-on reviewer/admin surface for governed shared knowledge. Writes stay server-side behind promotion review, approval, and read-back verification.",
  };

  return {
    version: 1,
    generatedAt,
    request: buildBrainRequestContext({
      context,
      actor: input.actor,
      requestId: input.requestId,
      generatedAt,
    }),
    provisioning: buildProvisioningProfile(context),
    boundary: buildPromotionBoundary(),
    sources: [...sourceBindings, companyBrainBinding],
    migration: {
      commandBridgeEnabled: bridge.enabled,
      commandBridgeConfigured: bridge.configured,
      commandBridgeReadOnly: true,
      commandBridgeReason: bridge.reason,
      canonicalOwner: "observatory",
    },
  };
}
