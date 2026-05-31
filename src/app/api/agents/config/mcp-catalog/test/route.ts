import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { getCatalogEntry } from "@/lib/agents/mcp-catalog";

/**
 * `/api/agents/config/mcp-catalog/test` — validate a credential WITHOUT
 * saving anything, so the connect drawer can show ✓/✗ before the user
 * commits. Lightweight, time-boxed checks only.
 */

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function testDiscord(token: string): Promise<{ valid: boolean; detail: string }> {
  try {
    const res = await fetchWithTimeout("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.status === 200) {
      const me = (await res.json()) as { username?: string };
      return { valid: true, detail: me.username ? `Connected as ${me.username}` : "Token valid" };
    }
    if (res.status === 401) return { valid: false, detail: "Invalid bot token (401 Unauthorized)" };
    return { valid: false, detail: `Discord returned HTTP ${res.status}` };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { valid: false, detail: aborted ? "Discord did not respond in time" : "Could not reach Discord" };
  }
}

async function testServiceAccountFile(p: string): Promise<{ valid: boolean; detail: string }> {
  try {
    const raw = await fs.readFile(p, "utf8");
    const json = JSON.parse(raw) as Record<string, unknown>;
    const type = json.type;
    if (type === "service_account" || type === "authorized_user") {
      const who = typeof json.client_email === "string" ? ` (${json.client_email})` : "";
      return { valid: true, detail: `Valid Google credentials${who}` };
    }
    return { valid: false, detail: "JSON found but it is not a Google OAuth/service-account credential" };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { valid: false, detail: "No file at that path" };
    return { valid: false, detail: "File is not readable valid JSON" };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, credentials } = (body ?? {}) as {
    id?: unknown;
    credentials?: Record<string, string>;
  };
  if (typeof id !== "string" || !getCatalogEntry(id)) {
    return NextResponse.json({ error: "Unknown integration id" }, { status: 400 });
  }
  const creds = credentials && typeof credentials === "object" ? credentials : {};

  if (id === "discord") {
    const token = creds.DISCORD_TOKEN?.trim();
    if (!token) return NextResponse.json({ valid: false, detail: "Bot token required" });
    return NextResponse.json(await testDiscord(token));
  }

  if (id === "google-workspace") {
    const p = creds.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (!p) {
      return NextResponse.json({
        valid: false,
        detail: "Use Connect & sign in for one-click setup, or provide an OAuth client JSON path.",
      });
    }
    return NextResponse.json(await testServiceAccountFile(p));
  }

  // Slack official server is OAuth over HTTP — there is nothing to verify
  // pre-consent; the real check is that the CLI obtains a token at first use.
  return NextResponse.json({
    valid: true,
    detail:
      "This integration signs in through your agent's CLI. Connect, then approve access in the browser when prompted.",
  });
}
