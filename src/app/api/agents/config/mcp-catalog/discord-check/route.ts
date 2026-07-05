import { NextRequest, NextResponse } from "next/server";
import { readCabinetEnvFile } from "@/lib/runtime/cabinet-env";

/**
 * `/api/agents/config/mcp-catalog/discord-check`
 *
 * Live validation for the Discord connect panel: confirms the bot token works
 * and that the bot is actually a member of the configured server — the two
 * things that silently break a connection. Talks to Discord's REST API
 * directly (no discord.js in the main app); the bot token is read from
 * `.cabinet.env` unless the caller passes an as-yet-unsaved one to validate.
 *
 * Returns identifiers only (bot tag/id, guild name) — never the token.
 */

const API = "https://discord.com/api/v10";
const UA = "Cabinet (https://github.com/cabinetai/cabinet, discord-check)";
// View Channels + Read Message History + Send Messages + Create Public Threads
// + Send Messages in Threads + Add Reactions — matches the guide's invite.
const INVITE_PERMISSIONS = "292057844800";

function inviteUrl(botId: string): string {
  return `https://discord.com/oauth2/authorize?client_id=${botId}&scope=bot&permissions=${INVITE_PERMISSIONS}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { token?: unknown; guildId?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine — fall back to saved values */
  }

  const saved = readCabinetEnvFile().values;
  const token =
    (typeof body.token === "string" && body.token.trim()) || saved["DISCORD_TOKEN"] || "";
  const guildId =
    (typeof body.guildId === "string" && body.guildId.trim()) || saved["DISCORD_GUILD_ID"] || "";

  if (!token) {
    return NextResponse.json({ token: { ok: false, missing: true }, guild: { unknown: true } });
  }

  const headers = { Authorization: `Bot ${token}`, "User-Agent": UA };

  // 1. Token + bot identity.
  let botId = "";
  let botTag = "";
  try {
    const me = await fetch(`${API}/users/@me`, { headers });
    if (me.status === 401 || me.status === 403) {
      return NextResponse.json({ token: { ok: false, error: "Invalid bot token." }, guild: { unknown: true } });
    }
    if (!me.ok) {
      return NextResponse.json({
        token: { ok: false, error: `Discord returned ${me.status}.` },
        guild: { unknown: true },
      });
    }
    const u = (await me.json()) as {
      id: string;
      username: string;
      global_name?: string;
      discriminator?: string;
    };
    botId = u.id;
    botTag =
      u.discriminator && u.discriminator !== "0"
        ? `${u.username}#${u.discriminator}`
        : u.global_name || u.username;
  } catch {
    return NextResponse.json({
      token: { ok: false, error: "Couldn't reach Discord — check your connection." },
      guild: { unknown: true },
    });
  }

  const tokenResult = { ok: true, botTag, botId };

  if (!guildId) {
    return NextResponse.json({ token: tokenResult, guild: { skipped: true } });
  }

  // 2. Is the bot a member of the configured server?
  try {
    const gres = await fetch(`${API}/users/@me/guilds`, { headers });
    if (!gres.ok) {
      return NextResponse.json({ token: tokenResult, guild: { unknown: true } });
    }
    const guilds = (await gres.json()) as Array<{ id: string; name: string }>;
    const match = Array.isArray(guilds) ? guilds.find((g) => g.id === guildId) : undefined;
    if (match) {
      return NextResponse.json({ token: tokenResult, guild: { ok: true, name: match.name } });
    }
    return NextResponse.json({
      token: tokenResult,
      guild: { ok: false, error: "The bot hasn't been added to this server.", inviteUrl: inviteUrl(botId) },
    });
  } catch {
    return NextResponse.json({ token: tokenResult, guild: { unknown: true } });
  }
}
