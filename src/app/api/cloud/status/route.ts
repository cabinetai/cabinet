import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import path from "node:path";
import { cabinetTier, storageCapMb, storageUsedBytes } from "@/lib/cloud/tier";

// Surfaces whether this instance is the hosted (Cabinet Cloud) edition and, if
// so, whether Claude credentials have been provisioned yet. Drives the in-app
// "Connect Claude" banner. Only ever reports real detail in cloud mode; local /
// desktop installs get an inert `{ cloud: false }` and render nothing.

/** Where the host agent drops the tenant's Claude credentials in the container. */
function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || "/data/.claude-config";
}

/**
 * Claude is "connected" once EITHER credential artifact exists: `.oauth-token`
 * (from `claude setup-token`) or `.credentials.json` (from an interactive
 * login). Either is enough to run agents, so the banner clears on the first one.
 */
function isClaudeConnected(): boolean {
  const dir = claudeConfigDir();
  return (
    existsSync(path.join(dir, ".oauth-token")) ||
    existsSync(path.join(dir, ".credentials.json"))
  );
}

export async function GET() {
  const cloud = process.env.CABINET_CLOUD === "1";
  if (!cloud) {
    // Not the hosted edition — nothing to prompt for.
    return NextResponse.json({ cloud: false, claudeConnected: false, panelUrl: null });
  }
  return NextResponse.json({
    cloud: true,
    claudeConnected: isClaudeConnected(),
    panelUrl: process.env.CABINET_CLOUD_PANEL_URL || null,
    tier: cabinetTier(),
    storageCapMb: storageCapMb(),
    storageUsedBytes: await storageUsedBytes(),
  });
}
