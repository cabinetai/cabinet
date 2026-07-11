import { NextResponse, type NextRequest } from "next/server";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getCatalogEntry, type CatalogEntry } from "@/lib/agents/mcp-catalog";
import { readServerAuthDetail } from "@/lib/agents/claude-mcp-login";
import { claudeCodeProvider } from "@/lib/agents/providers/claude-code";
import { getRuntimePath, resolveCliCommand } from "@/lib/agents/provider-cli";

/**
 * On-demand "does this actually work?" probe.
 *
 * The cheap handshake (`readServerAuthDetail`) already proves the CLI can reach
 * the server with a valid token — that's what gates the connect flow. This goes
 * one step further and has the agent CALL a tool, so the user sees evidence in
 * their own words ("3 channels visible") rather than a green chip. It spawns an
 * agent, so it's behind a button, never on the connect path.
 *
 * SECURITY: the content this agent reads back (e.g. Slack channel history) is
 * untrusted — any workspace member can write a message that lands in the
 * model's context. A prompt only *asking* the model to stay within one MCP
 * server is not an enforcement boundary against injected instructions, so the
 * tool surface is bounded by the CLI itself, not by the prompt:
 *   - `--strict-mcp-config` + a single-server `--mcp-config` (read out of the
 *     CLI's own config, see `buildSingleServerMcpConfig`) means only THIS
 *     integration's server can even be reached — no other configured server
 *     (another integration, or anything the user registered themselves).
 *   - `--allowedTools mcp__<serverName>` allow-lists exactly that server's
 *     tools and nothing else.
 * No `--permission-mode` override is passed. `-p` (print/non-interactive) mode
 * has no TTY to prompt on, so anything NOT on the allow-list — every built-in
 * tool (Bash, Write, Edit, WebFetch, …) included — is auto-denied rather than
 * bypassed. (Verified live: with these flags a Slack MCP tool call succeeds,
 * while Bash/WebFetch calls are blocked outright, and an empty `--mcp-config`
 * connects zero servers even though other integrations are registered in the
 * CLI's real config.) Deliberately does NOT use `bypassPermissions` — that
 * flag skips ALL permission checks including the allow-list, which would
 * undo this bound entirely.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read this one server's entry out of Claude Code's own config (already
 * written by the connect flow) and wrap it in a minimal `--mcp-config`
 * document. Combined with `--strict-mcp-config`, this is what keeps the probe
 * from ever loading any *other* configured MCP server (Notion, GitHub, a
 * user's own servers, …) alongside the untrusted content.
 */
function buildSingleServerMcpConfig(entry: CatalogEntry): string | undefined {
  try {
    const claudeJsonPath = path.join(os.homedir(), ".claude.json");
    const raw = fs.readFileSync(claudeJsonPath, "utf8");
    const doc = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    const server = doc.mcpServers?.[entry.mcpServerName];
    if (!server) return undefined;
    return JSON.stringify({ mcpServers: { [entry.mcpServerName]: server } });
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, summary: "Invalid request body." }, { status: 400 });
  }
  const { id } = (body ?? {}) as { id?: string };
  const entry = id ? getCatalogEntry(id) : undefined;
  if (!entry) {
    return NextResponse.json({ ok: false, summary: "Unknown integration." }, { status: 400 });
  }

  // Never run an agent against a server that isn't even connected — the failure
  // would be a confusing agent transcript instead of the real reason.
  const { state, detail } = await readServerAuthDetail(
    entry.mcpServerName,
    entry.connectFailureHint,
  );
  if (state !== "authenticated") {
    return NextResponse.json({
      ok: false,
      summary: detail ?? "Not signed in yet. Click Connect & sign in first.",
    });
  }

  const mcpConfig = buildSingleServerMcpConfig(entry);
  if (!mcpConfig) {
    return NextResponse.json({
      ok: false,
      summary: "Couldn't read this integration's connection config. Try reconnecting.",
    });
  }

  const prompt =
    `Use ONLY the ${entry.mcpServerName} MCP tools. Report the signed-in account and ` +
    `how many channels/resources you can see, in ONE short sentence starting with "Connected as". ` +
    `If the tools error, reply with the exact error text and nothing else.`;

  const summary = await new Promise<string>((resolve) => {
    execFile(
      resolveCliCommand(claudeCodeProvider),
      [
        "-p",
        prompt,
        // Only load the MCP server we just built --mcp-config for, ignoring
        // every other server configured in the user's CLI (other integrations,
        // or anything they've registered themselves).
        "--strict-mcp-config",
        "--mcp-config",
        mcpConfig,
        // Allow-list exactly this server's tools. No --permission-mode is
        // passed, so in non-interactive -p mode everything else (every
        // built-in tool, and any tool from any other server) is auto-denied
        // rather than prompted for or bypassed.
        "--allowedTools",
        `mcp__${entry.mcpServerName}`,
        "--output-format",
        "text",
      ],
      { env: { ...process.env, PATH: getRuntimePath() }, timeout: 90_000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        const out = `${stdout ?? ""}`.trim();
        if (out) return resolve(out.split("\n").filter(Boolean).slice(-1)[0] ?? out);
        if (err) {
          // Never echo raw stderr to the client — it can contain internal
          // paths/config detail. Full detail stays server-side in the log.
          console.error(`[mcp-catalog/verify] ${entry.id} probe failed:`, stderr || err.message);
          return resolve("Couldn't complete the check. Try again in a moment.");
        }
        resolve("No response from the agent.");
      },
    );
  });

  return NextResponse.json({ ok: /^connected as/i.test(summary), summary });
}
