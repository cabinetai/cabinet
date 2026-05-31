import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * `/api/agents/config/cli-mcp-servers` — read-only aggregator that surfaces
 * MCP servers the user has already configured in their Claude Code, Codex CLI,
 * and Gemini CLI configs. Cabinet only displays them; editing happens via the
 * CLIs themselves. Never writes to any of these files.
 */

export type McpServerEntry = {
  name: string;
  type?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  scope: "global" | "project";
  project?: string;
};

type ProviderResult = {
  id: "claude-code" | "codex-cli" | "gemini-cli";
  name: string;
  configPath: string;
  servers: McpServerEntry[];
  error?: string;
};

const HOME = os.homedir();
const CLAUDE_JSON = path.join(HOME, ".claude.json");
const CODEX_TOML = path.join(HOME, ".codex", "config.toml");
const GEMINI_JSON = path.join(HOME, ".gemini", "settings.json");

function tildify(p: string): string {
  return p.startsWith(HOME) ? "~" + p.slice(HOME.length) : p;
}

async function readJson(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

function normalizeMcpEntry(name: string, raw: unknown, scope: "global" | "project", project?: string): McpServerEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = typeof r.type === "string" ? r.type : undefined;
  const command = typeof r.command === "string" ? r.command : undefined;
  const args = Array.isArray(r.args) ? r.args.filter((a): a is string => typeof a === "string") : undefined;
  const url = typeof r.url === "string" ? r.url : undefined;
  const inferredType: McpServerEntry["type"] | undefined =
    type === "stdio" || type === "http" || type === "sse"
      ? type
      : url
        ? "http"
        : command
          ? "stdio"
          : undefined;
  return {
    name,
    type: inferredType,
    command,
    args,
    url,
    scope,
    project,
  };
}

async function readClaudeServers(): Promise<ProviderResult> {
  const result: ProviderResult = {
    id: "claude-code",
    name: "Claude Code",
    configPath: tildify(CLAUDE_JSON),
    servers: [],
  };
  try {
    const data = await readJson(CLAUDE_JSON);
    if (data === null) return result;
    if (!data || typeof data !== "object") {
      result.error = "Could not parse ~/.claude.json";
      return result;
    }
    const root = data as Record<string, unknown>;
    const globalMcps = root.mcpServers;
    if (globalMcps && typeof globalMcps === "object") {
      for (const [name, raw] of Object.entries(globalMcps)) {
        const entry = normalizeMcpEntry(name, raw, "global");
        if (entry) result.servers.push(entry);
      }
    }
    const projects = root.projects;
    if (projects && typeof projects === "object") {
      for (const [projectPath, projectVal] of Object.entries(projects)) {
        if (!projectVal || typeof projectVal !== "object") continue;
        const mcps = (projectVal as Record<string, unknown>).mcpServers;
        if (!mcps || typeof mcps !== "object") continue;
        for (const [name, raw] of Object.entries(mcps)) {
          const entry = normalizeMcpEntry(name, raw, "project", projectPath);
          if (entry) result.servers.push(entry);
        }
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Failed to read Claude config";
  }
  return result;
}

async function readGeminiServers(): Promise<ProviderResult> {
  const result: ProviderResult = {
    id: "gemini-cli",
    name: "Gemini CLI",
    configPath: tildify(GEMINI_JSON),
    servers: [],
  };
  try {
    const data = await readJson(GEMINI_JSON);
    if (data === null) return result;
    if (!data || typeof data !== "object") {
      result.error = "Could not parse ~/.gemini/settings.json";
      return result;
    }
    const mcps = (data as Record<string, unknown>).mcpServers;
    if (mcps && typeof mcps === "object") {
      for (const [name, raw] of Object.entries(mcps)) {
        const entry = normalizeMcpEntry(name, raw, "global");
        if (entry) result.servers.push(entry);
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Failed to read Gemini config";
  }
  return result;
}

/**
 * Hand-rolled extractor for `[mcp_servers.<name>]` blocks in Codex's
 * `~/.codex/config.toml`. Read-only display only — extracts `command`,
 * `args`, `url`, `type` from each block. If the file format gets richer,
 * swap in a real TOML parser.
 */
function parseCodexToml(toml: string): McpServerEntry[] {
  const servers: McpServerEntry[] = [];
  const lines = toml.split(/\r?\n/);
  let current: { name: string; lines: string[] } | null = null;
  const blocks: { name: string; lines: string[] }[] = [];
  const headerRe = /^\s*\[(?:mcp_servers|mcp\.servers)\.([^\]]+)\]\s*$/;
  const otherHeaderRe = /^\s*\[[^\]]+\]\s*$/;
  for (const line of lines) {
    const m = headerRe.exec(line);
    if (m) {
      if (current) blocks.push(current);
      current = { name: m[1].replace(/^"(.*)"$/, "$1"), lines: [] };
      continue;
    }
    if (otherHeaderRe.test(line)) {
      if (current) blocks.push(current);
      current = null;
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push(current);

  for (const block of blocks) {
    let command: string | undefined;
    let url: string | undefined;
    let type: McpServerEntry["type"] | undefined;
    let args: string[] | undefined;
    for (const raw of block.lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const cmdM = /^command\s*=\s*"([^"]*)"\s*$/.exec(line);
      if (cmdM) { command = cmdM[1]; continue; }
      const urlM = /^url\s*=\s*"([^"]*)"\s*$/.exec(line);
      if (urlM) { url = urlM[1]; continue; }
      const typeM = /^type\s*=\s*"([^"]*)"\s*$/.exec(line);
      if (typeM) {
        const t = typeM[1];
        if (t === "stdio" || t === "http" || t === "sse") type = t;
        continue;
      }
      const argsM = /^args\s*=\s*\[(.*)\]\s*$/.exec(line);
      if (argsM) {
        args = Array.from(argsM[1].matchAll(/"([^"]*)"/g)).map((x) => x[1]);
        continue;
      }
    }
    const inferredType = type ?? (url ? "http" : command ? "stdio" : undefined);
    servers.push({
      name: block.name,
      type: inferredType,
      command,
      args,
      url,
      scope: "global",
    });
  }
  return servers;
}

async function readCodexServers(): Promise<ProviderResult> {
  const result: ProviderResult = {
    id: "codex-cli",
    name: "Codex CLI",
    configPath: tildify(CODEX_TOML),
    servers: [],
  };
  try {
    let raw: string;
    try {
      raw = await fs.readFile(CODEX_TOML, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return result;
      throw err;
    }
    result.servers = parseCodexToml(raw);
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Failed to read Codex config";
  }
  return result;
}

export async function GET(): Promise<NextResponse> {
  const [claude, codex, gemini] = await Promise.all([
    readClaudeServers(),
    readCodexServers(),
    readGeminiServers(),
  ]);
  return NextResponse.json(
    { providers: [claude, codex, gemini] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
