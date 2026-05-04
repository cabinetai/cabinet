import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import { isHiddenEntry } from "@/lib/storage/path-utils";
import { buildInternalOptaleMcpGatewayContext } from "@/lib/optale/mcp-gateway";
import {
  callOptaleMcpTool,
  type OptaleMcpToolCallResult,
} from "@/lib/optale/mcp-server";
import {
  parseBrainAdapterJson,
  productBrainDownstreamName,
  redactBrainTextForClient,
  redactBrainValueForClient,
  textFromBrainMcpToolResult,
} from "@/lib/optale/brain-adapters";
import { readOptaleCommandCenterSnapshot } from "@/lib/optale/command-center-control";
import { restrictedCustomerVisibilityMode } from "@/lib/optale/restricted-customer-mode";
import {
  resolveOptaleBrainContext,
  type OptaleBrainContext,
} from "@/lib/optale/brain-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExploreSource = "vault" | "graph";

interface VaultItem {
  kind: "file";
  title: string;
  path: string;
  snippet: string;
  updatedAt: string;
  size: number;
}

interface ToolCallView {
  name: string;
  ok: boolean;
  text: string;
  json?: unknown;
}

interface GraphNode {
  id: string;
  label: string;
  type: "space" | "agent" | "job" | "task" | "conversation" | "document";
  status?: string;
  meta?: Record<string, string | number | boolean>;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface DerivedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: Record<GraphNode["type"], number>;
}

interface ExploreResponse {
  generatedAt: string;
  cabinetPath: string;
  context: OptaleBrainContext;
  source: ExploreSource;
  query: string;
  items: VaultItem[];
  graph?: DerivedGraph;
  downstream: ToolCallView[];
}

const MAX_LOCAL_FILES = 500;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_DOWNSTREAM_TEXT = 8_000;

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseSource(value: string): ExploreSource {
  return value === "graph" ? "graph" : "vault";
}

function parseLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(Math.max(Math.trunc(parsed), 1), 50);
}

function virtualPath(cabinetPath: string, relativePath: string): string {
  const normalizedRelative = relativePath.replace(/\\/g, "/");
  if (cabinetPath === ROOT_CABINET_PATH) return normalizedRelative;
  return `${cabinetPath}/${normalizedRelative}`.replace(/\/+/g, "/");
}

function titleFromPath(filePath: string): string {
  return path.basename(filePath).replace(/\.md$/i, "").replace(/[-_]+/g, " ");
}

function titleFromContent(content: string, fallback: string): string {
  const match = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  const title = match?.[1]?.trim();
  return title || fallback;
}

function makeSnippet(content: string, query: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  if (!query) return lines.slice(0, 2).join(" ");

  const lowerQuery = query.toLowerCase();
  const hitIndex = lines.findIndex((line) =>
    line.toLowerCase().includes(lowerQuery),
  );
  if (hitIndex >= 0) {
    return lines.slice(Math.max(0, hitIndex - 1), hitIndex + 2).join(" ");
  }
  return lines.slice(0, 2).join(" ");
}

function scoreFile(input: {
  title: string;
  relativePath: string;
  content: string;
  query: string;
}): number {
  if (!input.query) return 1;
  const query = input.query.toLowerCase();
  const title = input.title.toLowerCase();
  const relativePath = input.relativePath.toLowerCase();
  const content = input.content.toLowerCase();
  let score = 0;
  if (title.includes(query)) score += 5;
  if (relativePath.includes(query)) score += 3;
  if (content.includes(query)) score += 1;
  return score;
}

async function walkMarkdownFiles(input: {
  dir: string;
  baseDir: string;
  cabinetPath: string;
  query: string;
  files: VaultItem[];
  scanned: { count: number };
}): Promise<void> {
  if (input.scanned.count >= MAX_LOCAL_FILES) return;

  let entries: Dirent[];
  try {
    entries = await fs.readdir(input.dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (input.scanned.count >= MAX_LOCAL_FILES) return;
    if (isHiddenEntry(entry.name)) continue;

    const fullPath = path.join(input.dir, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdownFiles({ ...input, dir: fullPath });
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;

    input.scanned.count += 1;
    const stats = await fs.stat(fullPath).catch(() => null);
    if (!stats || stats.size > MAX_FILE_BYTES) continue;

    const content = await fs.readFile(fullPath, "utf8").catch(() => "");
    const relativePath = path.relative(input.baseDir, fullPath);
    const title = titleFromContent(content, titleFromPath(relativePath));
    const score = scoreFile({
      title,
      relativePath,
      content,
      query: input.query,
    });
    if (input.query && score <= 0) continue;

    input.files.push({
      kind: "file",
      title,
      path: virtualPath(input.cabinetPath, relativePath),
      snippet: makeSnippet(content, input.query).slice(0, 420),
      updatedAt: stats.mtime.toISOString(),
      size: stats.size,
    });
  }
}

async function readLocalVault(input: {
  cabinetPath: string;
  query: string;
  limit: number;
}): Promise<VaultItem[]> {
  const baseDir = resolveCabinetDir(input.cabinetPath);
  const files: VaultItem[] = [];
  await walkMarkdownFiles({
    dir: baseDir,
    baseDir,
    cabinetPath: input.cabinetPath,
    query: input.query,
    files,
    scanned: { count: 0 },
  });

  return files
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, input.limit);
}

export function redactExploreContextForClient(
  context: OptaleBrainContext,
): OptaleBrainContext {
  return {
    ...context,
    dataRoot: "[server-side]",
    secretsRef: context.secretsRef ? "[configured]" : "",
  };
}

function renderDownstreamText(
  rawText: string,
  json: unknown | undefined,
): string {
  if (json !== undefined) {
    try {
      return JSON.stringify(json).slice(0, MAX_DOWNSTREAM_TEXT);
    } catch {
      return redactBrainTextForClient(rawText).slice(0, MAX_DOWNSTREAM_TEXT);
    }
  }
  return redactBrainTextForClient(rawText).slice(0, MAX_DOWNSTREAM_TEXT);
}

export function toolCallViewFromResult(
  name: string,
  result: OptaleMcpToolCallResult,
): ToolCallView {
  const rawText = textFromBrainMcpToolResult(result);
  const parsed = parseBrainAdapterJson(rawText);
  const json =
    parsed === undefined ? undefined : redactBrainValueForClient(parsed);
  return {
    name: productBrainDownstreamName(name),
    ok: result.isError !== true,
    text: renderDownstreamText(rawText, json),
    json,
  };
}

async function callDownstreamTool(input: {
  name: string;
  args: Record<string, unknown>;
  cabinetPath: string;
}): Promise<ToolCallView> {
  const gatewayContext = buildInternalOptaleMcpGatewayContext({
    clientId: "optale-observatory-ui",
    clientName: "Optale Observatory UI",
    defaultCabinetPath: input.cabinetPath,
    permissions: ["read"],
    canUseActions: false,
  });
  const result = await callOptaleMcpTool(input.name, input.args, {
    gatewayContext,
    includeDownstream: true,
    includeActions: false,
  });
  return toolCallViewFromResult(input.name, result);
}

async function readDownstream(input: {
  source: ExploreSource;
  query: string;
  cabinetPath: string;
  limit: number;
}): Promise<ToolCallView[]> {
  if (input.source === "vault") {
    const calls = [
      callDownstreamTool({
        name: "qmd__status",
        args: {},
        cabinetPath: input.cabinetPath,
      }),
    ];
    if (input.query) {
      calls.push(
        callDownstreamTool({
          name: "qmd__query",
          args: {
            searches: [
              { type: "lex", query: input.query },
              { type: "vec", query: input.query },
            ],
            limit: input.limit,
            rerank: false,
          },
          cabinetPath: input.cabinetPath,
        }),
      );
    }
    return Promise.all(calls);
  }

  const calls = [
    callDownstreamTool({
      name: "graphiti__get_status",
      args: {},
      cabinetPath: input.cabinetPath,
    }),
  ];
  if (input.query) {
    calls.push(
      callDownstreamTool({
        name: "graphiti__search_nodes",
        args: {
          query: input.query,
          max_nodes: input.limit,
        },
        cabinetPath: input.cabinetPath,
      }),
      callDownstreamTool({
        name: "graphiti__search_memory_facts",
        args: {
          query: input.query,
          max_facts: input.limit,
        },
        cabinetPath: input.cabinetPath,
      }),
    );
  } else {
    calls.push(
      callDownstreamTool({
        name: "graphiti__get_episodes",
        args: {
          max_episodes: input.limit,
        },
        cabinetPath: input.cabinetPath,
      }),
    );
  }
  return Promise.all(calls);
}

function addNode(nodes: Map<string, GraphNode>, node: GraphNode): string {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return node.id;
  }
  nodes.set(node.id, {
    ...existing,
    ...node,
    meta: { ...existing.meta, ...node.meta },
  });
  return node.id;
}

function addEdge(
  edges: GraphEdge[],
  source: string,
  target: string,
  label: string,
) {
  const id = `${source}->${label}->${target}`;
  if (edges.some((edge) => edge.id === id)) return;
  edges.push({ id, source, target, label });
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function agentLabel(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function readDerivedGraph(input: {
  cabinetPath: string;
  limit: number;
}): Promise<DerivedGraph> {
  const snapshot = await readOptaleCommandCenterSnapshot({
    cabinetPath: input.cabinetPath,
    visibilityMode: restrictedCustomerVisibilityMode("all"),
    limit: Math.max(25, input.limit * 4),
  });
  const documents = await readLocalVault({
    cabinetPath: input.cabinetPath,
    query: "",
    limit: input.limit,
  });

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const rootPath = snapshot.cabinet.path || input.cabinetPath;
  const ensureAgentNode = (cabinetPath: string, slug: string) =>
    addNode(nodes, {
      id: `agent:${cabinetPath}:${slug}`,
      label: agentLabel(slug),
      type: "agent",
      meta: { slug },
    });
  const rootId = addNode(nodes, {
    id: `space:${rootPath}`,
    label: snapshot.cabinet.name || rootPath,
    type: "space",
    meta: { path: rootPath },
  });

  for (const cabinet of snapshot.visibleCabinets.slice(0, input.limit)) {
    const nodeId = addNode(nodes, {
      id: `space:${cabinet.path}`,
      label: cabinet.name || cabinet.path,
      type: "space",
      meta: { path: cabinet.path, depth: cabinet.cabinetDepth ?? 0 },
    });
    if (nodeId !== rootId) addEdge(edges, rootId, nodeId, "contains");
  }

  for (const agent of snapshot.agents.slice(0, input.limit)) {
    const agentId = addNode(nodes, {
      id: `agent:${agent.cabinetPath}:${agent.slug}`,
      label: agent.displayName || agent.name || agent.slug,
      type: "agent",
      status: agent.active ? "active" : "inactive",
      meta: {
        slug: agent.slug,
        scope: agent.optaleScope?.scope || "company",
        tasks: agent.taskCount,
        jobs: agent.jobCount,
      },
    });
    addEdge(edges, `space:${agent.cabinetPath}`, agentId, "has agent");
  }

  for (const job of snapshot.jobs.slice(0, input.limit)) {
    const jobId = addNode(nodes, {
      id: `job:${job.cabinetPath}:${job.id}`,
      label: job.name || job.id,
      type: "job",
      status: job.enabled ? "enabled" : "disabled",
      meta: { schedule: job.schedule },
    });
    addEdge(edges, `space:${job.cabinetPath}`, jobId, "schedules");
    if (job.ownerAgent) {
      const agentId = ensureAgentNode(job.cabinetPath, job.ownerAgent);
      addEdge(edges, agentId, jobId, "owns job");
    }
  }

  for (const task of snapshot.tasks.slice(0, input.limit)) {
    const cabinetPath = task.cabinetPath || input.cabinetPath;
    const taskId = addNode(nodes, {
      id: `task:${cabinetPath}:${task.id}`,
      label: task.title || `Task ${shortId(task.id)}`,
      type: "task",
      status: task.status,
      meta: { priority: task.priority, to: task.toAgent, from: task.fromAgent },
    });
    addEdge(edges, `space:${cabinetPath}`, taskId, "has task");
    addEdge(
      edges,
      ensureAgentNode(cabinetPath, task.toAgent),
      taskId,
      "assigned",
    );
    if (task.fromAgent) {
      addEdge(
        edges,
        ensureAgentNode(cabinetPath, task.fromAgent),
        taskId,
        "created",
      );
    }
    for (const ref of task.kbRefs.slice(0, 3)) {
      const docId = addNode(nodes, {
        id: `document:${ref}`,
        label: titleFromPath(ref),
        type: "document",
        meta: { path: ref },
      });
      addEdge(edges, taskId, docId, "references");
    }
  }

  for (const conversation of snapshot.conversations.slice(0, input.limit)) {
    const cabinetPath = conversation.cabinetPath || input.cabinetPath;
    const conversationId = addNode(nodes, {
      id: `conversation:${cabinetPath}:${conversation.id}`,
      label: conversation.title || `Conversation ${shortId(conversation.id)}`,
      type: "conversation",
      status: conversation.status,
      meta: {
        trigger: conversation.trigger,
        agent: conversation.agentSlug,
      },
    });
    addEdge(edges, `space:${cabinetPath}`, conversationId, "has conversation");
    addEdge(
      edges,
      ensureAgentNode(cabinetPath, conversation.agentSlug),
      conversationId,
      "runs",
    );
    for (const ref of conversation.mentionedPaths.slice(0, 3)) {
      const docId = addNode(nodes, {
        id: `document:${ref}`,
        label: titleFromPath(ref),
        type: "document",
        meta: { path: ref },
      });
      addEdge(edges, conversationId, docId, "mentions");
    }
  }

  for (const document of documents) {
    const docId = addNode(nodes, {
      id: `document:${document.path}`,
      label: document.title,
      type: "document",
      meta: {
        path: document.path,
        size: document.size,
      },
    });
    addEdge(edges, rootId, docId, "indexes");
  }

  const list = Array.from(nodes.values());
  const counts = {
    space: list.filter((node) => node.type === "space").length,
    agent: list.filter((node) => node.type === "agent").length,
    job: list.filter((node) => node.type === "job").length,
    task: list.filter((node) => node.type === "task").length,
    conversation: list.filter((node) => node.type === "conversation").length,
    document: list.filter((node) => node.type === "document").length,
  };

  return {
    nodes: list.slice(0, Math.max(20, input.limit * 6)),
    edges: edges.slice(0, Math.max(30, input.limit * 8)),
    counts,
  };
}

export async function GET(request: NextRequest) {
  const source = parseSource(request.nextUrl.searchParams.get("source") || "");
  const query = trimString(request.nextUrl.searchParams.get("q"));
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const cabinetPath =
    normalizeCabinetPath(
      request.nextUrl.searchParams.get("cabinetPath") ||
        request.nextUrl.searchParams.get("path"),
      true,
    ) || ROOT_CABINET_PATH;

  const [context, items, graph, downstream] = await Promise.all([
    resolveOptaleBrainContext(cabinetPath),
    source === "vault"
      ? readLocalVault({ cabinetPath, query, limit })
      : Promise.resolve([]),
    source === "graph"
      ? readDerivedGraph({ cabinetPath, limit })
      : Promise.resolve(undefined),
    readDownstream({ source, query, cabinetPath, limit }),
  ]);

  const response: ExploreResponse = {
    generatedAt: new Date().toISOString(),
    cabinetPath,
    context: redactExploreContextForClient(context),
    source,
    query,
    items,
    graph,
    downstream,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
