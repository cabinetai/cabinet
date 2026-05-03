import {
  AGENT_DEFINITION_V2_SCHEMA_VERSION,
  type AgentDefinitionV2MemoryBindingStatus,
  type AgentDefinitionV2Preview,
  type AgentDefinitionV2PreviewManifest,
} from "./agent-definition-v2";
import type { AgentDefinition, AgentDefinitionManifest } from "./agent-definition";

const ADAPTER_TYPE_BY_PROVIDER_ID: Record<string, string> = {
  "claude-code": "claude_local",
  "codex-cli": "codex_local",
  openrouter: "openrouter_api",
};

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim() !== "")));
}

function hasServer(agent: AgentDefinition, serverId: string): boolean {
  return agent.mcp.servers.some(
    (server) =>
      server.serverId === serverId || server.legacyServerName === serverId
  );
}

function bridgeStatusFor(
  agent: AgentDefinition,
  serverId: string
): AgentDefinitionV2MemoryBindingStatus {
  return hasServer(agent, serverId) ? "bridge-only" : "planned";
}

function nativePersonaSlug(agent: AgentDefinition): string {
  const native = agent.runtimeProjections.nativeOptaleCommand;
  return native.personaSlug || native.agentSlug;
}

function namespaceFor(agent: AgentDefinition, suffix: string): string {
  return `${agent.memoryNamespace}.${suffix}`;
}

function privacyBoundaryFor(
  scope: AgentDefinition["scope"]
): AgentDefinitionV2Preview["scopeProfile"]["privacyBoundary"] {
  return scope === "personal" ? "private" : scope;
}

function requiresAny(policy: AgentDefinition["approvalPolicy"], terms: string[]): boolean {
  const haystack = policy.requiredFor.join(" ").toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function buildSenseMemory(agent: AgentDefinition): AgentDefinitionV2Preview["senseMemory"] {
  const hasHoncho = hasServer(agent, "honcho");
  return {
    ingestion: {
      provider: "cognee",
      status: "planned",
      namespace: namespaceFor(agent, "cognee"),
      notes:
        "Future Sense ingestion and document-to-KG binding; not wired by v1 projection.",
    },
    ontology: {
      provider: "open-foundry-oag",
      status: bridgeStatusFor(agent, "oag"),
      namespace: namespaceFor(agent, "ontology"),
      serverId: hasServer(agent, "oag") ? "oag" : undefined,
      notes:
        "Open Foundry patterns shape the ontology/runtime direction while OAG remains the native ontology bridge.",
    },
    temporalFacts: {
      provider: "graphiti",
      status: bridgeStatusFor(agent, "graphiti"),
      namespace: namespaceFor(agent, "graphiti"),
      serverId: hasServer(agent, "graphiti") ? "graphiti" : undefined,
      notes: "Temporal fact memory binding for validity-window context.",
    },
    personalMemory: {
      provider: "proprietary-personal-memory",
      status: "planned",
      namespace: agent.memoryNamespace,
      replaces: hasHoncho ? "honcho" : undefined,
      notes:
        "Customer-facing personal memory target; Honcho remains internal-only during migration.",
    },
    internalLegacyMemory: hasHoncho
      ? {
          provider: "honcho",
          status: "internal-only",
          namespace: namespaceFor(agent, "honcho"),
          serverId: "honcho",
          internalOnly: true,
          bridgeOnly: true,
          notes:
            "Internal-only legacy memory bridge. Do not expose as a customer-facing dependency.",
        }
      : undefined,
  };
}

export function mapAgentDefinitionToV2Preview(
  manifest: AgentDefinitionManifest,
  agent: AgentDefinition
): AgentDefinitionV2Preview {
  const native = agent.runtimeProjections.nativeOptaleCommand;
  const legacy = agent.runtimeProjections.legacyLibreChatBridge;
  const allowedServerIds = uniq(agent.mcp.servers.map((server) => server.serverId));
  const allowedTools = uniq(
    agent.mcp.servers.flatMap((server) => server.allowedTools)
  );
  const bridgeServerNames = uniq(
    agent.mcp.servers
      .map((server) => server.legacyServerName)
      .filter((name): name is string => Boolean(name))
  );

  return {
    schemaVersion: AGENT_DEFINITION_V2_SCHEMA_VERSION,
    id: agent.id,
    sourceDefinition: {
      manifestId: manifest.id,
      manifestSchemaVersion: manifest.schemaVersion,
      definitionId: agent.id,
      definitionSchemaVersion: agent.schemaVersion,
    },
    identity: {
      publicName: agent.name,
      internalName: nativePersonaSlug(agent),
      role: agent.role,
      description: agent.description,
      customerFacing: false,
      infoBarrier: {
        hideRawToolNames: true,
        hideBridgeDependencies: true,
        exposeSourceReferences: true,
      },
    },
    scopeProfile: {
      scope: agent.scope,
      subjectType: agent.scope,
      privacyBoundary: privacyBoundaryFor(agent.scope),
      memoryNamespace: agent.memoryNamespace,
      vaultNamespace: namespaceFor(agent, "vault"),
      graphNamespace: namespaceFor(agent, "graph"),
      entityNamespace: namespaceFor(agent, "entities"),
      mcpPolicyId: `agent-harness:${agent.id}`,
      mcpClientProfile: `agent-harness:${nativePersonaSlug(agent)}`,
      promotionBoundary: {
        privateToCompanyAutomaticWrite: false,
        requiresPromotionPacket: true,
        requiresHumanApproval: true,
        requiresReadBackVerification: true,
      },
    },
    senseMemory: buildSenseMemory(agent),
    runtime: {
      providerId: agent.provider.providerId,
      providerName: agent.provider.providerName,
      adapterType: ADAPTER_TYPE_BY_PROVIDER_ID[agent.provider.providerId],
      model: agent.provider.model,
      modelAlias: agent.provider.modelAlias,
      capabilities: {
        nativeToolCalls: agent.provider.providerId === "openrouter",
        governedMcp: allowedServerIds.length > 0,
        sourceArtifacts: hasServer(agent, "qmd") || hasServer(agent, "graphiti"),
        manualRuns: true,
        schedulesEnabledByDefault: false,
      },
    },
    toolPolicy: {
      defaultDecision: agent.mcp.defaultDecision,
      governedMcp: true,
      allowedServerIds,
      allowedTools,
      bridgeServerNames,
      restrictions: [...agent.mcp.restrictions],
    },
    actionPolicy: {
      mode: agent.approvalPolicy.mode,
      requiredFor: [...agent.approvalPolicy.requiredFor],
      externalActionsRequireApproval: requiresAny(agent.approvalPolicy, [
        "external",
        "message",
        "account",
        "send",
        "payment",
      ]),
      memoryWritesRequireApproval: requiresAny(agent.approvalPolicy, [
        "memory",
        "record",
        "canonical",
        "ontology",
      ]),
      companyWritesRequirePromotion: true,
    },
    observability: {
      traceLevel: "standard",
      auditMcp: true,
      sourceArtifacts: true,
      citationRows: hasServer(agent, "qmd"),
      runtimeArtifactsCommitted: false,
    },
    orchestration: {
      role: agent.handoffs.length > 0 ? "lead" : "specialist",
      maxFanout: Math.max(agent.handoffs.length, 1),
      handoffTargets: agent.handoffs.map((handoff) => ({
        to: handoff.to,
        edgeType: handoff.edgeType,
        description: handoff.description,
        bridgeOnly: Boolean(handoff.legacyToolName),
        legacyToolName: handoff.legacyToolName,
      })),
    },
    projection: {
      nativeOptaleCommand: {
        status: native.status,
        agentSlug: native.agentSlug,
        personaSlug: nativePersonaSlug(agent),
        projectionStrategy: native.projectionStrategy,
        readOnlyPreview: true,
      },
      legacyLibreChatBridge:
        legacy.status === "temporary-bridge" || legacy.status === "disabled"
          ? {
              status: legacy.status,
              bridgeOnly: legacy.bridgeOnly,
              agentId: legacy.agentId,
              sourceScript: legacy.sourceScript,
              providerName: legacy.providerName,
              model: legacy.model,
            }
          : undefined,
    },
  };
}

export function buildAgentDefinitionV2PreviewManifest(
  manifest: AgentDefinitionManifest
): AgentDefinitionV2PreviewManifest {
  return {
    schemaVersion: AGENT_DEFINITION_V2_SCHEMA_VERSION,
    id: `${manifest.id}.agents-fw-preview`,
    sourceManifestId: manifest.id,
    sourceManifestSchemaVersion: manifest.schemaVersion,
    name: `${manifest.name} AGENTS-FW Preview`,
    description:
      "Read-only AGENTS-FW v2 preview metadata derived from the tactical v1 AgentDefinition manifest.",
    agents: manifest.agents.map((agent) =>
      mapAgentDefinitionToV2Preview(manifest, agent)
    ),
  };
}
