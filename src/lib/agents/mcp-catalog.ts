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
 * the UI without verification). `cabinet` = a first-party server we build and
 * maintain (e.g. Discord) — first-party but NOT vendor-official, so it gets its
 * own label rather than borrowing "official" or hiding under "community".
 * `vendor` = published by the vendor themselves (their domain, their OAuth) but
 * NOT listed in the Official MCP Registry, so the `official` badge can't be
 * verified and would be a claim we can't back. Calling it `community` would be
 * the opposite lie. It gets its own honest label.
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

import { buildSlackCreateUrl, buildSlackManifestJson } from "./slack-manifest";

export type TrustTier = "official" | "registry" | "vendor" | "cabinet" | "community";

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
  /**
   * Primary call-to-action — rendered as a filled button, not a text link. Use
   * for the one thing the user should click (e.g. Slack's prefilled create-app
   * deep link), never for secondary reading material.
   */
  action?: { label: string; href: string };
  /**
   * A make-or-break caveat, lifted out of the body prose so it can't be skimmed
   * past. `warning` = skip this and setup fails.
   */
  callout?: { tone: "warning" | "info"; body: string };
  /** Cropped screenshot of the real third-party control this step refers to. */
  image?: { src: string; alt: string; caption?: string; frameLabel?: string };
  /** Collapsed escape hatch for users who can't or won't use `action`. */
  fallback?: { summary: string; body: string; copy?: string };
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
  /** Display name of the publisher for the `vendor` tier — e.g. "Meta". */
  vendorName?: string;
  /**
   * Cannot be connected on Cabinet Cloud — sign-in needs a local terminal / desktop app on the
   * user's own machine (e.g. a CLI `login`, the Figma desktop app's local MCP server, `sf org
   * login`). The catalog route filters these out when `isCloud()`. Inert (undefined) off-cloud.
   */
  cloudUnsupported?: true;
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
   * Extra stdio args appended only when a given credential has a value in
   * `.cabinet.env`. Used for flags that apply to the "bring your own app" path
   * but would break the built-in/default path. Concrete case: Microsoft 365's
   * `--org-mode` unlocks the work/school-only Graph tools (Teams chat/channel,
   * SharePoint) — but those tools error on a personal account, so we only pass
   * it once the user has supplied their Entra Client ID (i.e. work mode).
   */
  argsWhenCredentialSet?: { credentialKey: string; args: string[] };
  /**
   * Relative path (from the repo root) to a first-party server's local build.
   * When it exists — i.e. Cabinet is running from source — the config writer
   * runs `node <abs path>` instead of `command`/`args`, so a not-yet-published
   * server still works in dev. Absent in packaged builds → falls back to npx.
   */
  localBuild?: string;
  /**
   * http entry whose URL comes from a user-supplied credential — per-account
   * remotes (Zapier, Make, ServiceNow) or bring-your-own community endpoints.
   * The value pasted into `.cabinet.env` becomes the server URL at connect.
   */
  urlCredentialKey?: string;
  /**
   * env block written into the CLI config for stdio servers. Values are
   * `${ENVKEY}` placeholders — the real secret stays only in `.cabinet.env`
   * and is resolved by the PTY env merge at spawn.
   */
  serverEnv?: Record<string, string>;
  /**
   * stdio servers that require an auxiliary config file on disk (Snowflake's
   * `--service-config-file`). At connect the writer materializes this file under
   * Cabinet's data dir and substitutes its absolute path for the `${CONFIG_FILE}`
   * token in `args`. Contents are static, secret-free policy (e.g. which tool
   * groups + SQL statement types are permitted) — real secrets stay in
   * `.cabinet.env` / `serverEnv`, never in this file.
   */
  configFile?: { name: string; contents: string };
  /**
   * Confidential OAuth client for remote (http) servers whose auth server does
   * NOT support Dynamic Client Registration (e.g. Slack). The user brings their
   * own app; we register its client id/secret with the CLI so OAuth can run
   * without DCR. `clientId` + `callbackPort` go into the CLI config; the secret
   * is handed to the CLI (stored in its keychain), never written into config.
   * The user must register `http://localhost:<callbackPort>/callback` as a
   * redirect URL on their app.
   */
  oauthClient?: {
    clientIdEnvKey: string;
    clientSecretEnvKey: string;
    callbackPort: number;
    /**
     * Pins the OAuth scopes requested at sign-in (space-separated), overriding
     * the larger set the server would otherwise discover. Lets the user's app
     * get away with a small, easy-to-grant scope set. Omit to request whatever
     * the server advertises.
     */
    scopes?: string;
  };
  /**
   * User-facing copy shown when `claude mcp get <server>` reports "failed to
   * connect" for a server that HAS a token (registered + authenticated, but
   * still rejected by the remote). Curated per integration because the CLI's
   * own output carries no vendor-specific reason (see `claude-mcp-login.ts`).
   * Omit for a neutral, vendor-agnostic fallback.
   */
  connectFailureHint?: string;
  /** Credentials collected for `token` / `user-app` backends. */
  credentials: CatalogCredential[];
  /** Display-only: what the agent can do once connected. */
  actions: string[];
  setupSteps: CatalogSetupStep[];
  /**
   * Opt-in: drive this stdio server's OWN browser OAuth at connect time (in the
   * daemon, keeping the server + its loopback alive across the human approval
   * step) instead of deferring to the first agent run — where the task times out
   * and the loopback dies before the user finishes. The stdio twin of the HTTP
   * connect-time login. See stdio-mcp-login.ts.
   */
  connectAuth?: {
    kind: "stdio-loopback";
    /** MCP tool whose call kicks off the OAuth flow and surfaces the URL. */
    triggerTool: string;
    /** Static args passed to the trigger tool. */
    triggerArgs?: Record<string, unknown>;
    /**
     * Args to spawn the server with FOR SIGN-IN ONLY (overrides `args`). Trim it
     * to just the trigger tool's service so the auth server boots fast — agents
     * still get the full `args`. The OAuth scope is set by the trigger tool, not
     * by which tools are registered, so this doesn't narrow what gets authorized.
     */
    authArgs?: string[];
    /** .cabinet.env key whose value is passed as the `user_google_email` arg. */
    emailEnvKey?: string;
    /** Dir (supports `~`) whose token-file presence means auth completed. */
    tokenDir: string;
  };
}

/**
 * Single source of truth for Slack's scopes. Feeds BOTH `oauthClient.scopes`
 * (what the CLI requests at sign-in) and the manifest (what the app is created
 * with). Widening the list here widens both — they cannot drift.
 *
 * Deliberately 6, not the ~26 Slack auto-adds when you flip the MCP toggle by
 * hand. The manifest path is what makes this small set achievable.
 */
const SLACK_SCOPES =
  "chat:write channels:read channels:history users:read search:read.public search:read.users";

const SLACK_CALLBACK_PORT = 8765;

const SLACK_MANIFEST_OPTIONS = {
  appName: "Cabinet",
  scopes: SLACK_SCOPES,
  callbackPort: SLACK_CALLBACK_PORT,
};

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
  // Slack's auth server doesn't support Dynamic Client Registration, so the
  // one-click `cli-pkce` flow can't work — the user must bring their own app
  // (client id/secret). user-app is the *only* path, not a fallback.
  authBackend: "user-app",
  transport: "http",
  mcpServerName: "cabinet-slack",
  url: "https://mcp.slack.com/mcp",
  // Slack's MCP server doesn't support Dynamic Client Registration, so OAuth
  // needs a pre-registered confidential client (the user's own Slack app). The
  // user registers http://localhost:8765/callback as a redirect URL.
  oauthClient: {
    clientIdEnvKey: "SLACK_CLIENT_ID",
    clientSecretEnvKey: "SLACK_CLIENT_SECRET",
    callbackPort: SLACK_CALLBACK_PORT,
    scopes: SLACK_SCOPES,
  },
  // Users of the 3-step flow above get the MCP toggle turned ON by
  // construction (the manifest sets `is_mcp_enabled`), so a "failed to
  // connect" on a registered + authenticated server is now most likely an
  // app that was never installed to the workspace, not the toggle.
  connectFailureHint:
    "Slack rejected the connection. Most likely the app hasn't been installed to your workspace yet, so go to OAuth & Permissions and click Install to Workspace. If it's already installed, check your app's MCP toggle under Features → Agents, then sign in again.",
  credentials: [
    {
      envKey: "SLACK_CLIENT_ID",
      label: "App Client ID",
      kind: "plain",
      required: true,
      placeholder: "1234567890.1234567890",
      hint: "From your Slack app's Basic Information page. Required, because Slack's MCP server needs your own app (it has no one-click sign-in).",
    },
    {
      envKey: "SLACK_CLIENT_SECRET",
      label: "App Client Secret",
      kind: "secret",
      required: true,
      placeholder: "••••••••••••••••",
      hint: "From the same Basic Information page. Stored in .cabinet.env (0600), never written into the CLI config.",
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
      title: "Create your Slack app",
      body: "Slack's MCP server has no one-click sign-in, so it needs an app you own. This button opens Slack with everything already filled in: pick your workspace, check the summary, and click Create.",
      action: { label: "Create my Slack app", href: buildSlackCreateUrl(SLACK_MANIFEST_OPTIONS) },
      callout: {
        tone: "warning",
        body: "Choose the workspace carefully. Slack won't let an app move to a different one later.",
      },
      image: {
        src: "/integrations/slack/01-create.png",
        alt: "Slack's review summary dialog showing User Scopes (6) and Redirect URLs (1), with a Create button",
        caption: "Slack shows you exactly what it's about to create: 6 scopes, one redirect URL.",
        frameLabel: "What you'll see in Slack",
      },
      fallback: {
        summary: "Prefer to paste it yourself?",
        body: "In Slack, choose Create an App → From a manifest, pick your workspace, and paste this:",
        copy: buildSlackManifestJson(SLACK_MANIFEST_OPTIONS),
      },
    },
    {
      title: "Install it into your workspace",
      body: "Slack drops you on your new app's page. Open OAuth & Permissions, click Install to Workspace (Slack shows your workspace's name on the button), then Allow.",
      image: {
        src: "/integrations/slack/02-install.png",
        alt: "Slack's permission review screen for the Cabinet app with Cancel and Allow buttons",
        caption: "Approving here is what gives your agents access.",
        frameLabel: "What you'll see in Slack",
      },
    },
    {
      title: "Paste your Client ID & Secret, then connect",
      body: "On the app's Basic Information page, copy the Client ID and Client Secret into the fields below, then click Connect & sign in and approve in your browser.",
      image: {
        src: "/integrations/slack/03-credentials.png",
        alt: "Slack's App Credentials panel showing Client ID and a masked Client Secret with a Show button",
        caption: "The Client Secret is hidden until you press Show.",
        frameLabel: "What you'll see in Slack",
      },
      callout: {
        tone: "info",
        body: "Both are stored in .cabinet.env (permissions 0600) on this device. The secret is never written into any config file.",
      },
    },
  ],
};

const GOOGLE_WORKSPACE: CatalogEntry = {
  id: "google-workspace",
  label: "Google Workspace",
  blurb: "Google Calendar, Contacts, Docs, Sheets, Slides, Tasks, Forms, Chat and Search via one Google sign-in.",
  iconSlug: "google-workspace",
  bgImage: "/integrations/google-workspace-bg.webp",
  logo: "/integrations/google-workspace-logo.webp",
  // Community server (taylorwilsdon/google_workspace_mcp, PyPI `workspace-mcp`),
  // run locally via uvx in single-user stdio mode. One Google sign-in covers
  // Calendar + Contacts + the rest of the productivity suite. Gmail and Drive
  // are intentionally excluded from `--tools` so this never overlaps the IMAP
  // Gmail + Drive-for-Desktop integrations (each keeps its own card/flow). We
  // deliberately do NOT use Google's official hosted `*mcp.googleapis.com`
  // servers: they're Developer Preview and gated to Claude.ai-web / Antigravity
  // clients, so a CLI-driven agent can't authenticate against them.
  sourceUrl: "https://github.com/taylorwilsdon/google_workspace_mcp",
  trustTier: "community",
  authBackend: "user-app",
  transport: "stdio",
  mcpServerName: "cabinet-google-workspace",
  command: "uvx",
  args: [
    "workspace-mcp",
    "--single-user",
    "--tools",
    "calendar",
    "contacts",
    "docs",
    "sheets",
    "slides",
    "tasks",
    "forms",
    "chat",
    "search",
  ],
  serverEnv: {
    GOOGLE_OAUTH_CLIENT_ID: "${GOOGLE_OAUTH_CLIENT_ID}",
    GOOGLE_OAUTH_CLIENT_SECRET: "${GOOGLE_OAUTH_CLIENT_SECRET}",
    USER_GOOGLE_EMAIL: "${USER_GOOGLE_EMAIL}",
    // Lets the server complete its loopback OAuth callback over plain http.
    OAUTHLIB_INSECURE_TRANSPORT: "1",
  },
  // Connect-time browser OAuth, driven by the daemon so the server's :8000
  // loopback stays alive across the human approval step (see stdio-mcp-login.ts).
  connectAuth: {
    kind: "stdio-loopback",
    // Use the dedicated auth helper, NOT a data tool: it always returns the
    // authorize URL. A data tool (e.g. list_calendars) skips OAuth when a token
    // already exists and instead calls the API, so it surfaces no URL.
    triggerTool: "start_google_auth",
    triggerArgs: { service_name: "Google Calendar" },
    // Boot the sign-in server with only Calendar so it starts fast (it requests
    // calendar scope regardless); agents still run the full --tools set above.
    authArgs: ["workspace-mcp", "--single-user", "--tools", "calendar"],
    emailEnvKey: "USER_GOOGLE_EMAIL",
    // workspace-mcp writes <email>.json here once OAuth completes.
    tokenDir: "~/.google_workspace_mcp/credentials",
  },
  credentials: [
    {
      envKey: "GOOGLE_OAUTH_CLIENT_ID",
      label: "Google OAuth Client ID",
      kind: "plain",
      required: true,
      placeholder: "1234567890-abc123.apps.googleusercontent.com",
      hint: "From a Google Cloud OAuth client (type: Web application) with redirect URI http://localhost:8000/oauth2callback, and the relevant APIs enabled (at minimum Calendar API and People API).",
    },
    {
      envKey: "GOOGLE_OAUTH_CLIENT_SECRET",
      label: "Google OAuth Client Secret",
      kind: "secret",
      required: true,
      placeholder: "GOCSPX-••••••••••••••••",
      hint: "Stored in .cabinet.env (0600). Never written into the CLI config.",
    },
    {
      envKey: "USER_GOOGLE_EMAIL",
      label: "Your Google email",
      kind: "plain",
      required: true,
      placeholder: "you@gmail.com",
      hint: "The Google account to authorize. Used as the sign-in hint when you connect.",
    },
  ],
  actions: [
    "Calendar: read agenda, create & update events, add Meet links",
    "Contacts: search & manage people",
    "Docs & Sheets: read, create & edit",
    "Slides, Tasks, Forms, Chat & programmable Search",
  ],
  setupSteps: [
    {
      title: "Install uv (one-time)",
      body: "The server runs locally through uvx, uv's tool runner (think npx, but for Python). Install uv, then restart Cabinet if it was already open. macOS or Linux: run `curl -LsSf https://astral.sh/uv/install.sh | sh` (or `brew install uv`). Windows: run `winget install --id=astral-sh.uv` (or use the PowerShell installer at the link below).",
      href: "https://docs.astral.sh/uv/getting-started/installation/",
    },
    {
      title: "Create a Google OAuth client",
      body: "In Google Cloud Console: pick or create a project, enable the APIs for the services you'll use (at minimum the Google Calendar API and People API for contacts), then create an OAuth client of type \"Web application\" and add http://localhost:8000/oauth2callback under Authorized redirect URIs. Paste its Client ID and Secret into the fields below.",
      href: "https://console.cloud.google.com/apis/credentials",
    },
    {
      title: "Add yourself as a test user",
      body: "On the OAuth consent screen, add your Google account under \"Test users\" so sign-in works while the app is unverified.",
      href: "https://console.cloud.google.com/apis/credentials/consent",
    },
    {
      title: "Connect & authorize",
      body: "Click Connect. Cabinet opens Google's consent screen in your browser, keeps the local callback server alive while you approve it, and then marks the Workspace suite as connected.",
    },
  ],
};

const NOTION: CatalogEntry = {
  id: "notion",
  label: "Notion",
  blurb: "Search, read, and update your Notion pages and databases.",
  iconSlug: "notion",
  bgImage: "/integrations/notion-bg.webp",
  logo: "/logos/notion.svg",
  sourceUrl: "https://developers.notion.com/guides/mcp/get-started-with-mcp",
  // Official hosted server (mcp.notion.com). OAuth-only — no bearer token — so
  // the CLI drives a one-click public-client OAuth; nothing to paste.
  registryId: "notion",
  trustTier: "official",
  authBackend: "cli-pkce",
  transport: "http",
  mcpServerName: "cabinet-notion",
  url: "https://mcp.notion.com/mcp",
  credentials: [],
  actions: [
    "Search across your workspace",
    "Read & create pages",
    "Query & update databases",
    "Add comments",
  ],
  setupSteps: [
    {
      title: "Connect Notion",
      body: "Click Connect to register Notion. The first time an agent uses it, its CLI opens Notion in the browser. Approve access and pick which pages or databases to share.",
    },
    {
      title: "Choose what to share",
      body: "Access is scoped to exactly the pages/databases you select while authorizing. You can change this anytime in Notion → Settings → Connections.",
      href: "https://www.notion.so/my-integrations",
    },
  ],
};

const GITHUB: CatalogEntry = {
  id: "github",
  label: "GitHub",
  blurb: "Search and act on your repos, issues, and pull requests.",
  iconSlug: "github",
  bgImage: "/integrations/github-bg.webp",
  logo: "/logos/github.svg",
  sourceUrl: "https://github.com/github/github-mcp-server",
  // Official GitHub remote MCP server; the CLI performs GitHub OAuth on first
  // use (a fine-grained PAT fallback can be added later as a user-app cred).
  registryId: "github",
  trustTier: "official",
  authBackend: "cli-pkce",
  transport: "http",
  mcpServerName: "cabinet-github",
  url: "https://api.githubcopilot.com/mcp/",
  credentials: [],
  actions: [
    "Search code, issues & PRs",
    "Read & comment on issues and PRs",
    "Open issues and pull requests",
    "Read file contents & repo metadata",
  ],
  setupSteps: [
    {
      title: "Sign in with GitHub",
      body: "Click Connect & sign in. Your agent's CLI opens GitHub in the browser. Authorize access and choose which organizations/repositories to grant.",
    },
    {
      title: "Scope the access",
      body: "Grant only the orgs/repos the agent needs. Review or revoke anytime in GitHub → Settings → Applications.",
      href: "https://github.com/settings/applications",
    },
  ],
};

const LINEAR: CatalogEntry = {
  id: "linear",
  label: "Linear",
  blurb: "Create, search, and update Linear issues and projects.",
  iconSlug: "linear",
  bgImage: "/integrations/linear-bg.webp",
  logo: "/logos/linear.webp",
  sourceUrl: "https://linear.app/docs/mcp",
  registryId: "linear",
  trustTier: "official",
  authBackend: "cli-pkce",
  transport: "http",
  mcpServerName: "cabinet-linear",
  url: "https://mcp.linear.app/mcp",
  credentials: [],
  actions: [
    "Search issues & projects",
    "Create & update issues",
    "Comment and manage cycles",
    "Summarize project status",
  ],
  setupSteps: [
    {
      title: "Sign in with Linear",
      body: "Click Connect & sign in. Your agent's CLI opens Linear in the browser. Approve access to your workspace.",
    },
  ],
};

const ATLASSIAN: CatalogEntry = {
  id: "jira",
  label: "Jira & Confluence",
  blurb: "Search and act on Jira issues and Confluence pages.",
  iconSlug: "jira",
  bgImage: "/integrations/jira-bg.webp",
  logo: "/logos/jira.webp",
  // One official Atlassian remote server covers both Jira and Confluence.
  sourceUrl: "https://www.atlassian.com/platform/remote-mcp-server",
  registryId: "atlassian",
  trustTier: "official",
  authBackend: "cli-pkce",
  transport: "http",
  mcpServerName: "cabinet-atlassian",
  url: "https://mcp.atlassian.com/v1/mcp",
  credentials: [],
  actions: [
    "Search Jira issues & Confluence pages",
    "Create & update issues",
    "Draft & edit Confluence pages",
    "Summarize and bulk-manage",
  ],
  setupSteps: [
    {
      title: "Sign in with Atlassian",
      body: "Click Connect & sign in. Your agent's CLI opens Atlassian in the browser. Approve access to your Jira / Confluence site.",
    },
  ],
};

const STRIPE: CatalogEntry = {
  id: "stripe",
  label: "Stripe",
  blurb: "Query payments, customers, and invoices, and take action.",
  iconSlug: "stripe",
  bgImage: "/integrations/stripe-bg.webp",
  logo: "/logos/stripe.svg",
  sourceUrl: "https://docs.stripe.com/mcp",
  registryId: "stripe",
  trustTier: "official",
  authBackend: "cli-pkce",
  transport: "http",
  mcpServerName: "cabinet-stripe",
  url: "https://mcp.stripe.com",
  credentials: [],
  actions: [
    "Search customers, payments & invoices",
    "Create payment links & invoices",
    "Issue refunds",
    "Read balances & disputes",
  ],
  setupSteps: [
    {
      title: "Sign in with Stripe",
      body: "Click Connect & sign in. Your agent's CLI opens Stripe in the browser and authorizes access (scoped by a restricted key under the hood).",
    },
  ],
};

const MICROSOFT_365: CatalogEntry = {
  id: "microsoft-365",
  label: "Microsoft 365",
  blurb: "Outlook mail & calendar, Teams, and SharePoint / OneDrive via Microsoft Graph.",
  iconSlug: "microsoft-365",
  bgImage: "/integrations/microsoft-365-bg.webp",
  logo: "/logos/microsoft-365.svg",
  // Microsoft's official MCP servers are gated to Agent 365 / Copilot Studio, so
  // we register the MIT community Graph server (covers Outlook/Teams/SharePoint).
  // Swap to an official public remote when one lands — the AuthBackend
  // abstraction makes that a near-no-op. Env var names follow ms-365-mcp-server.
  sourceUrl: "https://github.com/softeria/ms-365-mcp-server",
  trustTier: "community",
  authBackend: "user-app",
  transport: "stdio",
  mcpServerName: "cabinet-microsoft-365",
  command: "npx",
  args: ["-y", "@softeria/ms-365-mcp-server"],
  // Work/school only: --org-mode exposes the Teams/SharePoint Graph tools. Gated
  // on the Entra Client ID so personal accounts (built-in app, no creds) don't
  // get org-only tools that would just error.
  argsWhenCredentialSet: { credentialKey: "MS365_MCP_CLIENT_ID", args: ["--org-mode"] },
  serverEnv: {
    MS365_MCP_CLIENT_ID: "${MS365_MCP_CLIENT_ID}",
    MS365_MCP_TENANT_ID: "${MS365_MCP_TENANT_ID}",
    MS365_MCP_CLIENT_SECRET: "${MS365_MCP_CLIENT_SECRET}",
  },
  // Credentials are OPTIONAL: leave them blank for a personal Outlook.com
  // account and the server uses its built-in app + device-code sign-in (the
  // connect panel's "Personal account" mode). Fill them to use your own Entra
  // app ("Work / school" mode). The config writer omits any unset placeholder
  // so blank values never override the built-in default.
  credentials: [
    {
      envKey: "MS365_MCP_CLIENT_ID",
      label: "Azure app Client ID",
      kind: "plain",
      required: false,
      placeholder: "00000000-0000-0000-0000-000000000000",
      hint: "Work/school only: from your Microsoft Entra (Azure AD) app registration. Leave blank for a personal account.",
    },
    {
      envKey: "MS365_MCP_TENANT_ID",
      label: "Tenant ID",
      kind: "plain",
      required: false,
      placeholder: "common (or your tenant id)",
      hint: "Use 'common' for multi-tenant, or your directory (tenant) id.",
    },
    {
      envKey: "MS365_MCP_CLIENT_SECRET",
      label: "Client Secret",
      kind: "secret",
      required: false,
      placeholder: "••••••••",
      hint: "Saved securely on this device only, never uploaded.",
    },
  ],
  actions: [
    "Read & send Outlook mail",
    "Manage Calendar events",
    "Read & post Teams messages",
    "Browse SharePoint & OneDrive files",
  ],
  setupSteps: [
    {
      title: "Register a Microsoft Entra app",
      body: "Azure Portal → App registrations → New registration. Note the Application (client) ID and Directory (tenant) ID.",
      href: "https://portal.azure.com",
    },
    {
      title: "Add Microsoft Graph permissions",
      body: "API permissions → Microsoft Graph → Delegated. Add the scopes for what you need, then grant admin consent.",
      copy: "Mail.ReadWrite Calendars.ReadWrite Chat.ReadWrite Sites.Read.All Files.Read.All",
    },
    {
      title: "Create a client secret",
      body: "Certificates & secrets → New client secret → copy the value, then paste the Client ID, Tenant ID, and Secret below.",
    },
  ],
};

const TELEGRAM: CatalogEntry = {
  id: "telegram",
  label: "Telegram",
  blurb:
    "Send messages, react, and manage the chats your bot is in. Allowlist yourself to drive Cabinet from Telegram: run agents and search your knowledge base from your phone.",
  iconSlug: "telegram",
  bgImage: "/integrations/telegram-bg.webp",
  logo: "/logos/telegram.svg",
  // No official MCP; community ones are MTProto (full user-account). We ship our
  // own Bot-API server (mcps/mcp-telegram/) — safe-by-default, like Discord.
  sourceUrl: "https://github.com/cabinetai/cabinet/tree/main/mcps/mcp-telegram",
  trustTier: "cabinet",
  authBackend: "token",
  transport: "stdio",
  mcpServerName: "cabinet-telegram",
  command: "npx",
  args: ["-y", "cabinet-mcp-telegram@0.1.0"],
  localBuild: "mcps/mcp-telegram/dist/index.js",
  serverEnv: { TELEGRAM_BOT_TOKEN: "${TELEGRAM_BOT_TOKEN}" },
  credentials: [
    {
      envKey: "TELEGRAM_BOT_TOKEN",
      label: "Bot token",
      kind: "secret",
      required: true,
      placeholder: "123456:ABC-DEF…",
      hint: "Saved securely on this device only, never uploaded.",
    },
    {
      envKey: "TELEGRAM_CHAT_ID",
      label: "Chat ID or @username (recommended)",
      kind: "plain",
      required: false,
      placeholder: "@yourchannel or -1001234567890",
      hint: "Pins every action to this one chat so the bot can't touch other chats it's in.",
    },
    {
      envKey: "TELEGRAM_ALLOWED_USERS",
      label: "Remote control: allowed user IDs",
      kind: "plain",
      required: false,
      placeholder: "123456789, 987654321",
      hint: "Numeric Telegram user IDs allowed to drive Cabinet from Telegram (message @userinfobot to find yours). Leave empty to keep remote control off.",
    },
    {
      envKey: "TELEGRAM_DEFAULT_AGENT",
      label: "Remote control: default agent (optional)",
      kind: "plain",
      required: false,
      placeholder: "brain",
      hint: "Agent slug that handles plain messages from Telegram. Empty = auto-pick an orchestrator.",
    },
  ],
  actions: [
    "Send messages & announcements",
    "Reply in topics / threads",
    "React to messages",
    "Edit or delete the bot's own messages",
    "Remote control: run agents & search Cabinet from Telegram",
  ],
  setupSteps: [
    {
      title: "Create a bot with @BotFather",
      body: "Open @BotFather in Telegram → /newbot → choose a name and username → copy the bot token it gives you.",
      href: "https://t.me/BotFather",
    },
    {
      title: "Paste the bot token",
      body: "Paste the token below. It's stored only on this device.",
    },
    {
      title: "Add the bot to your chat",
      body: "Add the bot to your group or channel (make it an admin if it needs to post to a channel). The bot only ever sees chats it's added to.",
    },
    {
      title: "Scope it to one chat (recommended)",
      body: "Paste your chat's id or @username so every action is pinned there. Group ids are negative numbers, e.g. -1001234567890.",
    },
    {
      title: "Allow yourself to drive Cabinet (optional)",
      body: "Message @userinfobot to get your numeric Telegram user id and paste it into the allowed-users field. Then DM your bot: plain messages run your orchestrator agent, /search queries the knowledge base, /help lists everything.",
      href: "https://t.me/userinfobot",
    },
  ],
};

const DISCORD: CatalogEntry = {
  id: "discord",
  label: "Discord",
  blurb: "Send messages, read channels, and manage threads in your Discord server.",
  iconSlug: "discord",
  bgImage: "/integrations/discord-bg.webp",
  logo: "/integrations/discord-logo.png",
  // Cabinet maintains its own server (mcps/mcp-discord/ in this repo): Discord has no
  // first-party MCP, and the community ones hand the model 60–139 tools incl.
  // destructive admin by default. Ours is a curated read+post+threads surface
  // with admin gated behind DISCORD_ALLOW_ADMIN. Tier `cabinet` = first-party,
  // Cabinet-maintained (distinct from vendor-`official`). The server is released
  // on its own cadence (NOT coupled to the app's CI) — bump this pin when a new
  // cabinet-mcp-discord is published to npm.
  sourceUrl: "https://github.com/cabinetai/cabinet/tree/main/mcps/mcp-discord",
  trustTier: "cabinet",
  authBackend: "token",
  transport: "stdio",
  mcpServerName: "cabinet-discord",
  command: "npx",
  args: ["-y", "cabinet-mcp-discord@0.1.0"],
  localBuild: "mcps/mcp-discord/dist/index.js",
  serverEnv: { DISCORD_TOKEN: "${DISCORD_TOKEN}" },
  credentials: [
    {
      envKey: "DISCORD_TOKEN",
      label: "Bot token",
      kind: "secret",
      required: true,
      placeholder: "your bot token",
      hint: "Saved securely on this device only, never uploaded.",
    },
    {
      envKey: "DISCORD_GUILD_ID",
      label: "Server ID (recommended)",
      kind: "plain",
      required: false,
      placeholder: "123456789012345678",
      hint: "Pins every action to this one server so the bot can't touch other servers it's in. Enable Developer Mode, then right-click your server → Copy Server ID.",
    },
  ],
  actions: [
    "Read channel history & search recent messages",
    "Send messages and reply in threads",
    "Create threads and add reactions",
    "Edit or delete the bot's own messages",
  ],
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
      body: "Under Bot → Privileged Gateway Intents, enable Message Content Intent so the bot can read message text. Leave Server Members off; Cabinet's server never lists members.",
    },
    {
      title: "Invite the bot to your server",
      body: "Open OAuth2 → URL Generator. Tick the `bot` scope, then under Bot Permissions tick what it needs (View Channels, Read Message History, Send Messages, Create Public Threads, Add Reactions). Copy the URL it builds at the bottom, open it in a browser, choose your server, and click Authorize. (This step is easy to miss; the panel will warn you if the bot isn't in the server yet.)",
      href: "https://discord.com/developers/applications",
    },
    {
      title: "Copy your Server ID",
      body: "In Discord, open User Settings (the gear) → Advanced and turn on Developer Mode. Then right-click your server's icon on the far left and choose \"Copy Server ID\". Paste it into the Server ID box on the right.",
    },
  ],
};

const LINKEDIN: CatalogEntry = {
  id: "linkedin",
  label: "LinkedIn",
  blurb: "Research profiles & companies, search people and jobs, and run your own outreach.",
  iconSlug: "linkedin",
  bgImage: "/integrations/linkedin-bg.webp",
  logo: "/logos/linkedin.svg",
  // LinkedIn has no official MCP. This is the community Patchright-based server
  // (stickerdaniel/linkedin-mcp-server, PyPI `linkedin-scraper-mcp`): it drives a
  // real browser under YOUR own login rather than an API. Powerful but
  // unofficial, and scraping can run against LinkedIn's ToS — so `community`
  // tier, personal use. Auth is a local browser profile (~/.linkedin-mcp) created
  // by `--login`; there is no token/cookie to paste (env-var cookies were dropped
  // upstream 02/2026), hence empty credentials + no serverEnv. Runs via uvx, so
  // `uv` must be installed (flagged in the setup steps, like Salesforce's CLI).
  sourceUrl: "https://github.com/stickerdaniel/linkedin-mcp-server",
  trustTier: "community",
  // Auth is a `uvx …--login` browser profile created in a local terminal — no cloud path.
  cloudUnsupported: true,
  authBackend: "token",
  transport: "stdio",
  mcpServerName: "cabinet-linkedin",
  command: "uvx",
  args: ["linkedin-scraper-mcp"],
  credentials: [],
  actions: [
    "Research people & company profiles",
    "Search people and jobs by keyword + location",
    "Read your messaging inbox & conversations",
    "Send messages & connection requests on your own account",
  ],
  setupSteps: [
    {
      title: "Install uv (one-time)",
      body: "The LinkedIn server runs locally through uv. Install it once, then Cabinet can launch the server for your agents.",
      href: "https://docs.astral.sh/uv/getting-started/installation/",
      copy: "curl -LsSf https://astral.sh/uv/install.sh | sh",
    },
    {
      title: "Log in to LinkedIn once",
      body: "Run the login command in a terminal. A browser window opens. Sign in (handle any 2FA / captcha) and it saves a private session profile under ~/.linkedin-mcp on this device. Nothing to paste here.",
      copy: "uvx linkedin-scraper-mcp --login",
    },
    {
      title: "Connect",
      body: "Click Connect, and Cabinet registers the server with your agent's CLI. It drives your own logged-in session locally; your credentials never leave this device. It's an unofficial scraper for personal use, so mind LinkedIn's terms and go easy on volume.",
    },
  ],
};

/**
 * Meta's official hosted ads connector (beta, launched 2026-04-29).
 *
 * Public-client PKCE — `token_endpoint_auth_method: "none"`, so there is no
 * secret anywhere and nothing for the user to paste. Meta's DCR is allowlisted
 * by `client_name`: the Claude Code CLI registers fine under its own true name,
 * which is why this works. Gemini/Codex are refused by Meta — the entry ships
 * ungated anyway (see the spec), so connect succeeds via Claude Code but the
 * server won't work for those agents at runtime.
 *
 * No `registryId`: Meta never listed this in the Official MCP Registry, and a
 * generic id would substring-match a third party's listing and mint a false
 * Official badge. Hence `trustTier: "vendor"`.
 */
const META_ADS: CatalogEntry = {
  id: "meta-ads",
  label: "Meta Ads",
  blurb: "Report on, create, and manage Facebook & Instagram ad campaigns.",
  iconSlug: "meta-ads",
  bgImage: "/integrations/meta-ads-bg.webp",
  logo: "/logos/facebook.svg",
  sourceUrl: "https://www.facebook.com/business/news/meta-ads-ai-connectors",
  trustTier: "vendor",
  vendorName: "Meta",
  authBackend: "cli-pkce",
  transport: "http",
  mcpServerName: "cabinet-meta-ads",
  url: "https://mcp.facebook.com/ads",
  credentials: [],
  actions: [
    "Pull insights, benchmarks & performance trends",
    "Create campaigns, ad sets, ads & creatives",
    "Activate campaigns and boost posts (spends budget)",
    "Manage catalogs, product feeds & pixels",
    "Build & update custom audiences",
  ],
  setupSteps: [
    {
      title: "Requires the Claude Code provider",
      body: "Meta's connector only admits the Claude Code CLI. Agents running on Gemini or Codex can't authenticate with it, so switch the agent's provider to Claude Code before connecting.",
    },
    {
      title: "Sign in with Meta",
      body: "Click Connect & sign in: your agent's CLI opens Meta in the browser to authorize your ad account. No developer app, no App Review, nothing to paste.",
    },
    {
      title: "This grants write access, including spend",
      body: "The connector exposes 82 tools, ~30 of which change things. An agent can create AND activate campaigns and boost Instagram posts, which spends real budget. Connect the ad account you actually intend an agent to act on.",
      href: "https://www.facebook.com/business/news/meta-ads-ai-connectors",
    },
  ],
};

const GOOGLE_ADS: CatalogEntry = {
  id: "google-ads",
  label: "Google Ads",
  blurb: "Read campaigns, ad groups, and reporting data from Google Ads.",
  iconSlug: "google-ads",
  bgImage: "/integrations/google-ads-bg.webp",
  logo: "/logos/google-ads.svg",
  sourceUrl: "https://github.com/googleads/google-ads-mcp",
  trustTier: "vendor",
  vendorName: "Google",
  authBackend: "token",
  transport: "stdio",
  mcpServerName: "cabinet-google-ads",
  command: "pipx",
  args: [
    "run",
    "--spec",
    "git+https://github.com/googleads/google-ads-mcp.git",
    "google-ads-mcp",
  ],
  serverEnv: {
    GOOGLE_APPLICATION_CREDENTIALS: "${GOOGLE_ADS_APPLICATION_CREDENTIALS}",
    GOOGLE_PROJECT_ID: "${GOOGLE_ADS_PROJECT_ID}",
    GOOGLE_ADS_DEVELOPER_TOKEN: "${GOOGLE_ADS_DEVELOPER_TOKEN}",
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: "${GOOGLE_ADS_LOGIN_CUSTOMER_ID}",
  },
  credentials: [
    {
      envKey: "GOOGLE_ADS_APPLICATION_CREDENTIALS",
      label: "Application credentials JSON path",
      kind: "filepath",
      required: true,
      placeholder: "/path/to/credentials.json",
      hint: "Path to the Google Cloud Application Default Credentials JSON file. Run `gcloud auth application-default login` with the Google Ads API scope to create it.",
    },
    {
      envKey: "GOOGLE_ADS_PROJECT_ID",
      label: "Google Cloud Project ID",
      kind: "plain",
      required: true,
      placeholder: "my-gcp-project",
      hint: "The Google Cloud project with the Google Ads API enabled.",
    },
    {
      envKey: "GOOGLE_ADS_DEVELOPER_TOKEN",
      label: "Developer token",
      kind: "secret",
      required: true,
      placeholder: "aBcDeFgHiJkLmNoPqR",
      hint: "From the Google Ads API Center. Needs at least Explorer access. Stored in .cabinet.env (0600).",
    },
    {
      envKey: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
      label: "Manager account ID (optional)",
      kind: "plain",
      required: false,
      placeholder: "123-456-7890",
      hint: "Required only if accessing accounts through a manager (MCC) account.",
    },
  ],
  actions: [
    "Query campaigns, ad groups & ads",
    "Pull performance metrics & reporting",
    "Manage customer lists & audiences",
    "Run raw GAQL queries",
  ],
  setupSteps: [
    {
      title: "Install pipx (one-time)",
      body: "The server runs locally through pipx, a Python tool runner. macOS: `brew install pipx`. Linux: `sudo apt install pipx` or `pip install --user pipx`. Windows: `pip install --user pipx`.",
      href: "https://pipx.pypa.io/stable/#install-pipx",
    },
    {
      title: "Enable the Google Ads API",
      body: "In Google Cloud Console, enable the Google Ads API for your project.",
      href: "https://console.cloud.google.com/apis/library/googleads.googleapis.com",
    },
    {
      title: "Get a developer token",
      body: "In Google Ads, go to Tools & Settings → API Center. New tokens may automatically receive Explorer access; if not, request it.",
      href: "https://ads.google.com/aw/apicenter",
    },
    {
      title: "Create Application Default Credentials",
      body: "Run the gcloud command below in a terminal. It opens a browser to authorize, then saves a credentials JSON file. Paste its path into the field below.",
      copy: "gcloud auth application-default login --scopes https://www.googleapis.com/auth/adwords,https://www.googleapis.com/auth/cloud-platform",
    },
    {
      title: "Paste your credentials below",
      body: "Enter the credentials file path, project ID, and developer token. They're stored in .cabinet.env (0600) and injected at runtime.",
    },
  ],
};

const STACKADAPT: CatalogEntry = {
  id: "stackadapt",
  label: "StackAdapt",
  blurb: "Read programmatic campaign delivery and reporting from StackAdapt.",
  iconSlug: "stackadapt",
  bgImage: "/integrations/stackadapt-bg.webp",
  logo: "/logos/stackadapt.svg",
  sourceUrl: "https://github.com/cabinetai/cabinet/tree/main/mcps/mcp-stackadapt",
  trustTier: "cabinet",
  authBackend: "token",
  transport: "stdio",
  mcpServerName: "cabinet-stackadapt",
  command: "npx",
  args: ["-y", "cabinet-mcp-stackadapt@0.1.0"],
  localBuild: "mcps/mcp-stackadapt/dist/index.js",
  serverEnv: {
    STACKADAPT_API_TOKEN: "${STACKADAPT_API_TOKEN}",
    STACKADAPT_API_URL: "${STACKADAPT_API_URL}",
  },
  credentials: [
    {
      envKey: "STACKADAPT_API_TOKEN",
      label: "API token",
      kind: "secret",
      required: true,
      placeholder: "sa_...",
      hint: "A StackAdapt Public API token. Stored in .cabinet.env, never written literally into CLI config.",
    },
    {
      envKey: "STACKADAPT_API_URL",
      label: "GraphQL endpoint",
      kind: "plain",
      required: false,
      placeholder: "https://api.stackadapt.com/graphql",
      hint: "Optional. Leave blank for StackAdapt's production GraphQL endpoint.",
    },
  ],
  actions: [
    "Read campaign delivery",
    "Summarize spend, impressions, clicks and conversions",
    "Compare ROAS and efficiency metrics",
    "Run advanced read-only GraphQL reports",
  ],
  setupSteps: [
    {
      title: "Create a StackAdapt Public API token",
      body: "Create or copy a StackAdapt Public API token with access to the advertisers and campaigns you want agents to analyze.",
      href: "https://docs.stackadapt.com/",
    },
    {
      title: "Paste the token",
      body: "Paste the token below. Cabinet stores it locally and injects it into the MCP server process at runtime.",
    },
    {
      title: "Connect",
      body: "Cabinet registers a read-only StackAdapt MCP server in your selected agent CLI configs. The server exposes queries only; mutations are rejected before they are sent.",
    },
  ],
};

/** Official public remote (HTTP + the CLI's PKCE OAuth). Nothing to paste. */
function officialRemote(o: {
  id: string;
  label: string;
  blurb: string;
  logo: string;
  url: string;
  registryId?: string;
  sourceUrl: string;
  actions: string[];
}): CatalogEntry {
  return {
    id: o.id,
    label: o.label,
    blurb: o.blurb,
    iconSlug: o.id,
    bgImage: `/integrations/${o.id}-bg.webp`,
    logo: o.logo,
    sourceUrl: o.sourceUrl,
    registryId: o.registryId,
    trustTier: "official",
    authBackend: "cli-pkce",
    transport: "http",
    mcpServerName: `cabinet-${o.id}`,
    url: o.url,
    credentials: [],
    actions: o.actions,
    setupSteps: [
      {
        title: `Sign in with ${o.label}`,
        body: `Click Connect & sign in. Your agent's CLI opens ${o.label} in the browser to authorize access. Nothing to paste.`,
      },
    ],
  };
}

/**
 * Remote whose URL is per-account / bring-your-own (Zapier, Make, ServiceNow,
 * or a community-hosted endpoint). The user pastes their server URL; it's kept
 * in `.cabinet.env` and written as the server URL at connect.
 */
function byoRemote(o: {
  id: string;
  label: string;
  blurb: string;
  logo: string;
  sourceUrl: string;
  actions: string[];
  tier: TrustTier;
  registryId?: string;
  where: string;
}): CatalogEntry {
  const key = `${o.id.toUpperCase().replace(/-/g, "_")}_MCP_URL`;
  return {
    id: o.id,
    label: o.label,
    blurb: o.blurb,
    iconSlug: o.id,
    bgImage: `/integrations/${o.id}-bg.webp`,
    logo: o.logo,
    sourceUrl: o.sourceUrl,
    registryId: o.registryId,
    trustTier: o.tier,
    authBackend: "token",
    transport: "http",
    mcpServerName: `cabinet-${o.id}`,
    urlCredentialKey: key,
    credentials: [
      {
        envKey: key,
        label: `${o.label} MCP server URL`,
        kind: "secret",
        required: true,
        placeholder: "https://…/mcp",
        hint: "Stored on this device; written into your agent CLI's config.",
      },
    ],
    actions: o.actions,
    setupSteps: [
      { title: `Get your ${o.label} MCP URL`, body: o.where },
      { title: "Paste the server URL", body: "Paste it below. It's stored only on this device." },
    ],
  };
}

/** Integrations added via the helpers (official remotes + bring-your-own). */
const EXTENDED: CatalogEntry[] = [
  // Official public remotes (one-click OAuth)
  officialRemote({ id: "sentry", label: "Sentry", blurb: "Triage errors, issues, and releases.", logo: "/logos/sentry.svg", url: "https://mcp.sentry.dev/mcp", registryId: "sentry", sourceUrl: "https://mcp.sentry.dev", actions: ["Search issues & errors", "Read stack traces & events", "Triage and resolve", "Inspect releases"] }),
  officialRemote({ id: "asana", label: "Asana", blurb: "Create, search, and update tasks and projects.", logo: "/logos/asana.webp", url: "https://mcp.asana.com/v2/mcp", registryId: "asana", sourceUrl: "https://developers.asana.com/docs/using-asanas-mcp-server", actions: ["Search tasks & projects", "Create & update tasks", "Comment & assign", "Summarize projects"] }),
  officialRemote({ id: "hubspot", label: "HubSpot", blurb: "Work with contacts, deals, and tickets in your CRM.", logo: "/logos/hubspot.svg", url: "https://mcp.hubspot.com", registryId: "hubspot", sourceUrl: "https://developers.hubspot.com/mcp", actions: ["Search contacts, deals & companies", "Create & update records", "Read & log activity", "Manage tickets"] }),
  officialRemote({ id: "clickup", label: "ClickUp", blurb: "Manage tasks, lists, docs, and goals.", logo: "/logos/clickup.webp", url: "https://mcp.clickup.com/mcp", registryId: "clickup", sourceUrl: "https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server", actions: ["Search & create tasks", "Update status & assignees", "Read docs & lists", "Track time & goals"] }),
  officialRemote({ id: "box", label: "Box", blurb: "Search and read your enterprise content in Box.", logo: "/logos/box.webp", url: "https://mcp.box.com", registryId: "box", sourceUrl: "https://developer.box.com/guides/box-mcp", actions: ["Search files & folders", "Read documents", "Use as agent context", "Read metadata"] }),
  officialRemote({ id: "monday", label: "monday.com", blurb: "Read and update boards, items, and updates.", logo: "/logos/monday.svg", url: "https://mcp.monday.com/mcp", registryId: "monday", sourceUrl: "https://github.com/mondaycom/mcp", actions: ["Search boards & items", "Create & update items", "Post updates", "Summarize boards"] }),

  // Official, special transport
  {
    id: "shopify", label: "Shopify", blurb: "Build on Shopify: search the dev docs & GraphQL schema.",
    iconSlug: "shopify", bgImage: "/integrations/shopify-bg.webp", logo: "/logos/shopify.svg",
    sourceUrl: "https://github.com/Shopify/dev-mcp", registryId: "shopify", trustTier: "official",
    authBackend: "token", transport: "stdio", mcpServerName: "cabinet-shopify",
    command: "npx", args: ["-y", "@shopify/dev-mcp@latest"], credentials: [],
    actions: ["Search Shopify.dev docs", "Explore the Admin GraphQL schema", "Validate queries", "Reference APIs"],
    setupSteps: [{ title: "Connect", body: "No sign-in needed. Runs Shopify's official dev MCP locally via npx (docs + GraphQL schema). For live store data, use a storefront/admin MCP URL via the bring-your-own option." }],
  },
  {
    id: "figma", label: "Figma", blurb: "Pull design context and generate code from frames.",
    iconSlug: "figma", bgImage: "/integrations/figma-bg.webp", logo: "/logos/figma.svg",
    sourceUrl: "https://developers.figma.com/docs/figma-mcp-server/", registryId: "figma", trustTier: "official",
    // Needs the Figma desktop app's local Dev Mode MCP server (127.0.0.1:3845) — no cloud path.
    cloudUnsupported: true,
    authBackend: "token", transport: "http", mcpServerName: "cabinet-figma",
    url: "http://127.0.0.1:3845/mcp", credentials: [],
    actions: ["Read selected frames & layers", "Extract design context", "Generate code from designs", "Fetch comments"],
    setupSteps: [{ title: "Enable Dev Mode MCP in Figma", body: "In the Figma desktop app, enable the Dev Mode MCP Server (Preferences). It serves locally at 127.0.0.1:3845, then connect here.", href: "https://help.figma.com/hc/en-us/articles/32132100833559" }],
  },
  {
    id: "salesforce", label: "Salesforce", blurb: "Query and update CRM data with the official DX MCP.",
    iconSlug: "salesforce", bgImage: "/integrations/salesforce-bg.webp", logo: "/logos/salesforce.webp",
    sourceUrl: "https://github.com/salesforcecli/mcp", registryId: "salesforce", trustTier: "official",
    // Auth is a local `sf org login web` via the Salesforce CLI on the user's machine — no cloud path.
    cloudUnsupported: true,
    authBackend: "token", transport: "stdio", mcpServerName: "cabinet-salesforce",
    command: "npx", args: ["-y", "@salesforce/mcp", "--orgs", "DEFAULT_TARGET_ORG", "--toolsets", "all"], credentials: [],
    actions: ["Query records (SOQL)", "Create & update records", "Run Apex & tests", "Inspect org metadata"],
    setupSteps: [{ title: "Authorize an org first", body: "Install the Salesforce CLI and run `sf org login web`, then connect here. The MCP uses your CLI's default org.", href: "https://developer.salesforce.com/tools/salesforcecli" }],
  },

  // Per-account official remotes (paste your URL)
  byoRemote({ id: "zapier", label: "Zapier", blurb: "Reach 8,000+ apps through your Zapier MCP endpoint.", logo: "/logos/zapier.svg", sourceUrl: "https://zapier.com/mcp", tier: "official", registryId: "zapier", actions: ["Run actions across 8,000+ apps", "Trigger Zaps", "Search connected-app data"], where: "Go to mcp.zapier.com → pick/create your server → Connect tab → copy your server URL." }),
  byoRemote({ id: "make", label: "Make", blurb: "Run Make scenarios and connect 2,000+ apps.", logo: "/logos/make.svg", sourceUrl: "https://www.make.com/", tier: "official", registryId: "make", actions: ["Trigger scenarios", "Run app actions", "Read scenario data"], where: "In Make → your API/MCP settings, copy your MCP server URL." }),
  byoRemote({ id: "servicenow", label: "ServiceNow", blurb: "Incidents, requests, and records via your instance MCP.", logo: "/logos/servicenow.svg", sourceUrl: "https://www.servicenow.com/", tier: "official", registryId: "servicenow", actions: ["Search & create incidents", "Update records", "Run governed actions"], where: "From your ServiceNow instance admin → MCP Server, copy the instance MCP URL." }),

  // Community / bring-your-own remote (paste a hosted MCP URL from Composio, Pipedream, Zapier, or self-host)
  byoRemote({ id: "pipedrive", label: "Pipedrive", blurb: "Deals, contacts, and pipelines in your CRM.", logo: "/logos/pipedrive.svg", sourceUrl: "https://www.coupler.io/mcp/pipedrive", tier: "community", actions: ["Search deals & contacts", "Create & update deals", "Move pipeline stages"], where: "Use a hosted Pipedrive MCP URL (Composio/Coupler/Pipedream) or self-host." }),
  byoRemote({ id: "zendesk", label: "Zendesk", blurb: "Tickets, customers, and help-center content.", logo: "/logos/zendesk.svg", sourceUrl: "https://zapier.com/mcp/zendesk", tier: "community", actions: ["Search & update tickets", "Read customer context", "Draft replies"], where: "Use a hosted Zendesk MCP URL (Zapier/Composio) or self-host." }),
  byoRemote({ id: "intercom", label: "Intercom", blurb: "Conversations, contacts, and help articles.", logo: "/logos/intercom.svg", sourceUrl: "https://www.intercom.com/", tier: "community", actions: ["Read conversations", "Search contacts & companies", "Find help articles"], where: "Use a hosted Intercom MCP URL (Composio/Pipedream) or self-host." }),
  byoRemote({ id: "gitlab", label: "GitLab", blurb: "Repos, merge requests, issues, and pipelines.", logo: "/logos/gitlab.webp", sourceUrl: "https://docs.gitlab.com/", tier: "community", actions: ["Read code & issues", "Review merge requests", "Track pipelines"], where: "Use GitLab's MCP endpoint or a hosted GitLab MCP URL." }),
  byoRemote({ id: "calendly", label: "Calendly", blurb: "Bookings, event types, and availability.", logo: "/logos/calendly.webp", sourceUrl: "https://zapier.com/mcp/calendly", tier: "community", actions: ["List bookings & invitees", "Read event types", "Prep meeting briefs"], where: "Use a hosted Calendly MCP URL (Zapier/Composio) or self-host." }),
  byoRemote({ id: "zoom", label: "Zoom", blurb: "Meetings, recordings, and transcripts.", logo: "/logos/zoom.webp", sourceUrl: "https://marketplace.zoom.us/", tier: "community", actions: ["List meetings", "Fetch recordings & transcripts", "Summarize calls"], where: "Use a hosted Zoom MCP URL (Composio/Pipedream) or self-host." }),
  byoRemote({ id: "loom", label: "Loom", blurb: "Video library, transcripts, and shares.", logo: "/logos/loom.svg", sourceUrl: "https://www.loom.com/", tier: "community", actions: ["Search videos", "Read transcripts", "Summarize recordings"], where: "Use a hosted Loom MCP URL or self-host." }),
  byoRemote({ id: "motion", label: "Motion", blurb: "AI calendar, tasks, and auto-scheduling.", logo: "/logos/motion.svg", sourceUrl: "https://www.usemotion.com/", tier: "community", actions: ["Read schedule & tasks", "Create tasks", "Find time"], where: "Use a hosted Motion MCP URL or self-host." }),
  byoRemote({ id: "clockwise", label: "Clockwise", blurb: "Focus time and smart calendar optimization.", logo: "/logos/clockwise.svg", sourceUrl: "https://www.getclockwise.com/", tier: "community", actions: ["Read calendar", "Find focus time", "Optimize schedule"], where: "Use a hosted Clockwise MCP URL or self-host." }),
  byoRemote({ id: "miro", label: "Miro", blurb: "Boards, frames, and sticky notes.", logo: "/logos/miro.svg", sourceUrl: "https://miro.com/", tier: "community", actions: ["Read boards & frames", "Create items", "Summarize boards"], where: "Use a hosted Miro MCP URL (Composio/Pipedream) or self-host." }),
  byoRemote({ id: "trello", label: "Trello", blurb: "Boards, lists, and cards.", logo: "/logos/trello.svg", sourceUrl: "https://trello.com/", tier: "community", actions: ["Read boards & cards", "Create & move cards", "Comment"], where: "Use a hosted Trello MCP URL or self-host." }),
  byoRemote({ id: "dropbox", label: "Dropbox", blurb: "Browse and read files in Dropbox.", logo: "/logos/dropbox.webp", sourceUrl: "https://www.dropbox.com/developers", tier: "community", actions: ["Browse folders", "Read files", "Use as agent context"], where: "Use a hosted Dropbox MCP URL or self-host." }),
  byoRemote({ id: "pagerduty", label: "PagerDuty", blurb: "Incidents, services, schedules, and on-call.", logo: "/logos/pagerduty.svg", sourceUrl: "https://www.pagerduty.com/", tier: "community", actions: ["Read & create incidents", "Check on-call", "Read schedules"], where: "Use a hosted PagerDuty MCP URL or self-host." }),
  byoRemote({ id: "quickbooks", label: "QuickBooks", blurb: "Invoices, expenses, and P&L reports.", logo: "/logos/quickbooks.webp", sourceUrl: "https://www.cdata.com/drivers/quickbooks/mcp/", tier: "community", actions: ["Read invoices & expenses", "Create invoices", "Pull P&L"], where: "Use a hosted QuickBooks MCP URL (CData/Zapier) or self-host." }),
  byoRemote({ id: "expensify", label: "Expensify", blurb: "Expense reports and reimbursements.", logo: "/logos/expensify.svg", sourceUrl: "https://www.expensify.com/", tier: "community", actions: ["Read expense reports", "Create expenses", "Check status"], where: "Use a hosted Expensify MCP URL or self-host." }),
  byoRemote({ id: "docusign", label: "DocuSign", blurb: "Envelopes, signatures, and templates.", logo: "/logos/docusign.webp", sourceUrl: "https://www.docusign.com/", tier: "community", actions: ["Send envelopes", "Check signature status", "Use templates"], where: "Use a hosted DocuSign MCP URL or self-host." }),
  byoRemote({ id: "workday", label: "Workday", blurb: "HR records, time off, and org data.", logo: "/logos/workday.svg", sourceUrl: "https://www.workday.com/", tier: "community", actions: ["Read worker & org data", "Check time off", "Look up policies"], where: "Use a hosted Workday MCP URL or self-host." }),
  byoRemote({ id: "bamboohr", label: "BambooHR", blurb: "Employees, time off, and HR data.", logo: "/logos/bamboohr.svg", sourceUrl: "https://www.bamboohr.com/", tier: "community", actions: ["Read employee data", "Check time off", "Look up directory"], where: "Use a hosted BambooHR MCP URL or self-host." }),
  {
    id: "snowflake",
    label: "Snowflake",
    blurb: "Query your warehouse and Cortex AI in natural language.",
    iconSlug: "snowflake",
    bgImage: "/integrations/snowflake-bg.webp",
    logo: "/logos/snowflake.webp",
    // Snowflake's own server (Snowflake-Labs/mcp), run locally via uvx. Auth goes
    // through the Snowflake Python Connector: we pass account/user + a Programmatic
    // Access Token (as SNOWFLAKE_PASSWORD) via the env — no browser OAuth, so it's
    // a plain token paste. The server REQUIRES --service-config-file, so we
    // materialize a read-only default policy (see configFile) and pass its path.
    sourceUrl: "https://github.com/Snowflake-Labs/mcp",
    registryId: "snowflake",
    trustTier: "official",
    authBackend: "token",
    transport: "stdio",
    mcpServerName: "cabinet-snowflake",
    command: "uvx",
    args: ["snowflake-labs-mcp", "--service-config-file", "${CONFIG_FILE}"],
    serverEnv: {
      SNOWFLAKE_ACCOUNT: "${SNOWFLAKE_ACCOUNT}",
      SNOWFLAKE_USER: "${SNOWFLAKE_USER}",
      // A Programmatic Access Token is passed as the password (its documented use).
      SNOWFLAKE_PASSWORD: "${SNOWFLAKE_PASSWORD}",
      // Optional — dropped by the writer when left blank in .cabinet.env.
      SNOWFLAKE_WAREHOUSE: "${SNOWFLAKE_WAREHOUSE}",
      SNOWFLAKE_ROLE: "${SNOWFLAKE_ROLE}",
    },
    configFile: {
      name: "snowflake-mcp-config.yaml",
      contents: `# Cabinet default config for the Snowflake MCP server (Snowflake-Labs/mcp).
#
# Read-only by default: agents may run SELECT / DESCRIBE / USE and utility
# commands, but INSERT / UPDATE / DELETE / DROP and other mutations are denied.
# To let agents write, flip the relevant statement types below to true.
#
# No Cortex agent/search/analyst services are pre-wired — those are
# account-specific; add them here after you create them in Snowflake.
agent_services: []
search_services: []
analyst_services: []
other_services:
  object_manager: true    # explore databases/schemas/tables/etc.
  query_manager: true     # run SQL, gated by sql_statement_permissions below
  semantic_manager: true  # discover & query semantic views
sql_statement_permissions:
  - Select: true
  - Describe: true
  - Use: true
  - Command: true
  - Alter: false
  - Comment: false
  - Commit: false
  - Create: false
  - Delete: false
  - Drop: false
  - Insert: false
  - Merge: false
  - Rollback: false
  - Transaction: false
  - TruncateTable: false
  - Update: false
  - Unknown: false
`,
    },
    credentials: [
      {
        envKey: "SNOWFLAKE_ACCOUNT",
        label: "Account identifier",
        kind: "plain",
        required: true,
        placeholder: "myorg-myaccount",
        hint: "Your account identifier (e.g. myorg-myaccount), the first part of your account URL https://<account>.snowflakecomputing.com.",
      },
      {
        envKey: "SNOWFLAKE_USER",
        label: "Username",
        kind: "plain",
        required: true,
        placeholder: "you@example.com",
        hint: "The Snowflake user the token belongs to.",
      },
      {
        envKey: "SNOWFLAKE_PASSWORD",
        label: "Programmatic Access Token (PAT)",
        kind: "secret",
        required: true,
        placeholder: "••••••••••••••••",
        hint: "Generate a PAT in Snowsight (Profile → Authentication) scoped to a least-privilege role. Passed as SNOWFLAKE_PASSWORD; stored in .cabinet.env (0600), never written into the CLI config. A raw account password works here too.",
      },
      {
        envKey: "SNOWFLAKE_WAREHOUSE",
        label: "Warehouse (optional)",
        kind: "plain",
        required: false,
        placeholder: "COMPUTE_WH",
        hint: "Default virtual warehouse for queries. Leave blank to use the user's default.",
      },
      {
        envKey: "SNOWFLAKE_ROLE",
        label: "Role (optional)",
        kind: "plain",
        required: false,
        placeholder: "MCP_READONLY",
        hint: "Role to run as (a least-privilege role is recommended). Leave blank for the user's default.",
      },
    ],
    actions: [
      "Run SQL queries (read-only by default)",
      "Explore databases, schemas & tables",
      "Query Cortex Analyst & semantic views",
      "Summarize results",
    ],
    setupSteps: [
      {
        title: "Install uv (one-time)",
        body: "The server runs locally through uvx, uv's tool runner (like npx, but for Python). macOS/Linux: run `curl -LsSf https://astral.sh/uv/install.sh | sh` (or `brew install uv`). Windows: `winget install --id=astral-sh.uv`. Restart Cabinet if it was already open.",
        href: "https://docs.astral.sh/uv/getting-started/installation/",
      },
      {
        title: "Create a Programmatic Access Token",
        body: "In Snowsight, generate a PAT for your user. Newer accounts: Governance & security → Users & roles → your user → Programmatic access tokens → Generate new token. Some accounts instead expose it under your user menu → Profile / My profile → Authentication. Scope it to a least-privilege role (ideally read-only) so agents can't do more than you intend.",
        href: "https://docs.snowflake.com/en/user-guide/programmatic-access-tokens",
      },
      {
        title: "Attach a network policy (required for PAT auth)",
        body: "A PAT can't authenticate unless its user has a network policy; otherwise connecting fails with \"Network policy is required\" and the server hangs on \"still connecting\" with no error. In a Snowsight SQL worksheet (role ACCOUNTADMIN), run the SQL below, swapping YOUR_USER for your username and YOUR_IP for the public IP (or CIDR range) you connect from. Skip this only if you're using a raw account password instead of a PAT.",
        copy: "USE ROLE ACCOUNTADMIN;\nCREATE NETWORK POLICY IF NOT EXISTS cabinet_mcp_policy ALLOWED_IP_LIST = ('YOUR_IP/32');\nALTER USER YOUR_USER SET NETWORK_POLICY = cabinet_mcp_policy;",
        href: "https://docs.snowflake.com/en/user-guide/network-policies",
      },
      {
        title: "Paste your account, user & token",
        body: "Enter your account identifier, username, and the PAT below. They're stored in .cabinet.env (0600) and injected into the server's environment at run time, never written into the CLI config.",
      },
      {
        title: "Read-only by default",
        body: "Cabinet ships a config that permits SELECT/DESCRIBE/USE and denies INSERT/UPDATE/DELETE/DROP and other writes. To let agents write, edit snowflake-mcp-config.yaml in Cabinet's data dir (data/.agents/.config) and flip the relevant statement types to true.",
      },
    ],
  },
  byoRemote({ id: "bigquery", label: "BigQuery", blurb: "Query datasets in Google BigQuery.", logo: "/logos/bigquery.svg", sourceUrl: "https://cloud.google.com/bigquery", tier: "community", actions: ["Run SQL queries", "Explore datasets", "Summarize results"], where: "Use a hosted BigQuery MCP URL or self-host." }),
  byoRemote({ id: "amplitude", label: "Amplitude", blurb: "Product analytics, charts, and cohorts.", logo: "/logos/amplitude.svg", sourceUrl: "https://amplitude.com/", tier: "community", actions: ["Query charts & events", "Read cohorts", "Summarize trends"], where: "Use a hosted Amplitude MCP URL or self-host." }),
  byoRemote({ id: "airtable", label: "Airtable", blurb: "Read and write records across your bases.", logo: "/logos/airtable.svg", sourceUrl: "https://airtable.com/developers", tier: "community", actions: ["Query tables", "Create & update records", "Read schemas"], where: "Use a hosted Airtable MCP URL (Composio/Pipedream) or self-host." }),
  byoRemote({ id: "datadog", label: "Datadog", blurb: "Metrics, monitors, logs, and dashboards.", logo: "/logos/datadog.svg", sourceUrl: "https://www.datadoghq.com/", tier: "community", actions: ["Search metrics & logs", "Read monitors", "Inspect dashboards"], where: "Use a hosted Datadog MCP URL or self-host." }),
  byoRemote({ id: "gong", label: "Gong", blurb: "Call recordings, transcripts, and deal insights.", logo: "/logos/gong.svg", sourceUrl: "https://www.gong.io/", tier: "community", actions: ["Read call transcripts", "Search calls", "Surface deal insights"], where: "Use a hosted Gong MCP URL or self-host." }),
  byoRemote({ id: "greenhouse", label: "Greenhouse", blurb: "Candidates, jobs, and interview pipelines.", logo: "/logos/greenhouse.svg", sourceUrl: "https://www.greenhouse.io/", tier: "community", actions: ["Search candidates", "Read jobs & stages", "Summarize pipelines"], where: "Use a hosted Greenhouse MCP URL or self-host." }),
  byoRemote({ id: "brex", label: "Brex", blurb: "Card transactions, expenses, and budgets.", logo: "/logos/brex.svg", sourceUrl: "https://www.brex.com/", tier: "community", actions: ["Read transactions", "Check budgets", "Summarize spend"], where: "Use a hosted Brex MCP URL or self-host." }),
  byoRemote({ id: "databricks", label: "Databricks", blurb: "Query lakehouse data and run notebooks.", logo: "/logos/databricks.svg", sourceUrl: "https://www.databricks.com/", tier: "community", actions: ["Run SQL queries", "Explore catalogs", "Summarize results"], where: "Use a hosted Databricks MCP URL or self-host." }),
  byoRemote({ id: "looker", label: "Looker", blurb: "Explore dashboards and run Looks.", logo: "/logos/looker.svg", sourceUrl: "https://cloud.google.com/looker", tier: "community", actions: ["Run Looks & queries", "Read dashboards", "Summarize metrics"], where: "Use a hosted Looker MCP URL or self-host." }),
  byoRemote({ id: "tableau", label: "Tableau", blurb: "Read workbooks, views, and data sources.", logo: "/logos/tableau.svg", sourceUrl: "https://www.tableau.com/", tier: "community", actions: ["Read workbooks & views", "Query data sources", "Summarize dashboards"], where: "Use a hosted Tableau MCP URL or self-host." }),
  byoRemote({ id: "mixpanel", label: "Mixpanel", blurb: "Query events, funnels, and cohorts.", logo: "/logos/mixpanel.svg", sourceUrl: "https://mixpanel.com/", tier: "community", actions: ["Query events & funnels", "Read cohorts", "Summarize trends"], where: "Use a hosted Mixpanel MCP URL or self-host." }),
];

export const MCP_CATALOG: CatalogEntry[] = [
  SLACK,
  GOOGLE_WORKSPACE,
  MICROSOFT_365,
  NOTION,
  GITHUB,
  LINEAR,
  ATLASSIAN,
  STRIPE,
  DISCORD,
  TELEGRAM,
  LINKEDIN,
  META_ADS,
  GOOGLE_ADS,
  STACKADAPT,
  ...EXTENDED,
];

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
    description: "Agents can hand off work: launch tasks, schedule jobs, and queue future runs for other agents.",
    icon: "ListChecks",
  },
  {
    id: "skills",
    label: "Skills",
    description: "Installed skills extend what agents can do. Browse and manage them on the Skills page.",
    icon: "Asterisk",
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
