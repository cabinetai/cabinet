import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import { isHiddenEntry } from "@/lib/storage/path-utils";
import { readOptaleBrainCoreStatus } from "@/lib/optale/brain-core";
import {
  redactBrainCoreStatusForClient,
  type OptaleBrainAdapterBinding,
  type OptaleBrainPublicCoreStatus,
} from "@/lib/optale/brain-contracts";
import {
  callBrainAdapterMcpTool,
  clampBrainAdapterLimit,
  isBrainAdapterReadEnabled,
  redactBrainTextForClient,
  trimBrainAdapterString,
  type OptaleBrainAdapterReadOptions,
  type OptaleBrainDownstreamCall,
} from "@/lib/optale/brain-adapters";

export interface OptaleBrainVaultDocument {
  kind: "file";
  source: "local-vault";
  title: string;
  path: string;
  snippet: string;
  updatedAt: string;
  size: number;
  score: number;
}

export type OptaleBrainToolCallView = OptaleBrainDownstreamCall;

export interface OptaleBrainVaultResponse {
  version: 1;
  generatedAt: string;
  request: OptaleBrainPublicCoreStatus["request"];
  source: OptaleBrainAdapterBinding;
  query: string;
  limit: number;
  documents: OptaleBrainVaultDocument[];
  downstream: OptaleBrainToolCallView[];
  stats: {
    scannedLocalFiles: number;
    returnedLocalFiles: number;
    downstreamCalls: number;
    qmdEnabled: boolean;
  };
}

export type OptaleBrainVaultReadOptions = OptaleBrainAdapterReadOptions;

interface LocalVaultReadResult {
  documents: OptaleBrainVaultDocument[];
  scannedLocalFiles: number;
}

const MAX_LOCAL_FILES = 500;
const MAX_FILE_BYTES = 256 * 1024;

function virtualPath(cabinetPath: string, relativePath: string): string {
  const normalizedRelative = relativePath.replace(/\\/g, "/");
  if (cabinetPath === ROOT_CABINET_PATH) return normalizedRelative;
  return `${cabinetPath}/${normalizedRelative}`.replace(/\/+/g, "/");
}

export function titleFromVaultPath(filePath: string): string {
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
    line.toLowerCase().includes(lowerQuery)
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
  documents: OptaleBrainVaultDocument[];
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
    const title = titleFromContent(content, titleFromVaultPath(relativePath));
    const score = scoreFile({
      title,
      relativePath,
      content,
      query: input.query,
    });
    if (input.query && score <= 0) continue;

    input.documents.push({
      kind: "file",
      source: "local-vault",
      title,
      path: virtualPath(input.cabinetPath, relativePath),
      snippet: makeSnippet(content, input.query).slice(0, 420),
      updatedAt: stats.mtime.toISOString(),
      size: stats.size,
      score,
    });
  }
}

export async function readLocalVaultDocuments(input: {
  cabinetPath: string;
  query?: string | null;
  limit?: number;
}): Promise<LocalVaultReadResult> {
  const query = trimBrainAdapterString(input.query);
  const limit = clampBrainAdapterLimit(input.limit);
  const baseDir = resolveCabinetDir(input.cabinetPath);
  const scanned = { count: 0 };
  const documents: OptaleBrainVaultDocument[] = [];

  await walkMarkdownFiles({
    dir: baseDir,
    baseDir,
    cabinetPath: input.cabinetPath,
    query,
    documents,
    scanned,
  });

  return {
    scannedLocalFiles: scanned.count,
    documents: documents
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      })
      .slice(0, limit),
  };
}

export function redactBrainVaultTextForClient(text: string): string {
  return redactBrainTextForClient(text);
}

async function callDownstreamTool(input: {
  name: string;
  args: Record<string, unknown>;
  cabinetPath: string;
}): Promise<OptaleBrainToolCallView> {
  return callBrainAdapterMcpTool({
    adapterId: "vault",
    adapterName: "Optale Observatory Brain Vault",
    toolName: input.name,
    args: input.args,
    cabinetPath: input.cabinetPath,
  });
}

async function readQmdDownstream(input: {
  query: string;
  cabinetPath: string;
  limit: number;
}): Promise<OptaleBrainToolCallView[]> {
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
      })
    );
  }
  return Promise.all(calls);
}

function fallbackVaultSource(): OptaleBrainAdapterBinding {
  return {
    id: "vault",
    name: "Vault",
    kind: "vault",
    source: "native",
    status: "unconfigured",
    readOnly: true,
    scopes: ["company", "personal", "system"],
    permissions: [],
    rawPolicyPermissions: [],
    capabilities: ["read", "search", "draft-promotion"],
  };
}

export async function readOptaleBrainVault(
  options: OptaleBrainVaultReadOptions = {}
): Promise<OptaleBrainVaultResponse> {
  const cabinetPath =
    normalizeCabinetPath(options.cabinetPath, true) || ROOT_CABINET_PATH;
  const query = trimBrainAdapterString(options.query);
  const limit = clampBrainAdapterLimit(options.limit);
  const includeDownstream = options.includeDownstream !== false;

  const [coreStatus, local] = await Promise.all([
    readOptaleBrainCoreStatus({ cabinetPath }),
    readLocalVaultDocuments({ cabinetPath, query, limit }),
  ]);
  const publicCore = redactBrainCoreStatusForClient(coreStatus);
  const source =
    publicCore.sources.find((entry) => entry.id === "vault") || fallbackVaultSource();
  const qmdEnabled = isBrainAdapterReadEnabled(source);
  const downstream =
    includeDownstream && qmdEnabled
      ? await readQmdDownstream({ query, cabinetPath, limit })
      : [];

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    request: publicCore.request,
    source,
    query,
    limit,
    documents: local.documents,
    downstream,
    stats: {
      scannedLocalFiles: local.scannedLocalFiles,
      returnedLocalFiles: local.documents.length,
      downstreamCalls: downstream.length,
      qmdEnabled,
    },
  };
}
