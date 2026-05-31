import fs from "fs/promises";
import os from "os";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { readConversationMeta } from "@/lib/agents/conversation-store";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import { DATA_DIR } from "@/lib/storage/path-utils";

/**
 * Reads Claude Code's on-disk session JSONL for a conversation and returns
 * it as clean, structured turns. Claude Code writes every session to:
 *
 *     ~/.claude/projects/<cwd-slug>/<session-uuid>.jsonl
 *
 * where <cwd-slug> is the absolute spawn cwd with every '/' replaced by '-'.
 * This is the native transcript — no ANSI, no box-drawing, no TUI chrome —
 * and it survives after the CLI exits. We use this to render a readable
 * transcript tab instead of replaying the broken-looking xterm output.
 *
 * Finding the right JSONL: we prefer the session.json `resumeId` captured by
 * the one-shot stream-json accumulator. When that isn't available (pure PTY
 * session mode never emits stream-json), we scan the slug directory for
 * .jsonl files whose first entry's `sessionId` / `timestamp` falls within
 * this task's [startedAt, completedAt+5min] window and pick the best match.
 */

interface ClaudeTranscriptTurn {
  role: "user" | "assistant";
  uuid: string;
  timestamp?: string;
  text: string;
  toolUses?: Array<{
    id?: string;
    name: string;
    input?: unknown;
  }>;
}

interface ClaudeTranscriptResponse {
  sessionId: string | null;
  jsonlPath: string | null;
  turns: ClaudeTranscriptTurn[];
  note?: string;
}

function cwdSlugFrom(cwd: string): string {
  // Claude Code normalizes the cwd to a directory name by replacing `/` with
  // `-`. Absolute paths thus produce a leading `-`.
  return cwd.replace(/\//g, "-");
}

function extractText(content: unknown): { text: string; toolUses: ClaudeTranscriptTurn["toolUses"] } {
  if (typeof content === "string") {
    return { text: content, toolUses: undefined };
  }
  if (!Array.isArray(content)) {
    return { text: "", toolUses: undefined };
  }
  const parts: string[] = [];
  const toolUses: NonNullable<ClaudeTranscriptTurn["toolUses"]> = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      parts.push(b.text);
    } else if (b.type === "tool_use" && typeof b.name === "string") {
      toolUses.push({
        id: typeof b.id === "string" ? b.id : undefined,
        name: b.name,
        input: b.input,
      });
    }
  }
  return {
    text: parts.join("\n\n"),
    toolUses: toolUses.length ? toolUses : undefined,
  };
}

async function parseJsonl(filePath: string): Promise<ClaudeTranscriptTurn[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const out: ClaudeTranscriptTurn[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = entry.type;
    if (type !== "user" && type !== "assistant") continue;
    const message = entry.message as Record<string, unknown> | undefined;
    if (!message) continue;
    const { text, toolUses } = extractText(message.content);
    if (!text && !toolUses?.length) continue;
    out.push({
      role: type,
      uuid: typeof entry.uuid === "string" ? entry.uuid : `${out.length}`,
      timestamp: typeof entry.timestamp === "string" ? entry.timestamp : undefined,
      text,
      toolUses,
    });
  }
  return out;
}

async function readFirstSessionIdFromJsonl(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (typeof entry.sessionId === "string") return entry.sessionId;
      } catch {
        continue;
      }
    }
  } catch {
    // file missing / unreadable
  }
  return null;
}

async function findJsonlForSession(opts: {
  cwd: string;
  sessionHintId?: string | null;
  startedAt?: string;
  completedAt?: string;
}): Promise<{ jsonlPath: string | null; sessionId: string | null; note?: string }> {
  const slug = cwdSlugFrom(opts.cwd);
  const projectDir = path.join(os.homedir(), ".claude", "projects", slug);
  let entries: string[];
  try {
    entries = await fs.readdir(projectDir);
  } catch {
    return {
      jsonlPath: null,
      sessionId: null,
      note: `No Claude Code project directory at ${projectDir}. Has the CLI ever run here?`,
    };
  }
  const jsonlFiles = entries.filter((name) => name.endsWith(".jsonl"));
  if (!jsonlFiles.length) {
    return {
      jsonlPath: null,
      sessionId: null,
      note: `No .jsonl files in ${projectDir}.`,
    };
  }

  // Prefer the session hint if it points at an existing file.
  if (opts.sessionHintId) {
    const guess = path.join(projectDir, `${opts.sessionHintId}.jsonl`);
    if (jsonlFiles.includes(`${opts.sessionHintId}.jsonl`)) {
      return { jsonlPath: guess, sessionId: opts.sessionHintId };
    }
  }

  // Fallback: scan by mtime, pick the one whose mtime is closest to but not
  // before startedAt. If startedAt is missing, pick the most recently
  // modified one.
  const withStats = await Promise.all(
    jsonlFiles.map(async (name) => {
      const full = path.join(projectDir, name);
      try {
        const stat = await fs.stat(full);
        return { name, full, mtime: stat.mtimeMs, size: stat.size };
      } catch {
        return null;
      }
    })
  );
  const valid = withStats.filter(
    (s): s is NonNullable<typeof s> => s !== null && s.size > 0
  );
  if (!valid.length) {
    return { jsonlPath: null, sessionId: null, note: "All candidate JSONL files were unreadable." };
  }

  const startMs = opts.startedAt ? Date.parse(opts.startedAt) : NaN;
  const endMs = opts.completedAt
    ? Date.parse(opts.completedAt) + 5 * 60 * 1000
    : Date.now();

  // If we have a valid time window, prefer files whose mtime falls within it.
  const inWindow = Number.isFinite(startMs)
    ? valid.filter((s) => s.mtime >= startMs && s.mtime <= endMs)
    : [];
  const pool = inWindow.length ? inWindow : valid;
  pool.sort((a, b) => b.mtime - a.mtime);
  const pick = pool[0];
  const sessionId = pick.name.replace(/\.jsonl$/, "");
  // Sanity: verify the JSONL's first sessionId matches the filename.
  const firstSessionId = await readFirstSessionIdFromJsonl(pick.full);
  return {
    jsonlPath: pick.full,
    sessionId: firstSessionId ?? sessionId,
    note: inWindow.length
      ? undefined
      : "Fell back to most-recent JSONL — no file mtime matched the task's time window.",
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cabinetPath = req.nextUrl.searchParams.get("cabinetPath") || undefined;

  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (meta.providerId !== "claude-code") {
    return NextResponse.json(
      {
        error: "Transcript is only available for claude-code tasks.",
        providerId: meta.providerId ?? null,
      },
      { status: 400 }
    );
  }

  // Resolve the cwd the CLI was spawned with. For cabinet-scoped tasks this
  // is the cabinet's absolute dir (daemon's resolveSessionCwd falls back to
  // DATA_DIR when no cwd was passed).
  const cwd = meta.cabinetPath
    ? resolveCabinetDir(meta.cabinetPath)
    : DATA_DIR;

  // Try session.json's resumeId first — written when the Claude stream-json
  // accumulator caught the session id during a one-shot run.
  let sessionHintId: string | null = null;
  try {
    const sessionJson = path.join(
      cwd,
      ".agents",
      ".conversations",
      id,
      "session.json"
    );
    const raw = await fs.readFile(sessionJson, "utf8");
    const parsed = JSON.parse(raw) as { resumeId?: string };
    if (parsed.resumeId) sessionHintId = parsed.resumeId;
  } catch {
    // no session.json / unreadable — fall back to mtime scan
  }

  const match = await findJsonlForSession({
    cwd,
    sessionHintId,
    startedAt: meta.startedAt,
    completedAt: meta.completedAt,
  });

  if (!match.jsonlPath) {
    const body: ClaudeTranscriptResponse = {
      sessionId: null,
      jsonlPath: null,
      turns: [],
      note: match.note,
    };
    return NextResponse.json(body);
  }

  try {
    const turns = await parseJsonl(match.jsonlPath);
    const body: ClaudeTranscriptResponse = {
      sessionId: match.sessionId,
      jsonlPath: match.jsonlPath,
      turns,
      note: match.note,
    };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to parse Claude JSONL",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
