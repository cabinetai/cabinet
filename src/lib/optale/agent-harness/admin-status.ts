import path from "path";
import matter from "gray-matter";
import type { AgentDefinition, AgentDefinitionManifest } from "./agent-definition";
import type { AgentDefinitionV2MemoryBindingStatus } from "./agent-definition-v2";
import { mapAgentDefinitionToV2Preview } from "./agent-definition-v2-preview";
import { OPTALE_META_AGENT_MANIFEST } from "./optale-meta-manifest";
import {
  defaultAgentHarnessPersonaTargetDir,
  mapAgentDefinitionToPersona,
} from "./persona-projection";
import { fileExists, readFileContent } from "@/lib/storage/fs-operations";

export type AgentHarnessPersonaStatus =
  | "missing"
  | "present"
  | "in_sync"
  | "drift_unknown";

export interface AgentHarnessMcpServerSummary {
  id: string;
  name?: string;
  permissions: string[];
  toolGroups: string[];
}

export interface AgentHarnessPersonaSummary {
  targetPath: string;
  exists: boolean;
  active?: boolean;
  state?: "active" | "paused";
  provider?: string;
  adapterType?: string;
  model?: string;
  manifestId?: string;
  definitionId?: string;
  projectedAt?: string;
}

export interface AgentHarnessFrameworkSummary {
  schemaVersion: 2;
  scopeProfile: {
    scope: AgentDefinition["scope"];
    subjectType: AgentDefinition["scope"];
    privacyBoundary: "private" | "company" | "system";
    memoryNamespace: string;
    promotionBoundary: "private-to-company gated";
  };
  senseMemory: {
    cognee: AgentDefinitionV2MemoryBindingStatus;
    openFoundryOag: AgentDefinitionV2MemoryBindingStatus;
    graphiti: AgentDefinitionV2MemoryBindingStatus;
    proprietaryPersonalMemory: AgentDefinitionV2MemoryBindingStatus;
    honchoInternalOnly: boolean;
  };
  bridgeOnly: boolean;
  runtimeStatus: AgentDefinition["runtimeProjections"]["nativeOptaleCommand"]["status"];
  projectionStatus: AgentDefinition["runtimeProjections"]["nativeOptaleCommand"]["projectionStrategy"];
}

export interface AgentHarnessAdminRow {
  definitionId: string;
  name: string;
  role: string;
  description: string;
  scope: AgentDefinition["scope"];
  memoryNamespace: string;
  provider: {
    id: string;
    name: string;
    model: string;
    modelAlias?: string;
  };
  projection: {
    slug: string;
    nativeAgentSlug: string;
    nativePersonaSlug: string;
    targetPath: string;
  };
  legacyLibreChatBridge?: {
    status: AgentDefinition["runtimeProjections"]["legacyLibreChatBridge"]["status"];
    agentId: string;
  };
  mcp: {
    allowedServerCount: number;
    allowedServers: AgentHarnessMcpServerSummary[];
  };
  persona: AgentHarnessPersonaSummary;
  framework: AgentHarnessFrameworkSummary;
  status: AgentHarnessPersonaStatus;
  issues: string[];
}

export interface AgentHarnessAdminSnapshot {
  manifestId: string;
  manifestSchemaVersion: AgentDefinitionManifest["schemaVersion"];
  targetAgentsDir: string;
  rows: AgentHarnessAdminRow[];
}

interface BuildAgentHarnessAdminSnapshotOptions {
  manifest?: AgentDefinitionManifest;
  targetAgentsDir?: string;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function addMismatch(
  issues: string[],
  label: string,
  expected: unknown,
  actual: unknown
) {
  if (!valuesMatch(expected, actual)) {
    issues.push(`${label} mismatch`);
  }
}

function summarizeMcpServers(agent: AgentDefinition): AgentHarnessMcpServerSummary[] {
  return agent.mcp.servers.map((server) => ({
    id: server.serverId,
    name: server.legacyServerName,
    permissions: [...server.permissions],
    toolGroups: [...server.toolGroups],
  }));
}

function summarizeFrameworkPreview(input: {
  manifest: AgentDefinitionManifest;
  agent: AgentDefinition;
}): AgentHarnessFrameworkSummary {
  const preview = mapAgentDefinitionToV2Preview(input.manifest, input.agent);
  return {
    schemaVersion: preview.schemaVersion,
    scopeProfile: {
      scope: preview.scopeProfile.scope,
      subjectType: preview.scopeProfile.subjectType,
      privacyBoundary: preview.scopeProfile.privacyBoundary,
      memoryNamespace: preview.scopeProfile.memoryNamespace,
      promotionBoundary: "private-to-company gated",
    },
    senseMemory: {
      cognee: preview.senseMemory.ingestion.status,
      openFoundryOag: preview.senseMemory.ontology.status,
      graphiti: preview.senseMemory.temporalFacts.status,
      proprietaryPersonalMemory: preview.senseMemory.personalMemory.status,
      honchoInternalOnly:
        preview.senseMemory.internalLegacyMemory?.internalOnly === true,
    },
    bridgeOnly: preview.projection.legacyLibreChatBridge?.bridgeOnly === true,
    runtimeStatus: preview.projection.nativeOptaleCommand.status,
    projectionStatus: preview.projection.nativeOptaleCommand.projectionStrategy,
  };
}

function actualModel(data: Record<string, unknown>): string | undefined {
  const adapterConfig = readRecord(data.adapterConfig);
  return readString(adapterConfig?.model);
}

function expectedModel(agent: AgentDefinition): string {
  return agent.provider.modelAlias || agent.provider.model;
}

async function buildRow(input: {
  manifest: AgentDefinitionManifest;
  agent: AgentDefinition;
  targetAgentsDir: string;
}): Promise<AgentHarnessAdminRow> {
  const expected = mapAgentDefinitionToPersona(input.manifest, input.agent, {
    projectedAt: "1970-01-01T00:00:00.000Z",
  });
  const native = input.agent.runtimeProjections.nativeOptaleCommand;
  const legacy = input.agent.runtimeProjections.legacyLibreChatBridge;
  const targetPath = path.join(input.targetAgentsDir, expected.slug, "persona.md");
  const exists = await fileExists(targetPath);
  const mcpServers = summarizeMcpServers(input.agent);
  const framework = summarizeFrameworkPreview(input);

  const baseRow: Omit<AgentHarnessAdminRow, "persona" | "status" | "issues"> = {
    definitionId: input.agent.id,
    name: input.agent.name,
    role: input.agent.role,
    description: input.agent.description,
    scope: input.agent.scope,
    memoryNamespace: input.agent.memoryNamespace,
    provider: {
      id: input.agent.provider.providerId,
      name: input.agent.provider.providerName,
      model: input.agent.provider.model,
      modelAlias: input.agent.provider.modelAlias,
    },
    projection: {
      slug: expected.slug,
      nativeAgentSlug: native.agentSlug,
      nativePersonaSlug: native.personaSlug || native.agentSlug,
      targetPath,
    },
    legacyLibreChatBridge:
      legacy.status === "temporary-bridge"
        ? {
            status: legacy.status,
            agentId: legacy.agentId,
          }
        : undefined,
    mcp: {
      allowedServerCount: mcpServers.length,
      allowedServers: mcpServers,
    },
    framework,
  };

  if (!exists) {
    return {
      ...baseRow,
      persona: { targetPath, exists: false },
      status: "missing",
      issues: ["persona file missing"],
    };
  }

  try {
    const raw = await readFileContent(targetPath);
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const harness = readRecord(data.optaleHarness);
    const nativeHarness = readRecord(harness?.nativeOptaleCommand);
    const legacyHarness = readRecord(harness?.legacyLibreChatBridge);
    const actualActive = readBoolean(data.active) ?? true;
    const issues: string[] = [];

    addMismatch(issues, "name", expected.frontmatter.name, data.name);
    addMismatch(issues, "slug", expected.frontmatter.slug, data.slug);
    addMismatch(issues, "provider", expected.frontmatter.provider, data.provider);
    addMismatch(issues, "adapterType", expected.frontmatter.adapterType, data.adapterType);
    addMismatch(issues, "model", expectedModel(input.agent), actualModel(data));
    addMismatch(issues, "active", false, actualActive);
    addMismatch(issues, "optaleScope", expected.frontmatter.optaleScope, data.optaleScope);
    addMismatch(
      issues,
      "optaleMemoryNamespace",
      expected.frontmatter.optaleMemoryNamespace,
      data.optaleMemoryNamespace
    );
    addMismatch(issues, "manifestId", input.manifest.id, harness?.manifestId);
    addMismatch(
      issues,
      "manifestSchemaVersion",
      input.manifest.schemaVersion,
      readNumber(harness?.manifestSchemaVersion)
    );
    addMismatch(issues, "definitionId", input.agent.id, harness?.definitionId);
    addMismatch(
      issues,
      "definitionSchemaVersion",
      input.agent.schemaVersion,
      readNumber(harness?.definitionSchemaVersion)
    );
    addMismatch(issues, "native agent slug", native.agentSlug, nativeHarness?.agentSlug);
    addMismatch(
      issues,
      "native persona slug",
      native.personaSlug || native.agentSlug,
      nativeHarness?.personaSlug
    );
    addMismatch(issues, "legacy bridge id", legacy.agentId, legacyHarness?.agentId);

    if (!parsed.content.includes(`Definition: ${input.agent.id} v${input.agent.schemaVersion}`)) {
      issues.push("projection trace missing definition");
    }
    if (!parsed.content.includes(`Memory namespace: ${input.agent.memoryNamespace}`)) {
      issues.push("projection trace missing memory namespace");
    }

    return {
      ...baseRow,
      persona: {
        targetPath,
        exists: true,
        active: actualActive,
        state: actualActive ? "active" : "paused",
        provider: readString(data.provider),
        adapterType: readString(data.adapterType),
        model: actualModel(data),
        manifestId: readString(harness?.manifestId),
        definitionId: readString(harness?.definitionId),
        projectedAt: readString(harness?.projectedAt),
      },
      status: issues.length === 0 ? "in_sync" : "drift_unknown",
      issues,
    };
  } catch (error) {
    return {
      ...baseRow,
      persona: { targetPath, exists: true },
      status: "drift_unknown",
      issues: [
        error instanceof Error
          ? `persona read failed: ${error.message}`
          : "persona read failed",
      ],
    };
  }
}

export async function buildAgentHarnessAdminSnapshot(
  options: BuildAgentHarnessAdminSnapshotOptions = {}
): Promise<AgentHarnessAdminSnapshot> {
  const manifest = options.manifest || OPTALE_META_AGENT_MANIFEST;
  const targetAgentsDir = path.resolve(
    options.targetAgentsDir || defaultAgentHarnessPersonaTargetDir()
  );

  const rows = await Promise.all(
    manifest.agents.map((agent) =>
      buildRow({
        manifest,
        agent,
        targetAgentsDir,
      })
    )
  );

  return {
    manifestId: manifest.id,
    manifestSchemaVersion: manifest.schemaVersion,
    targetAgentsDir,
    rows,
  };
}
