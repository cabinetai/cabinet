import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "@/lib/storage/path-utils";
import {
  restrictedCapabilityDenial,
  restrictedModeDenialResponse,
} from "@/lib/optale/restricted-customer-mode";

const CONFIG_DIR = path.join(DATA_DIR, ".agents", ".config");
const INTEGRATIONS_FILE = path.join(CONFIG_DIR, "integrations.json");

export interface IntegrationConfig {
  mcp_servers: {
    [key: string]: {
      name: string;
      command: string;
      enabled: boolean;
      env: Record<string, string>;
      description?: string;
    };
  };
  notifications: {
    browser_push: boolean;
    telegram: {
      enabled: boolean;
      bot_token: string;
      chat_id: string;
    };
    slack_webhook: {
      enabled: boolean;
      url: string;
    };
    email: {
      enabled: boolean;
      frequency: "hourly" | "daily";
      to: string;
    };
  };
  scheduling: {
    max_concurrent_agents: number;
    default_heartbeat_interval: string;
    active_hours: string;
    pause_on_error: boolean;
  };
}

const DEFAULT_CONFIG: IntegrationConfig = {
  mcp_servers: {
    reddit: {
      name: "Reddit",
      command: "npx @mcp/reddit-server",
      enabled: false,
      env: { REDDIT_CLIENT_ID: "", REDDIT_CLIENT_SECRET: "" },
      description: "Search, post, reply, monitor subreddits",
    },
    linkedin: {
      name: "LinkedIn",
      command: "npx @mcp/linkedin-server",
      enabled: false,
      env: { LINKEDIN_ACCESS_TOKEN: "" },
      description: "Post, connect, message, scrape profiles",
    },
    github: {
      name: "GitHub",
      command: "npx @mcp/github-server",
      enabled: false,
      env: { GITHUB_TOKEN: "" },
      description: "Create PRs, review code, manage issues",
    },
    slack: {
      name: "Slack",
      command: "npx @mcp/slack-server",
      enabled: false,
      env: { SLACK_BOT_TOKEN: "" },
      description: "Post to real Slack, read channels",
    },
    email: {
      name: "Email (SMTP)",
      command: "npx @mcp/email-server",
      enabled: false,
      env: { SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "" },
      description: "Send, read, categorize emails",
    },
    gsheets: {
      name: "Google Sheets",
      command: "npx @mcp/gsheets-server",
      enabled: false,
      env: { GOOGLE_CREDENTIALS: "" },
      description: "Read/write spreadsheets",
    },
  },
  notifications: {
    browser_push: true,
    telegram: { enabled: false, bot_token: "", chat_id: "" },
    slack_webhook: { enabled: false, url: "" },
    email: { enabled: false, frequency: "daily", to: "" },
  },
  scheduling: {
    max_concurrent_agents: 10,
    default_heartbeat_interval: "*/15 * * * *",
    active_hours: "8-22",
    pause_on_error: true,
  },
};

export async function GET() {
  const restricted = restrictedModeDenialResponse(
    restrictedCapabilityDenial("mcp.manage"),
  );
  if (restricted) return restricted;

  try {
    const raw = await fs.readFile(INTEGRATIONS_FILE, "utf-8");
    const config = JSON.parse(raw);
    // Merge with defaults to ensure all fields exist
    const merged = {
      mcp_servers: { ...DEFAULT_CONFIG.mcp_servers, ...config.mcp_servers },
      notifications: { ...DEFAULT_CONFIG.notifications, ...config.notifications },
      scheduling: { ...DEFAULT_CONFIG.scheduling, ...config.scheduling },
    };
    return NextResponse.json(merged);
  } catch {
    return NextResponse.json(DEFAULT_CONFIG);
  }
}

export async function PUT(req: NextRequest) {
  const restricted = restrictedModeDenialResponse(
    restrictedCapabilityDenial("mcp.manage"),
  );
  if (restricted) return restricted;

  try {
    const body = await req.json();
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(INTEGRATIONS_FILE, JSON.stringify(body, null, 2), "utf-8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
