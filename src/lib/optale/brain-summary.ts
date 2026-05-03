import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import { listConversationMetas } from "@/lib/agents/conversation-store";
import { getAllTasks } from "@/lib/agents/task-inbox";
import { readCabinetOverview } from "@/lib/cabinets/overview";
import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import { isHiddenEntry } from "@/lib/storage/path-utils";
import {
  readOptaleBrainSources,
  readOptaleMcpServers,
  type OptaleBrainSource,
} from "@/lib/optale/context-registry";
import { readOptaleMcpPolicy } from "@/lib/optale/mcp-policy";
import { readCabinetOptaleScope } from "@/lib/optale/scope-registry";
import {
  resolveOptaleBrainContext,
  type OptaleBrainContext,
} from "@/lib/optale/brain-context";
import { productBrainDownstreamName } from "@/lib/optale/brain-adapters";
import { resolveOptaleBrainMemoryConfig } from "@/lib/optale/brain-memory-config";
import { resolveOptaleBrainDreamsConfig } from "@/lib/optale/brain-dreams-config";

export type OptaleBrainSourceStatus = "enabled" | "blocked" | "unconfigured";

export interface OptaleBrainSourceSummary extends Omit<OptaleBrainSource, "mcpServerId"> {
  serverName: string;
  status: OptaleBrainSourceStatus;
  permissions: string[];
  toolGroups: string[];
  allowedTools: string[];
  deniedTools: string[];
}

export interface OptaleBrainSummary {
  generatedAt: string;
  cabinet: {
    path: string;
    name: string;
    scope: Awaited<ReturnType<typeof readCabinetOptaleScope>>;
  };
  context: OptaleBrainContext;
  counts: {
    files: number;
    markdown: number;
    memoryFiles: number;
    agents: number;
    jobs: number;
    tasks: number;
    conversations: number;
    runningConversations: number;
    pendingTasks: number;
    pendingActions: number;
  };
  mcpPolicy: {
    source: string;
    enforcementMode: string;
    defaultDecision: string;
    enabledServers: number;
    totalServers: number;
  };
  sources: OptaleBrainSourceSummary[];
}

interface FileCounts {
  files: number;
  markdown: number;
  memoryFiles: number;
}

async function walkVisibleFiles(dirPath: string): Promise<FileCounts> {
  const counts: FileCounts = { files: 0, markdown: 0, memoryFiles: 0 };
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return counts;
  }

  for (const entry of entries) {
    if (isHiddenEntry(entry.name)) continue;
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkVisibleFiles(entryPath);
      counts.files += nested.files;
      counts.markdown += nested.markdown;
      continue;
    }
    if (!entry.isFile()) continue;
    counts.files += 1;
    if (entry.name.toLowerCase().endsWith(".md")) counts.markdown += 1;
  }

  return counts;
}

async function countAgentMemoryFiles(cabinetDir: string): Promise<number> {
  const agentsDir = path.join(cabinetDir, ".agents");
  const candidates = [path.join(agentsDir, ".memory")];
  let count = 0;

  try {
    const agentEntries = await fs.readdir(agentsDir, { withFileTypes: true });
    for (const entry of agentEntries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      candidates.push(path.join(agentsDir, entry.name, "memory"));
    }
  } catch {
    // No agents directory yet.
  }

  for (const candidate of candidates) {
    try {
      count += await countMemoryFilesRecursive(candidate);
    } catch {
      // Directory may not exist yet.
    }
  }

  return count;
}

async function countMemoryFilesRecursive(dirPath: string): Promise<number> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  let count = 0;
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += await countMemoryFilesRecursive(entryPath);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      count += 1;
    }
  }
  return count;
}

function summarizeBrainSources(
  policy: Awaited<ReturnType<typeof readOptaleMcpPolicy>>,
  context: OptaleBrainContext
): OptaleBrainSourceSummary[] {
  const policyServers = new Map(policy.servers.map((server) => [server.serverId, server]));
  const registryServers = new Map(readOptaleMcpServers().map((server) => [server.id, server]));
  const memoryConfig = resolveOptaleBrainMemoryConfig(context);
  const dreamsConfig = resolveOptaleBrainDreamsConfig(context);

  return readOptaleBrainSources().map((source) => {
    const publicSource = {
      id: source.id,
      name: source.name,
      kind: source.kind,
      scopes: source.scopes,
      description: source.description
        .replace(/\bHoncho\b/g, "Sense Memory")
        .replace(/\bQMD\b/g, "Knowledge Search"),
    };

    if (!source.mcpServerId) {
      const enabled =
        (source.kind === "memory" && memoryConfig.enabled) ||
        (source.kind === "dreams" && dreamsConfig.enabled);
      const serverName =
        source.kind === "memory"
          ? "Sense Memory"
          : source.kind === "dreams"
            ? "Sense Dreams"
            : "Native adapter";
      return {
        ...publicSource,
        serverName,
        status: enabled ? "enabled" : "unconfigured",
        permissions:
          enabled && source.kind === "dreams"
            ? ["read", "write"]
            : enabled
              ? ["read"]
              : [],
        toolGroups:
          enabled && source.kind === "dreams"
            ? ["dream-review"]
            : enabled
              ? ["memory-read"]
              : [],
        allowedTools: [],
        deniedTools: [],
      };
    }

    const policyServer = policyServers.get(source.mcpServerId);
    const registryServer = registryServers.get(source.mcpServerId);
    const enabled =
      !!policyServer &&
      policyServer.enabled &&
      policyServer.scopes.includes(policy.scope) &&
      source.scopes.includes(policy.scope);
    const configured = registryServer?.status === "configured";

    return {
      ...publicSource,
      serverName: source.name,
      status: enabled ? "enabled" : configured ? "blocked" : "unconfigured",
      permissions: policyServer?.permissions || [],
      toolGroups: policyServer?.toolGroups || [],
      allowedTools: (policyServer?.allowedTools || []).map(productBrainDownstreamName),
      deniedTools: (policyServer?.deniedTools || []).map(productBrainDownstreamName),
    };
  });
}

export async function readOptaleBrainSummary(
  cabinetPath?: string
): Promise<OptaleBrainSummary> {
  const normalized = normalizeCabinetPath(cabinetPath, true) || ROOT_CABINET_PATH;
  const cabinetDir = resolveCabinetDir(normalized);
  const [overview, scope, policy, visibleFiles, memoryFiles, tasks, conversations] =
    await Promise.all([
      readCabinetOverview(normalized, { visibilityMode: "own" }),
      readCabinetOptaleScope(normalized),
      readOptaleMcpPolicy(normalized),
      walkVisibleFiles(cabinetDir),
      countAgentMemoryFiles(cabinetDir),
      getAllTasks(undefined, normalized),
      listConversationMetas({ cabinetPath: normalized, limit: 1000 }),
    ]);

  const pendingActions = conversations.reduce(
    (total, conversation) => total + (conversation.pendingActions?.length || 0),
    0
  );
  const enabledServers = policy.servers.filter(
    (server) => server.enabled && server.scopes.includes(policy.scope)
  ).length;
  const context = await resolveOptaleBrainContext(normalized, scope);

  return {
    generatedAt: new Date().toISOString(),
    cabinet: {
      path: normalized,
      name: overview.cabinet.name,
      scope,
    },
    context,
    counts: {
      files: visibleFiles.files,
      markdown: visibleFiles.markdown,
      memoryFiles,
      agents: overview.agents.length,
      jobs: overview.jobs.length,
      tasks: tasks.length,
      conversations: conversations.length,
      runningConversations: conversations.filter((conversation) => conversation.status === "running").length,
      pendingTasks: tasks.filter((task) => task.status === "pending").length,
      pendingActions,
    },
    mcpPolicy: {
      source: policy.source,
      enforcementMode: policy.enforcementMode,
      defaultDecision: policy.defaultDecision,
      enabledServers,
      totalServers: policy.servers.length,
    },
    sources: summarizeBrainSources(policy, context),
  };
}
