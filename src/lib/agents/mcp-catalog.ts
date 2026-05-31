/**
 * Curated, approved catalog of MCP integrations surfaced in Settings →
 * Integrations.
 *
 * Cabinet agents have no in-process tool loop — they run by spawning external
 * CLIs (Claude Code default; also Gemini/Codex). Those CLIs are the MCP
 * clients: they read their own config file and connect the MCP servers listed
 * there (including remote HTTP servers, whose OAuth the CLI drives itself).
 * So "connecting" an integration means registering a server entry into the
 * active provider's CLI config + (for token servers) stashing a credential in
 * `.cabinet.env`. See `mcp-config-writer.ts`.
 *
 * Trust tiers are honest: `official` is only claimed when the server is
 * vendor-published / present in the Official MCP Registry, and that claim is
 * *verified* at runtime by `mcp-registry-verify.ts` (never self-asserted in
 * the UI without verification). Discord has no first-party server, so it is
 * `community`.
 *
 * Auth backends are deployment-aware (see `deployment-mode.ts`):
 *   - `cli-pkce`  — official remote HTTP server; the CLI performs PKCE
 *                   public-client OAuth. No secret ever ships in this OSS repo.
 *   - `user-app`  — fallback when a confidential client is unavoidable: the
 *                   user registers their own app; client id/secret live in
 *                   `.cabinet.env`, never written literally into CLI config.
 *   - `token`     — community stdio server authenticated by a pasted token.
 *   - `cabinet-broker` — reserved for the future cloud build (managed OAuth,
 *                   secret server-side). Not used by the local build.
 */

export type TrustTier = "official" | "registry" | "community";

export type AuthBackend = "cli-pkce" | "user-app" | "token" | "cabinet-broker";

export type McpTransport = "http" | "stdio";

export interface CatalogCredential {
  /** Env var name. Must satisfy cabinet-env's KEY_PATTERN (/^[A-Z][A-Z0-9_]*$/). */
  envKey: string;
  label: string;
  kind: "secret" | "filepath" | "plain";
  required: boolean;
  placeholder: string;
  /** Shown under the input in the connect drawer. */
  hint?: string;
}

export interface CatalogSetupStep {
  title: string;
  body: string;
  /** Optional copy-to-clipboard chip value (e.g. a scope list or a URL). */
  copy?: string;
  /** Optional external link the user opens to perform this step. */
  href?: string;
}

export interface CatalogEntry {
  id: string;
  label: string;
  /** One-line, outcome-focused. */
  blurb: string;
  /** integration-icon.tsx slug, used as the small-icon fallback. */
  iconSlug: string;
  /** Static asset paths under /public; UI falls back to the icon if absent. */
  bgImage: string;
  logo: string;
  /** Subtle "View source ↗" target. */
  sourceUrl: string;
  /**
   * Identifier looked up against the Official MCP Registry to *verify* the
   * Official/Registry badge. Undefined → community, never upgraded.
   */
  registryId?: string;
  /** Declared tier; the UI shows the *verified* tier, falling back to this offline. */
  trustTier: TrustTier;
  authBackend: AuthBackend;
  /** Used when authBackend can't run locally (confidential client, no PKCE). */
  fallbackAuthBackend?: AuthBackend;
  transport: McpTransport;
  /** Stable CLI-config key — `cabinet-` prefixed so we never touch user servers. */
  mcpServerName: string;
  /** http transport */
  url?: string;
  /** stdio transport */
  command?: string;
  args?: string[];
  /**
   * env block written into the CLI config for stdio servers. Values are
   * `${ENVKEY}` placeholders — the real secret stays only in `.cabinet.env`
   * and is resolved by the PTY env merge at spawn.
   */
  serverEnv?: Record<string, string>;
  /** Credentials collected for `token` / `user-app` backends. */
  credentials: CatalogCredential[];
  /** Display-only: what the agent can do once connected. */
  actions: string[];
  setupSteps: CatalogSetupStep[];
}

const SLACK: CatalogEntry = {
  id: "slack",
  label: "Slack",
  blurb: "Let agents search, read, and post across your Slack workspace.",
  iconSlug: "slack",
  bgImage: "/integrations/slack-bg.webp",
  logo: "/integrations/slack-logo.png",
  sourceUrl: "https://docs.slack.dev/ai/slack-mcp-server",
  registryId: "slack",
  trustTier: "official",
  authBackend: "cli-pkce",
  fallbackAuthBackend: "user-app",
  transport: "http",
  mcpServerName: "cabinet-slack",
  url: "https://mcp.slack.com/mcp",
  credentials: [
    {
      envKey: "SLACK_CLIENT_ID",
      label: "App Client ID",
      kind: "plain",
      required: true,
      placeholder: "1234567890.1234567890",
      hint: "Only needed for the fallback flow when one-click sign-in isn't available.",
    },
    {
      envKey: "SLACK_CLIENT_SECRET",
      label: "App Client Secret",
      kind: "secret",
      required: true,
      placeholder: "••••••••••••••••",
      hint: "Stored in .cabinet.env (0600). Never written into the CLI config.",
    },
  ],
  actions: [
    "Search messages, files, channels and users",
    "Read channel & thread history",
    "Send messages and create channels",
    "Create and read canvases",
  ],
  setupSteps: [
    {
      title: "Sign in with Slack",
      body: "Click Connect & sign in — your agent's CLI opens Slack in the browser. Approve the requested access and you're done. Most workspaces work with this one-click flow.",
    },
    {
      title: "If your workspace blocks one-click",
      body: "Some workspaces require their own Slack app. Create one, enable the listed user-token scopes, then paste its Client ID & Secret below.",
      href: "https://api.slack.com/apps",
    },
    {
      title: "Scopes to enable (own-app only)",
      body: "Add these user-token scopes so every tool works.",
      copy: "search:read.public search:read.private search:read.users files:read chat:write channels:history channels:read channels:write groups:history users:read reactions:write canvases:read canvases:write",
    },
  ],
};

const GOOGLE_WORKSPACE: CatalogEntry = {
  id: "google-workspace",
  label: "Google Workspace",
  blurb: "Gmail, Calendar and Drive — read, draft, schedule, and search.",
  iconSlug: "google-workspace",
  bgImage: "/integrations/google-workspace-bg.webp",
  logo: "/integrations/google-workspace-logo.webp",
  sourceUrl: "https://developers.google.com/workspace/guides/configure-mcp-servers",
  registryId: "google-workspace",
  trustTier: "official",
  authBackend: "cli-pkce",
  fallbackAuthBackend: "user-app",
  transport: "http",
  mcpServerName: "cabinet-google-workspace",
  // Google publishes per-product official servers; the Gmail endpoint is the
  // primary surface. Calendar/Drive can be added as sibling entries later.
  url: "https://mcp.gmail.google.com/mcp",
  credentials: [
    {
      envKey: "GOOGLE_APPLICATION_CREDENTIALS",
      label: "OAuth client JSON path",
      kind: "filepath",
      required: true,
      placeholder: "/Users/you/.config/cabinet/google-oauth.json",
      hint: "Absolute path to your OAuth client JSON. Shared with the Gemini provider — not deleted on disconnect.",
    },
  ],
  actions: [
    "Search & read Gmail, draft replies",
    "List & create Calendar events",
    "Search & read Drive files",
  ],
  setupSteps: [
    {
      title: "Sign in with Google",
      body: "Click Connect & sign in — your agent's CLI opens Google's consent screen. Grant access to Gmail / Calendar / Drive and you're connected.",
    },
    {
      title: "If you need your own GCP app",
      body: "For org-managed accounts: create a Google Cloud project, enable the Gmail, Calendar and Drive APIs, create an OAuth client (Desktop), download the JSON, and point the path below at it.",
      href: "https://developers.google.com/workspace/guides/configure-mcp-servers",
    },
  ],
};

const DISCORD: CatalogEntry = {
  id: "discord",
  label: "Discord",
  blurb: "Send messages and read channels in your Discord server.",
  iconSlug: "discord",
  bgImage: "/integrations/discord-bg.webp",
  logo: "/integrations/discord-logo.png",
  sourceUrl: "https://github.com/barryyip0625/mcp-discord",
  // No first-party Discord MCP server exists — honestly community-tier.
  trustTier: "community",
  authBackend: "token",
  transport: "stdio",
  mcpServerName: "cabinet-discord",
  command: "npx",
  args: ["-y", "mcp-discord"],
  serverEnv: { DISCORD_TOKEN: "${DISCORD_TOKEN}" },
  credentials: [
    {
      envKey: "DISCORD_TOKEN",
      label: "Bot token",
      kind: "secret",
      required: true,
      placeholder: "your bot token",
      hint: "Stored in .cabinet.env (0600). Never written into the CLI config.",
    },
  ],
  actions: ["Send messages to channels", "Read channel history", "Manage server content"],
  setupSteps: [
    {
      title: "Create a Discord application",
      body: "Open the Developer Portal, create a New Application, then add a Bot to it.",
      href: "https://discord.com/developers/applications",
    },
    {
      title: "Copy the bot token",
      body: "In the Bot tab, Reset Token, copy it, and paste it below.",
    },
    {
      title: "Enable Message Content Intent",
      body: "Under Bot → Privileged Gateway Intents, enable Message Content Intent so the bot can read messages.",
    },
    {
      title: "Invite the bot",
      body: "In OAuth2 → URL Generator pick the `bot` scope and the channel permissions you want, then open the generated URL to add it to your server.",
    },
  ],
};

export const MCP_CATALOG: CatalogEntry[] = [SLACK, GOOGLE_WORKSPACE, DISCORD];

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.id === id);
}

/**
 * Read-only "Built-in tools" — capabilities every agent has with no setup.
 * Surfaced as informational cards so users see the full picture alongside
 * connectable integrations.
 */
export interface BuiltInTool {
  id: string;
  label: string;
  description: string;
  /** lucide icon name resolved in the UI. */
  icon: string;
  /** Optional in-app link (e.g. the Skills page). */
  href?: string;
}

export const BUILT_IN_TOOLS: BuiltInTool[] = [
  {
    id: "slack-panel",
    label: "Cabinet Slack panel",
    description: "Agents post updates and read your team's internal Cabinet channels.",
    icon: "MessageSquare",
  },
  {
    id: "task-dispatch",
    label: "Task & job dispatch",
    description: "Agents can hand off work — launch tasks, schedule jobs, and queue future runs for other agents.",
    icon: "ListChecks",
  },
  {
    id: "skills",
    label: "Skills",
    description: "Installed skills extend what agents can do. Browse and manage them on the Skills page.",
    icon: "Sparkles",
    href: "#/skills",
  },
  {
    id: "files-shell",
    label: "Files & shell",
    description: "Read and write the knowledge base and run commands in the workspace.",
    icon: "Terminal",
  },
  {
    id: "web",
    label: "Web fetch & search",
    description: "Agents fetch pages and search the web for up-to-date information.",
    icon: "Globe",
  },
];
