/**
 * Premade connector directory for the new Integrations Hub page.
 *
 * This is the *browse* dataset — a broad, categorised list of services Cabinet
 * can (or will) connect agents to. It is intentionally larger than the live
 * MCP catalog (`mcp-catalog.ts`): entries with `implemented: false` are shown
 * dimmed ("coming soon") so the directory reads as a roadmap, not a dead end.
 *
 * `implemented` is the single source of truth the UI uses to decide full vs.
 * 50%-opacity rendering. Keep it in sync with what's actually wired in
 * `mcp-catalog.ts` / the real connect flow.
 *
 * Logos live under /public/logos (copied from the marketing site) plus a few
 * brand marks under /public/integrations.
 */

import { MCP_CATALOG, type CatalogSetupStep } from "@/lib/agents/mcp-catalog";

export type IntegrationCategory =
  | "communication"
  | "social"
  | "productivity"
  | "knowledge"
  | "development"
  | "crm"
  | "finance"
  | "data"
  | "hr"
  | "automation";

export interface IntegrationItem {
  /** Stable slug; also the i18n/analytics key. */
  id: string;
  name: string;
  category: IntegrationCategory;
  /** Restrict to a platform — undefined means show everywhere. */
  platform?: "macos";
  /** Absolute public path to the brand logo. */
  logo: string;
  /** One-line, outcome-focused: what an agent does with it. */
  blurb: string;
  /** Official-ish brand colour, used for accents / backdrops. */
  brand: string;
  /** false → rendered dimmed as "coming soon". */
  implemented: boolean;
  /**
   * Cabinet-native integration: configured by an in-app UI (the detail page
   * renders a custom panel), NOT an MCP/OAuth connector. Always treated as
   * available and opens itself (no suite redirect, no connect gate).
   */
  native?: boolean;
  /** Shown on the detail page: concrete agent capabilities. */
  actions: string[];
  /**
   * Tutorial steps for the detail page. MCP connectors get these from the MCP
   * catalog; native integrations (no catalog entry) carry them here so the
   * detail page can still show a full setup guide.
   */
  setupSteps?: CatalogSetupStep[];
  /**
   * Sub-product that connects through a suite's single OAuth (e.g. Gmail →
   * google-workspace, Teams → microsoft-365). Opening the card opens the suite.
   */
  coveredBy?: string;
}

export const CATEGORY_META: Record<
  IntegrationCategory,
  { label: string; order: number }
> = {
  communication: { label: "Communication", order: 0 },
  productivity: { label: "Productivity", order: 1 },
  knowledge: { label: "Knowledge", order: 2 },
  social: { label: "Social", order: 3 },
  development: { label: "Development", order: 4 },
  crm: { label: "Sales & Support", order: 5 },
  finance: { label: "Finance & Legal", order: 6 },
  data: { label: "Data & Analytics", order: 7 },
  hr: { label: "People & HR", order: 8 },
  automation: { label: "Automation & AI", order: 9 },
};

export const CATEGORY_ORDER: IntegrationCategory[] = (
  Object.keys(CATEGORY_META) as IntegrationCategory[]
).sort((a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order);

const L = (file: string) => `/logos/${file}`;

const RAW_INTEGRATIONS: IntegrationItem[] = [
  // ── Communication ───────────────────────────────────────────────
  {
    id: "slack",
    name: "Slack",
    category: "communication",
    logo: "/integrations/slack-logo.png",
    blurb: "Let agents search, read, and post across your workspace.",
    brand: "#611f69",
    implemented: true,
    actions: ["Search channels & DMs", "Summarise threads", "Post messages and replies"],
  },
  {
    id: "discord",
    name: "Discord",
    category: "communication",
    logo: "/integrations/discord-logo.png",
    blurb: "Read and post in your community's channels.",
    brand: "#5865f2",
    implemented: true,
    actions: ["Read & summarize channel history", "Post messages and announcements", "Reply in threads & react"],
  },
  {
    id: "telegram",
    name: "Telegram",
    category: "communication",
    logo: L("telegram.svg"),
    blurb: "Send messages and manage the chats your bot is in. Or flip it around: drive Cabinet from Telegram.",
    brand: "#26a5e4",
    implemented: true,
    actions: ["Send messages & announcements", "Run agents & search Cabinet from your phone", "React to messages"],
  },
  {
    id: "microsoft-teams",
    name: "Microsoft Teams",
    category: "communication",
    logo: L("microsoft-teams.svg"),
    blurb: "Bring Teams chats and channels into agent context.",
    brand: "#6264a7",
    implemented: false,
    actions: ["Search messages", "Summarise channels", "Post updates"],
  },
  {
    id: "zoom",
    name: "Zoom",
    category: "communication",
    logo: L("zoom.webp"),
    blurb: "Pull transcripts and recordings into your knowledge base.",
    brand: "#2d8cff",
    implemented: false,
    actions: ["Fetch meeting transcripts", "Summarise calls", "Track action items"],
  },

  // ── Social ──────────────────────────────────────────────────────
  {
    id: "tiktok",
    name: "TikTok",
    category: "social",
    logo: L("tiktok.svg"),
    blurb: "Track videos, trends, and engagement on your account.",
    brand: "#010101",
    implemented: false,
    actions: ["Read post performance", "Track trends & hashtags", "Summarise comments"],
  },
  {
    id: "instagram",
    name: "Instagram",
    category: "social",
    logo: L("instagram.svg"),
    blurb: "Read posts, comments, and DMs — and draft replies.",
    brand: "#E4405F",
    implemented: false,
    actions: ["Read posts & insights", "Triage comments & DMs", "Draft replies"],
  },
  {
    id: "facebook",
    name: "Facebook",
    category: "social",
    logo: L("facebook.svg"),
    blurb: "Manage Pages, posts, and audience engagement.",
    brand: "#1877F2",
    implemented: false,
    actions: ["Read Page insights", "Summarise comments", "Draft posts & replies"],
  },
  {
    id: "x",
    name: "X",
    category: "social",
    logo: L("x.svg"),
    blurb: "Monitor mentions, search posts, and draft your own.",
    brand: "#000000",
    implemented: false,
    actions: ["Search posts & mentions", "Summarise threads", "Draft posts"],
  },

  // ── Knowledge ───────────────────────────────────────────────────
  {
    id: "apple-notes",
    name: "Apple Notes",
    category: "knowledge",
    platform: "macos",
    logo: "/logos/apple-notes.svg",
    blurb: "Import your notes as searchable, editable Markdown — offline and available to agents.",
    brand: "#F2B600",
    implemented: true,
    native: true,
    actions: [
      "Import notes as local Markdown",
      "Preserve folder hierarchy",
      "Re-import upserts (never duplicates)",
      "Include attachments with Full Disk Access",
    ],
  },
  {
    id: "notion",
    name: "Notion",
    category: "knowledge",
    logo: L("notion.svg"),
    blurb: "Read and update pages, databases, and docs.",
    brand: "#000000",
    implemented: true,
    actions: ["Search workspace", "Create & edit pages", "Query databases"],
  },
  {
    id: "confluence",
    name: "Confluence",
    category: "knowledge",
    logo: L("confluence.svg"),
    blurb: "Search and maintain your team's knowledge base.",
    brand: "#172b4d",
    implemented: false,
    actions: ["Search spaces", "Draft pages", "Keep docs current"],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    category: "knowledge",
    logo: L("google-drive.svg"),
    blurb: "Browse, read, and reference Drive files as context.",
    brand: "#1fa463",
    implemented: false,
    native: true,
    actions: ["Search files", "Read docs & sheets", "Use as agent context"],
    setupSteps: [
      {
        title: "Install Google Drive for Desktop",
        body: "Download Google Drive for Desktop for your OS (macOS or Windows) and sign in. It mounts your Drive as a local folder Cabinet can read — no OAuth or Google Cloud setup needed.",
        href: "https://support.google.com/a/users/answer/13022292?hl=en",
      },
      {
        title: "Make folders available offline (recommended)",
        body: "In Drive for Desktop, right-click the folders you want and choose \"Available offline\" so the files are on disk. Streaming-only files still appear but open more slowly.",
      },
      {
        title: "Pick folders to show in Cabinet",
        body: "In the panel on the right, choose which Drive folders to mount. They appear in the sidebar under a \"Google Drive\" section.",
      },
      {
        title: "Open files in Cabinet",
        body: "Click any mounted file to view it inline — PDFs, images, Office docs, and native Google Docs/Sheets/Slides all render in Cabinet's viewers.",
      },
    ],
  },
  {
    id: "icloud",
    name: "iCloud Drive",
    category: "knowledge",
    platform: "macos",
    logo: "/logos/icloud.svg",
    blurb: "Mount iCloud Drive folders as knowledge sources accessible to agents.",
    brand: "#2196F3",
    implemented: false,
    native: true,
    actions: ["Browse folders", "Read documents", "Use as agent context"],
  },

  // ── Productivity ────────────────────────────────────────────────
  {
    id: "google-workspace",
    name: "Google Workspace",
    category: "productivity",
    logo: "/integrations/google-workspace-logo.webp",
    blurb: "Calendar, Contacts, Docs, Sheets, Slides, Tasks, Forms, Chat and Search via one sign-in. (Gmail and Drive have their own cards.)",
    brand: "#4285f4",
    implemented: true,
    actions: ["Calendar & Contacts", "Docs, Sheets & Slides", "Tasks, Forms, Chat & Search"],
  },
  {
    id: "microsoft-365",
    name: "Microsoft 365",
    category: "productivity",
    logo: L("microsoft-365.svg"),
    blurb: "Outlook, Teams, and SharePoint / OneDrive via Microsoft Graph.",
    brand: "#0078d4",
    implemented: true,
    actions: ["Outlook mail & calendar", "Teams messages", "SharePoint & OneDrive files"],
  },
  {
    id: "airtable",
    name: "Airtable",
    category: "productivity",
    logo: L("airtable.svg"),
    blurb: "Read and write records across your bases.",
    brand: "#18bfff",
    implemented: false,
    actions: ["Query tables", "Create records", "Sync to pages"],
  },
  {
    id: "asana",
    name: "Asana",
    category: "productivity",
    logo: L("asana.webp"),
    blurb: "Create, assign, and track tasks from agent work.",
    brand: "#f06a6a",
    implemented: false,
    actions: ["Create tasks", "Update status", "Summarise projects"],
  },
  {
    id: "clickup",
    name: "ClickUp",
    category: "productivity",
    logo: L("clickup.webp"),
    blurb: "Manage tasks, docs, and goals in one place.",
    brand: "#7b68ee",
    implemented: false,
    actions: ["Create tasks", "Track sprints", "Roll up status"],
  },
  {
    id: "calendly",
    name: "Calendly",
    category: "productivity",
    logo: L("calendly.webp"),
    blurb: "Surface bookings and keep your schedule in view.",
    brand: "#006bff",
    implemented: false,
    actions: ["List bookings", "Watch for new invitees", "Prep meeting briefs"],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "productivity",
    logo: L("google-calendar.svg"),
    blurb: "Read your agenda and schedule on your behalf. (Connects through Google Workspace.)",
    brand: "#4285f4",
    implemented: true,
    actions: ["Read agenda", "Create & update events", "Find free slots"],
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "productivity",
    logo: L("gmail.svg"),
    blurb: "Triage, search, and draft replies to email.",
    brand: "#ea4335",
    implemented: false,
    actions: ["Search inbox", "Summarise threads", "Send & reply (with approval)"],
  },

  // ── Files & Storage (folded into Knowledge) ─────────────────────
  {
    id: "onedrive",
    name: "OneDrive",
    category: "knowledge",
    logo: L("onedrive.svg"),
    blurb: "Pull documents from OneDrive into your cabinet.",
    brand: "#0364b8",
    implemented: false,
    actions: ["Browse folders", "Read files", "Reference as context"],
  },
  {
    id: "sharepoint",
    name: "SharePoint",
    category: "knowledge",
    logo: L("sharepoint.svg"),
    blurb: "Connect team sites and document libraries.",
    brand: "#038387",
    implemented: false,
    actions: ["Search sites", "Read libraries", "Index for agents"],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    category: "knowledge",
    logo: L("dropbox.webp"),
    blurb: "Bring Dropbox files into agent reach.",
    brand: "#0061ff",
    implemented: false,
    actions: ["Browse files", "Read documents", "Reference as context"],
  },
  {
    id: "box",
    name: "Box",
    category: "knowledge",
    logo: L("box.webp"),
    blurb: "Access Box content securely from your cabinet.",
    brand: "#0061d5",
    implemented: false,
    actions: ["Search content", "Read files", "Index for agents"],
  },

  // ── Development ─────────────────────────────────────────────────
  {
    id: "github",
    name: "GitHub",
    category: "development",
    logo: L("github.svg"),
    blurb: "Read repos, issues, and PRs — and act on them.",
    brand: "#181717",
    implemented: true,
    actions: ["Read code & issues", "Triage PRs", "Open issues"],
  },
  {
    id: "gitlab",
    name: "GitLab",
    category: "development",
    logo: L("gitlab.webp"),
    blurb: "Work with repos, merge requests, and pipelines.",
    brand: "#fc6d26",
    implemented: false,
    actions: ["Read code", "Review MRs", "Track pipelines"],
  },
  {
    id: "jira",
    name: "Jira",
    category: "development",
    logo: L("jira.webp"),
    blurb: "Search and act on Jira issues and Confluence pages.",
    brand: "#2684ff",
    implemented: true,
    actions: ["Search issues & pages", "Create tickets", "Draft Confluence pages"],
  },
  {
    id: "linear",
    name: "Linear",
    category: "development",
    logo: L("linear.webp"),
    blurb: "Manage issues and projects at agent speed.",
    brand: "#5e6ad2",
    implemented: true,
    actions: ["Create issues", "Update cycles", "Summarise projects"],
  },
  {
    id: "figma",
    name: "Figma",
    category: "development",
    logo: L("figma.svg"),
    blurb: "Pull design files and comments into context.",
    brand: "#f24e1e",
    implemented: false,
    actions: ["Read files", "Fetch comments", "Export frames"],
  },
  {
    id: "servicenow",
    name: "ServiceNow",
    category: "development",
    logo: L("servicenow.svg"),
    blurb: "Manage IT tickets and workflows.",
    brand: "#62d84e",
    implemented: false,
    actions: ["Query incidents", "Create tickets", "Update records"],
  },
  {
    id: "datadog",
    name: "Datadog",
    category: "development",
    logo: L("datadog.webp"),
    blurb: "Surface metrics, monitors, and incidents.",
    brand: "#632ca6",
    implemented: false,
    actions: ["Query metrics", "Check monitors", "Summarise incidents"],
  },

  // ── Sales & Support ─────────────────────────────────────────────
  {
    id: "salesforce",
    name: "Salesforce",
    category: "crm",
    logo: L("salesforce.webp"),
    blurb: "Read and update accounts, contacts, and deals.",
    brand: "#00a1e0",
    implemented: false,
    actions: ["Query records", "Update opportunities", "Log activity"],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "crm",
    logo: L("hubspot.svg"),
    blurb: "Work your CRM, contacts, and pipelines.",
    brand: "#ff7a59",
    implemented: false,
    actions: ["Query contacts", "Update deals", "Draft outreach"],
  },
  {
    id: "intercom",
    name: "Intercom",
    category: "crm",
    logo: L("intercom.svg"),
    blurb: "Read conversations and draft customer replies.",
    brand: "#1f8ded",
    implemented: false,
    actions: ["Read conversations", "Draft replies", "Tag & route"],
  },
  {
    id: "zendesk",
    name: "Zendesk",
    category: "crm",
    logo: L("zendesk.svg"),
    blurb: "Triage tickets and suggest resolutions.",
    brand: "#03363d",
    implemented: false,
    actions: ["Search tickets", "Draft responses", "Summarise queues"],
  },
  {
    id: "gong",
    name: "Gong",
    category: "crm",
    logo: L("gong.svg"),
    blurb: "Mine call insights and follow-ups.",
    brand: "#8a2be2",
    implemented: false,
    actions: ["Fetch call summaries", "Extract action items", "Track deals"],
  },
  {
    id: "greenhouse",
    name: "Greenhouse",
    category: "crm",
    logo: L("greenhouse.svg"),
    blurb: "Move candidates through your hiring pipeline.",
    brand: "#24a47c",
    implemented: false,
    actions: ["Track candidates", "Summarise interviews", "Update stages"],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "crm",
    logo: L("linkedin.svg"),
    blurb: "Research profiles, search people & jobs, and run your own outreach.",
    brand: "#0a66c2",
    implemented: true,
    actions: ["Research profiles & companies", "Search people & jobs", "Manage messages & invites"],
  },

  // ── Finance & Legal ─────────────────────────────────────────────
  {
    id: "stripe",
    name: "Stripe",
    category: "finance",
    logo: L("stripe.svg"),
    blurb: "Read payments, customers, and revenue data.",
    brand: "#635bff",
    implemented: true,
    actions: ["Query payments", "Summarise revenue", "Watch for disputes"],
  },
  {
    id: "brex",
    name: "Brex",
    category: "finance",
    logo: L("brex.svg"),
    blurb: "Track spend and reconcile expenses.",
    brand: "#111111",
    implemented: false,
    actions: ["Read transactions", "Categorise spend", "Flag anomalies"],
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    category: "finance",
    logo: L("quickbooks.svg"),
    blurb: "Pull invoices, bills, and reports.",
    brand: "#2ca01c",
    implemented: false,
    actions: ["Read invoices", "Summarise P&L", "Track receivables"],
  },
  {
    id: "docusign",
    name: "DocuSign",
    category: "finance",
    logo: L("docusign.svg"),
    blurb: "Track agreements and signature status.",
    brand: "#d8262c",
    implemented: false,
    actions: ["Check envelope status", "Summarise agreements", "Send reminders"],
  },

  // ── Data & Analytics ────────────────────────────────────────────
  {
    id: "snowflake",
    name: "Snowflake",
    category: "data",
    logo: L("snowflake.webp"),
    blurb: "Query your warehouse in natural language.",
    brand: "#29b5e8",
    implemented: false,
    actions: ["Run queries", "Summarise tables", "Build reports"],
  },
  {
    id: "bigquery",
    name: "BigQuery",
    category: "data",
    logo: L("bigquery.svg"),
    blurb: "Analyse datasets and surface insights.",
    brand: "#4285f4",
    implemented: false,
    actions: ["Run queries", "Summarise results", "Schedule digests"],
  },
  {
    id: "databricks",
    name: "Databricks",
    category: "data",
    logo: L("databricks.webp"),
    blurb: "Work with notebooks, tables, and jobs.",
    brand: "#ff3621",
    implemented: false,
    actions: ["Query tables", "Trigger jobs", "Summarise runs"],
  },
  {
    id: "looker",
    name: "Looker",
    category: "data",
    logo: L("looker.svg"),
    blurb: "Pull dashboards and explore metrics.",
    brand: "#4285f4",
    implemented: false,
    actions: ["Fetch dashboards", "Explore metrics", "Schedule reports"],
  },
  {
    id: "tableau",
    name: "Tableau",
    category: "data",
    logo: L("tableau.svg"),
    blurb: "Surface visualisations and data summaries.",
    brand: "#1f457e",
    implemented: false,
    actions: ["Read dashboards", "Summarise trends", "Export views"],
  },
  {
    id: "amplitude",
    name: "Amplitude",
    category: "data",
    logo: L("amplitude.webp"),
    blurb: "Read product analytics and cohorts.",
    brand: "#1f6fff",
    implemented: false,
    actions: ["Query events", "Summarise funnels", "Track cohorts"],
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    category: "data",
    logo: L("mixpanel.svg"),
    blurb: "Explore events and product metrics.",
    brand: "#7856ff",
    implemented: false,
    actions: ["Query events", "Summarise reports", "Track retention"],
  },

  // ── People & HR ─────────────────────────────────────────────────
  {
    id: "workday",
    name: "Workday",
    category: "hr",
    logo: L("workday.svg"),
    blurb: "Access HR records and org data.",
    brand: "#0875e1",
    implemented: false,
    actions: ["Query org chart", "Read records", "Summarise headcount"],
  },
  {
    id: "bamboohr",
    name: "BambooHR",
    category: "hr",
    logo: L("bamboohr.svg"),
    blurb: "Pull employee data and time-off info.",
    brand: "#73c41d",
    implemented: false,
    actions: ["Read directory", "Check time-off", "Summarise teams"],
  },

  // ── Added 2026-06-07 (catalog-backed) ───────────────────────────
  { id: "monday", name: "monday.com", category: "productivity", logo: L("monday.svg"), blurb: "Boards, items, and updates at agent speed.", brand: "#ff3d57", implemented: true, actions: ["Search boards & items", "Create & update items", "Post updates"] },
  { id: "motion", name: "Motion", category: "productivity", logo: L("motion.svg"), blurb: "AI calendar and auto-scheduled tasks.", brand: "#4c5fd7", implemented: true, actions: ["Read schedule", "Create tasks", "Find time"] },
  { id: "clockwise", name: "Clockwise", category: "productivity", logo: L("clockwise.svg"), blurb: "Focus time and smart calendar optimization.", brand: "#5b6ee1", implemented: true, actions: ["Read calendar", "Find focus time", "Optimize schedule"] },
  { id: "miro", name: "Miro", category: "productivity", logo: L("miro.svg"), blurb: "Boards, frames, and sticky notes.", brand: "#ffd02f", implemented: true, actions: ["Read boards", "Create items", "Summarize boards"] },
  { id: "loom", name: "Loom", category: "communication", logo: L("loom.svg"), blurb: "Video library, transcripts, and shares.", brand: "#625df5", implemented: true, actions: ["Search videos", "Read transcripts", "Summarize recordings"] },
  { id: "sentry", name: "Sentry", category: "development", logo: L("sentry.svg"), blurb: "Triage errors, issues, and releases.", brand: "#362d59", implemented: true, actions: ["Search issues", "Read stack traces", "Triage & resolve"] },
  { id: "pagerduty", name: "PagerDuty", category: "development", logo: L("pagerduty.svg"), blurb: "Incidents, services, and on-call schedules.", brand: "#06ac38", implemented: true, actions: ["Read & create incidents", "Check on-call", "Read schedules"] },
  { id: "pipedrive", name: "Pipedrive", category: "crm", logo: L("pipedrive.svg"), blurb: "Deals, contacts, and pipelines.", brand: "#017737", implemented: true, actions: ["Search deals", "Update stages", "Create contacts"] },
  { id: "shopify", name: "Shopify", category: "finance", logo: L("shopify.svg"), blurb: "Build on Shopify — docs & GraphQL schema.", brand: "#95bf47", implemented: true, actions: ["Search dev docs", "Explore GraphQL schema", "Validate queries"] },
  { id: "expensify", name: "Expensify", category: "finance", logo: L("expensify.svg"), blurb: "Expense reports and reimbursements.", brand: "#03d47c", implemented: true, actions: ["Read reports", "Create expenses", "Check status"] },
  { id: "zapier", name: "Zapier", category: "automation", logo: L("zapier.svg"), blurb: "Reach 8,000+ apps through one MCP endpoint.", brand: "#ff4f00", implemented: true, actions: ["Run actions across 8,000+ apps", "Trigger Zaps", "Search app data"] },
  { id: "make", name: "Make", category: "automation", logo: L("make.svg"), blurb: "Run scenarios across 2,000+ apps.", brand: "#6d00cc", implemented: true, actions: ["Trigger scenarios", "Run app actions", "Read data"] },
];

// A connector is "available" iff it has a live MCP catalog entry — derived so
// that adding an entry in mcp-catalog.ts automatically lights up its card here.
const CONNECTABLE = new Set(MCP_CATALOG.map((e) => e.id));

// Sub-products that connect through a suite's single OAuth (no separate server).
const COVERED_BY: Record<string, string> = {
  gmail: "google-workspace",
  // Calendar is served by the Google Workspace MCP, so its card connects the
  // Workspace suite (single OAuth) rather than a server of its own.
  "google-calendar": "google-workspace",
  // NOTE: "google-drive" is intentionally NOT covered by google-workspace —
  // it's a Cabinet-native (Drive for Desktop) integration with its own UI,
  // distinct from the Workspace MCP. See `native` above.
  "microsoft-teams": "microsoft-365",
  onedrive: "microsoft-365",
  sharepoint: "microsoft-365",
  confluence: "jira", // the Atlassian server covers Jira + Confluence
};

// Launch gate: only these connectors are live right now. Everything else is
// shown grayed-out + unclickable with a "Soon" badge, even if it already has
// an MCP catalog entry. Widen this set (or drop it back to the CONNECTABLE
// derivation below) as connectors are ready to ship.
const LAUNCHED = new Set([
  "telegram",
  "discord",
  "google-drive",
  "gmail",
  "google-workspace",
  "google-calendar",
  "microsoft-365",
  "microsoft-teams",
  "notion",
  "slack",
]);

export const PREVIEW_INTEGRATIONS: IntegrationItem[] = RAW_INTEGRATIONS.map((i) => {
  const coveredBy = COVERED_BY[i.id];
  const connectable =
    CONNECTABLE.has(i.id) || (!!coveredBy && CONNECTABLE.has(coveredBy));
  return {
    ...i,
    coveredBy,
    // Native integrations are always available (in-app UI). MCP/OAuth connectors
    // are gated by the launch list until their connect flow is ready.
    implemented: i.native ? true : connectable && LAUNCHED.has(i.id),
  };
});

/** The catalog id to actually connect for a card — itself, or its suite. */
export function connectTargetFor(id: string): string {
  if (CONNECTABLE.has(id)) return id;
  const covered = COVERED_BY[id];
  return covered && CONNECTABLE.has(covered) ? covered : id;
}

/** Quick lookup by id. */
export const INTEGRATION_BY_ID: Record<string, IntegrationItem> = Object.fromEntries(
  PREVIEW_INTEGRATIONS.map((i) => [i.id, i]),
);

export const IMPLEMENTED_COUNT = PREVIEW_INTEGRATIONS.filter(
  (i) => i.implemented,
).length;

/** Case-insensitive filter across name, blurb, and category label. */
export function filterIntegrations(
  items: IntegrationItem[],
  query: string,
): IntegrationItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (i) =>
      i.name.toLowerCase().includes(q) ||
      i.blurb.toLowerCase().includes(q) ||
      CATEGORY_META[i.category].label.toLowerCase().includes(q) ||
      i.id.includes(q),
  );
}

/** Group items by category, preserving CATEGORY_ORDER and dropping empties. */
export function groupByCategory(
  items: IntegrationItem[],
): { category: IntegrationCategory; label: string; items: IntegrationItem[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_META[category].label,
    items: items.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0);
}
