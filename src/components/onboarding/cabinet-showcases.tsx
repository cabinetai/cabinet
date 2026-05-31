"use client";

// "How people use Cabinet" showcases for the onboarding "What is a Cabinet?"
// step. The window mockup (chrome + sidebar with Agents/Files + a page preview)
// is a faithful port of the cabinet-website "How people actually use Cabinet"
// section. Sample content is inline English (illustrative, like the help demos);
// no em-dashes per the copy rule.

import {
  AppWindow,
  FileText,
  FileType,
  Folder,
  GitBranch,
  Globe,
  Search,
  Table,
} from "lucide-react";

const C = {
  bg: "#FAF6F1",
  bgWarm: "#F3EDE4",
  bgCard: "#FFFFFF",
  text: "#3B2F2F",
  textSecondary: "#6B5B4F",
  textTertiary: "#A89888",
  accent: "#8B5E3C",
  accentBg: "#F5E6D3",
  border: "#E8DDD0",
  borderLight: "#F0E8DD",
  borderDark: "#D4C4B0",
};

type FileType_ = "folder" | "md" | "csv" | "html" | "app" | "yaml" | "pdf";

export type ShowcaseAgent = { emoji: string; name: string; pulse?: boolean };
export type ShowcaseFile = {
  name: string;
  type: FileType_;
  depth: number;
  active?: boolean;
  badge?: string;
};
export type PreviewLine =
  | { t: "h1" | "h2" | "meta"; v: string }
  | { t: "p"; w: number }
  | { t: "tags"; v: string[] }
  | { t: "table"; cols: string[]; rows: string[][] };

export type ShowcaseApp = "okr" | "review" | "sales" | "trip";

export type CabinetShowcase = {
  id: string;
  label: string;
  emoji: string;
  projectName: string;
  agents: ShowcaseAgent[];
  files: ShowcaseFile[];
  /** Document-style page (skeleton lines), like a markdown doc. */
  preview?: { lines: PreviewLine[] };
  /** Or a live "webapp" page rendered with its own UI (HTML app). */
  app?: ShowcaseApp;
};

export const CABINET_SHOWCASES: CabinetShowcase[] = [
  {
    id: "execs-okrs",
    label: "Execs · OKRs",
    emoji: "🎯",
    projectName: "leadership-os",
    agents: [
      { emoji: "🧭", name: "Chief of Staff", pulse: true },
      { emoji: "📊", name: "OKR Tracker" },
      { emoji: "📈", name: "Metrics Analyst" },
    ],
    files: [
      { name: "okrs/", type: "folder", depth: 0 },
      { name: "q2-okrs/", type: "app", depth: 1, active: true },
      { name: "q1-review.md", type: "md", depth: 1 },
      { name: "strategy/", type: "folder", depth: 0 },
      { name: "vision.md", type: "md", depth: 1 },
      { name: "board/", type: "folder", depth: 0 },
      { name: "may-update.md", type: "md", depth: 1, badge: "new" },
      { name: "metrics/", type: "folder", depth: 0 },
      { name: "north-star.csv", type: "csv", depth: 1 },
    ],
    app: "okr",
  },
  {
    id: "hr-reviews",
    label: "HR · Reviews",
    emoji: "👥",
    projectName: "people-ops",
    agents: [
      { emoji: "🧑‍💼", name: "People Ops", pulse: true },
      { emoji: "📋", name: "Review Coordinator" },
      { emoji: "⚖️", name: "Calibration Bot" },
    ],
    files: [
      { name: "reviews/", type: "folder", depth: 0 },
      { name: "spring-2026/", type: "app", depth: 1, active: true },
      { name: "templates/", type: "folder", depth: 1 },
      { name: "self-review.md", type: "md", depth: 2 },
      { name: "people/", type: "folder", depth: 0 },
      { name: "directory.csv", type: "csv", depth: 1 },
      { name: "growth/", type: "folder", depth: 0 },
      { name: "ladders.md", type: "md", depth: 1, badge: "updated" },
    ],
    app: "review",
  },
  {
    id: "sales-pipeline",
    label: "Sales · Pipeline",
    emoji: "💹",
    projectName: "sales-os",
    agents: [
      { emoji: "🕵️", name: "Lead Researcher", pulse: true },
      { emoji: "📈", name: "Pipeline Tracker", pulse: true },
      { emoji: "💬", name: "Outreach Writer" },
    ],
    files: [
      { name: "pipeline/", type: "folder", depth: 0 },
      { name: "dashboard/", type: "app", depth: 1, active: true },
      { name: "deals.csv", type: "csv", depth: 1 },
      { name: "accounts/", type: "folder", depth: 0 },
      { name: "enterprise.md", type: "md", depth: 1, badge: "new" },
      { name: "playbooks/", type: "folder", depth: 0 },
      { name: "discovery.md", type: "md", depth: 1 },
    ],
    app: "sales",
  },
  {
    id: "thailand-trip",
    label: "Thailand Trip",
    emoji: "🏝️",
    projectName: "thailand-2026",
    agents: [
      { emoji: "🗺️", name: "Trip Planner", pulse: true },
      { emoji: "🏨", name: "Stay Finder" },
      { emoji: "🍜", name: "Food Scout" },
    ],
    files: [
      { name: "itinerary/", type: "folder", depth: 0 },
      { name: "map/", type: "app", depth: 1, active: true },
      { name: "day-by-day.md", type: "md", depth: 1 },
      { name: "bookings/", type: "folder", depth: 0 },
      { name: "flights.md", type: "md", depth: 1, badge: "new" },
      { name: "hotels.md", type: "md", depth: 1 },
      { name: "ideas/", type: "folder", depth: 0 },
      { name: "food.md", type: "md", depth: 1 },
      { name: "temples.md", type: "md", depth: 1, badge: "updated" },
    ],
    app: "trip",
  },
  {
    id: "indie-app",
    label: "B2C App",
    emoji: "📱",
    projectName: "my-b2c-app",
    agents: [
      { emoji: "🔍", name: "Reddit Scout", pulse: true },
      { emoji: "📊", name: "Competitor Analyst" },
      { emoji: "📝", name: "Content Writer" },
    ],
    files: [
      { name: "product/", type: "folder", depth: 0 },
      { name: "app-store-listing.md", type: "md", depth: 1, active: true },
      { name: "roadmap.md", type: "md", depth: 1 },
      { name: "pricing.md", type: "md", depth: 1 },
      { name: "market/", type: "folder", depth: 0 },
      { name: "competitors/", type: "folder", depth: 1 },
      { name: "week-14.md", type: "md", depth: 2, badge: "new" },
      { name: "positioning.md", type: "md", depth: 1 },
      { name: "data/", type: "folder", depth: 0 },
      { name: "analytics.csv", type: "csv", depth: 1 },
    ],
    preview: {
      lines: [
        { t: "h1", v: "App Store Listing" },
        { t: "meta", v: "Updated by Content Writer · 2 hours ago" },
        { t: "h2", v: "Short Description" },
        { t: "p", w: 95 },
        { t: "p", w: 72 },
        { t: "h2", v: "Keywords" },
        { t: "tags", v: ["b2c", "productivity", "ios", "mobile", "startup"] },
        { t: "h2", v: "What's New in v4.2" },
        { t: "p", w: 88 },
        { t: "p", w: 60 },
      ],
    },
  },
  {
    id: "content-engine",
    label: "Content Engine",
    emoji: "📣",
    projectName: "content-engine",
    agents: [
      { emoji: "🧭", name: "Content Strategist", pulse: true },
      { emoji: "✍️", name: "SEO Writer" },
      { emoji: "📅", name: "Social Scheduler" },
    ],
    files: [
      { name: "content/", type: "folder", depth: 0 },
      { name: "calendar.md", type: "md", depth: 1, active: true },
      { name: "blog/", type: "folder", depth: 1 },
      { name: "ai-tools-2026.md", type: "md", depth: 2, badge: "new" },
      { name: "remote-work.md", type: "md", depth: 2 },
      { name: "social/", type: "folder", depth: 0 },
      { name: "linkedin.md", type: "md", depth: 1 },
      { name: "twitter.md", type: "md", depth: 1, badge: "updated" },
      { name: "seo/", type: "folder", depth: 0 },
      { name: "keywords.csv", type: "csv", depth: 1 },
    ],
    preview: {
      lines: [
        { t: "h1", v: "Content Calendar" },
        { t: "meta", v: "Updated by Content Strategist · this morning" },
        { t: "h2", v: "This Week" },
        { t: "p", w: 96 },
        { t: "p", w: 70 },
        { t: "h2", v: "Pillars" },
        { t: "tags", v: ["SEO", "thought leadership", "product", "community"] },
        { t: "h2", v: "In Progress" },
        { t: "p", w: 88 },
        { t: "p", w: 62 },
      ],
    },
  },
  {
    id: "b2b-sales",
    label: "B2B Sales",
    emoji: "💼",
    projectName: "acme-sales",
    agents: [
      { emoji: "🕵️", name: "Lead Researcher", pulse: true },
      { emoji: "✉️", name: "Outreach Writer", pulse: true },
      { emoji: "📈", name: "Pipeline Tracker" },
    ],
    files: [
      { name: "leads/", type: "folder", depth: 0 },
      { name: "pipeline.csv", type: "csv", depth: 1, active: true },
      { name: "leads-raw.csv", type: "csv", depth: 1 },
      { name: "intel/", type: "folder", depth: 0 },
      { name: "companies/", type: "folder", depth: 1 },
      { name: "techcorp.md", type: "md", depth: 2, badge: "new" },
      { name: "outreach/", type: "folder", depth: 0 },
      { name: "templates/", type: "folder", depth: 1 },
      { name: "cold-email.md", type: "md", depth: 2 },
      { name: "tools/", type: "folder", depth: 0 },
      { name: "pipeline-dashboard/", type: "html", depth: 1 },
    ],
    preview: {
      lines: [
        { t: "h1", v: "pipeline.csv" },
        { t: "meta", v: "87 rows · Updated by Lead Researcher · just now" },
        {
          t: "table",
          cols: ["Company", "Contact", "Status", "Score"],
          rows: [
            ["TechCorp Inc", "Alice Chen", "✅ Researched", "87"],
            ["StartupXYZ", "Bob Lee", "📝 Drafted", "72"],
            ["GlobalDev", "Carol Kim", "📤 Sent", "91"],
            ["NewCo Ltd", "Dan Park", "🔍 Researching…", "—"],
          ],
        },
      ],
    },
  },
  {
    id: "newsletter",
    label: "Newsletter",
    emoji: "✍️",
    projectName: "my-newsletter",
    agents: [
      { emoji: "📡", name: "Trend Scout", pulse: true },
      { emoji: "🖊️", name: "Draft Writer" },
      { emoji: "🔎", name: "SEO Reviewer" },
    ],
    files: [
      { name: "newsletter/", type: "folder", depth: 0 },
      { name: "issues/", type: "folder", depth: 1 },
      { name: "2026-w14.md", type: "md", depth: 2, active: true, badge: "new" },
      { name: "2026-w13.md", type: "md", depth: 2 },
      { name: "brand/", type: "folder", depth: 0 },
      { name: "voice-guide.md", type: "md", depth: 1 },
      { name: "research/", type: "folder", depth: 0 },
      { name: "sources.md", type: "md", depth: 1 },
      { name: "hn-picks.md", type: "md", depth: 1, badge: "updated" },
    ],
    preview: {
      lines: [
        { t: "h1", v: "Week 14: The AI Stack Shift" },
        { t: "meta", v: "Drafted by Draft Writer · Monday 8:14am · ready for review" },
        { t: "h2", v: "This week's signal" },
        { t: "p", w: 100 },
        { t: "p", w: 82 },
        { t: "p", w: 91 },
        { t: "h2", v: "Top picks" },
        { t: "p", w: 95 },
        { t: "p", w: 70 },
        { t: "tags", v: ["AI", "tooling", "indie hackers", "dev tools"] },
      ],
    },
  },
  {
    id: "tiktok",
    label: "TikTok Factory",
    emoji: "🎬",
    projectName: "tiktok-factory",
    agents: [
      { emoji: "🔥", name: "Trend Spotter", pulse: true },
      { emoji: "🎬", name: "Script Writer", pulse: true },
      { emoji: "🪝", name: "Hook Tester" },
    ],
    files: [
      { name: "trends/", type: "folder", depth: 0 },
      { name: "this-week.md", type: "md", depth: 1, active: true, badge: "new" },
      { name: "sounds.md", type: "md", depth: 1 },
      { name: "scripts/", type: "folder", depth: 0 },
      { name: "hook-vs-payoff.md", type: "md", depth: 1 },
      { name: "product-demo.md", type: "md", depth: 1 },
      { name: "hooks/", type: "folder", depth: 0 },
      { name: "tested.csv", type: "csv", depth: 1 },
      { name: "posts/", type: "folder", depth: 0 },
      { name: "calendar.md", type: "md", depth: 1 },
    ],
    preview: {
      lines: [
        { t: "h1", v: "Hook + Payoff Script" },
        { t: "meta", v: "Drafted by Script Writer · 12 min ago" },
        { t: "h2", v: "Hook (0 to 3s)" },
        { t: "p", w: 92 },
        { t: "p", w: 64 },
        { t: "h2", v: "Payoff" },
        { t: "p", w: 88 },
        { t: "p", w: 70 },
        { t: "tags", v: ["trending", "duet", "how-to", "founder"] },
      ],
    },
  },
  {
    id: "product-team",
    label: "Product Team",
    emoji: "🧩",
    projectName: "product-team",
    agents: [
      { emoji: "🧭", name: "Product Manager", pulse: true },
      { emoji: "🎨", name: "UX Designer" },
      { emoji: "🔬", name: "User Researcher" },
    ],
    files: [
      { name: "roadmap.md", type: "md", depth: 0 },
      { name: "specs/", type: "folder", depth: 0 },
      { name: "onboarding-v2.md", type: "md", depth: 1, active: true, badge: "new" },
      { name: "billing.md", type: "md", depth: 1 },
      { name: "research/", type: "folder", depth: 0 },
      { name: "interviews/", type: "folder", depth: 1 },
      { name: "p-014.md", type: "md", depth: 2 },
      { name: "feedback.csv", type: "csv", depth: 1, badge: "updated" },
      { name: "design/", type: "folder", depth: 0 },
      { name: "flows.md", type: "md", depth: 1 },
    ],
    preview: {
      lines: [
        { t: "h1", v: "Onboarding v2 Spec" },
        { t: "meta", v: "Reviewed by Product Manager · yesterday" },
        { t: "h2", v: "Problem" },
        { t: "p", w: 98 },
        { t: "p", w: 76 },
        { t: "h2", v: "Proposed Solution" },
        { t: "p", w: 90 },
        { t: "p", w: 84 },
        { t: "h2", v: "Success Metrics" },
        { t: "tags", v: ["activation", "time-to-value", "retention"] },
      ],
    },
  },
  {
    id: "second-brain",
    label: "Second Brain",
    emoji: "🧠",
    projectName: "second-brain",
    agents: [
      { emoji: "🧩", name: "Note Synthesizer", pulse: true },
      { emoji: "📚", name: "Librarian" },
      { emoji: "🔁", name: "Daily Reviewer" },
    ],
    files: [
      { name: "daily/", type: "folder", depth: 0 },
      { name: "2026-05-23.md", type: "md", depth: 1, active: true, badge: "new" },
      { name: "2026-05-22.md", type: "md", depth: 1 },
      { name: "areas/", type: "folder", depth: 0 },
      { name: "health.md", type: "md", depth: 1 },
      { name: "career.md", type: "md", depth: 1 },
      { name: "reading.md", type: "md", depth: 1, badge: "updated" },
      { name: "notes/", type: "folder", depth: 0 },
      { name: "ideas.md", type: "md", depth: 1 },
      { name: "sources.md", type: "md", depth: 0 },
    ],
    preview: {
      lines: [
        { t: "h1", v: "Daily Note" },
        { t: "meta", v: "Synthesized by Note Synthesizer · 6:00am" },
        { t: "h2", v: "Highlights" },
        { t: "p", w: 94 },
        { t: "p", w: 68 },
        { t: "h2", v: "Linked Ideas" },
        { t: "p", w: 88 },
        { t: "p", w: 72 },
        { t: "tags", v: ["pkm", "zettelkasten", "review", "focus"] },
      ],
    },
  },
  {
    id: "consulting",
    label: "Consulting",
    emoji: "🏢",
    projectName: "consulting-kb",
    agents: [
      { emoji: "🗒️", name: "Meeting Summariser" },
      { emoji: "📄", name: "Proposal Writer", pulse: true },
      { emoji: "🔗", name: "Research Assistant" },
    ],
    files: [
      { name: "clients/", type: "folder", depth: 0 },
      { name: "acme/", type: "folder", depth: 1 },
      { name: "strategy.md", type: "md", depth: 2, active: true },
      { name: "meeting-notes/", type: "folder", depth: 2 },
      { name: "2026-03-28.md", type: "md", depth: 3 },
      { name: "globex/", type: "folder", depth: 1 },
      { name: "proposal-v3.md", type: "md", depth: 2, badge: "updated" },
      { name: "templates/", type: "folder", depth: 0 },
      { name: "proposal.md", type: "md", depth: 1 },
    ],
    preview: {
      lines: [
        { t: "h1", v: "Acme: Q2 Strategy" },
        { t: "meta", v: "Updated after kickoff call · 3 days ago" },
        { t: "h2", v: "Current Focus" },
        { t: "p", w: 100 },
        { t: "p", w: 75 },
        { t: "h2", v: "Open Questions" },
        { t: "p", w: 90 },
        { t: "p", w: 65 },
        { t: "h2", v: "Next Steps" },
        { t: "p", w: 82 },
      ],
    },
  },
  {
    id: "oss",
    label: "Open Source",
    emoji: "⚙️",
    projectName: "my-oss-lib",
    agents: [
      { emoji: "📋", name: "Release Writer" },
      { emoji: "📖", name: "Docs Updater", pulse: true },
      { emoji: "📣", name: "Announcer" },
    ],
    files: [
      { name: "docs/", type: "folder", depth: 0 },
      { name: "getting-started.md", type: "md", depth: 1 },
      { name: "api-reference.md", type: "md", depth: 1 },
      { name: "contributing.md", type: "md", depth: 1 },
      { name: "changelog.md", type: "md", depth: 0, active: true, badge: "updated" },
      { name: "releases/", type: "folder", depth: 0 },
      { name: "v2.1.0.md", type: "md", depth: 1, badge: "new" },
      { name: ".repo.yaml", type: "yaml", depth: 0 },
    ],
    preview: {
      lines: [
        { t: "h1", v: "Changelog" },
        { t: "meta", v: "Written by Release Writer · just now · linked to github/my-lib" },
        { t: "h2", v: "v2.1.0 · 2026-04-02" },
        { t: "p", w: 98 },
        { t: "p", w: 80 },
        { t: "p", w: 68 },
        { t: "h2", v: "v2.0.0 · 2026-03-15" },
        { t: "p", w: 85 },
        { t: "p", w: 72 },
      ],
    },
  },
  {
    id: "startup",
    label: "Startup OS",
    emoji: "🚀",
    projectName: "my-startup",
    agents: [
      { emoji: "🎯", name: "CEO Agent", pulse: true },
      { emoji: "📊", name: "Market Scout" },
      { emoji: "✅", name: "OKR Tracker" },
    ],
    files: [
      { name: "strategy/", type: "folder", depth: 0 },
      { name: "q2-plan.md", type: "md", depth: 1, active: true },
      { name: "vision.md", type: "md", depth: 1 },
      { name: "product/", type: "folder", depth: 0 },
      { name: "roadmap.md", type: "md", depth: 1 },
      { name: "market/", type: "folder", depth: 0 },
      { name: "icp.md", type: "md", depth: 1 },
      { name: "competitors.md", type: "md", depth: 1, badge: "updated" },
      { name: "tools/", type: "folder", depth: 0 },
      { name: "okr-tracker/", type: "app", depth: 1 },
    ],
    preview: {
      lines: [
        { t: "h1", v: "Q2 Plan: 2026" },
        { t: "meta", v: "Reviewed by CEO Agent · today · 3 open questions flagged" },
        { t: "h2", v: "North Star" },
        { t: "p", w: 93 },
        { t: "p", w: 70 },
        { t: "h2", v: "OKRs" },
        { t: "p", w: 88 },
        { t: "p", w: 75 },
        { t: "tags", v: ["growth", "retention", "Q2-2026", "fundraising"] },
      ],
    },
  },
];

function NodeIcon({ type, active }: { type: FileType_; active: boolean }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (type === "folder") return <Folder className={cls} style={{ color: C.textTertiary }} />;
  if (type === "csv") return <Table className={cls} style={{ color: "#16a34a" }} />;
  if (type === "html") return <Globe className={cls} style={{ color: "#3b82f6" }} />;
  if (type === "app") return <AppWindow className={cls} style={{ color: "#16a34a" }} />;
  if (type === "yaml") return <GitBranch className={cls} style={{ color: "#f59e0b" }} />;
  if (type === "pdf") return <FileType className={cls} style={{ color: "#ef4444" }} />;
  return <FileText className={cls} style={{ color: active ? C.accent : C.textTertiary }} />;
}

function displayName(name: string, type: FileType_) {
  if (type === "md" && name.endsWith(".md")) return name.slice(0, -3);
  return name;
}

/* ─── Live "webapp" pages — pages that render their own UI ─── */

function pctColor(p: number) {
  return p >= 70 ? "#16a34a" : p >= 40 ? "#d97706" : "#dc2626";
}

function Bar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: C.borderLight }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color ?? C.accent }} />
    </div>
  );
}

function AppHeader({ title, pill }: { title: string; pill: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h1 className="font-logo text-[17px] font-bold leading-tight" style={{ color: C.text }}>
        {title}
      </h1>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold"
        style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.borderDark}` }}
      >
        {pill}
      </span>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex-1 rounded-lg px-2.5 py-2" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
      <div className="font-mono text-[9px] uppercase tracking-wide" style={{ color: C.textTertiary }}>
        {label}
      </div>
      <div className="text-[15px] font-bold" style={{ color: accent ?? C.text }}>
        {value}
      </div>
    </div>
  );
}

function OkrApp() {
  const overall = 68;
  const objectives = [
    {
      title: "Grow ARR to $2M",
      status: "On track",
      statusColor: "#16a34a",
      krs: [
        { label: "New business ARR", pct: 80 },
        { label: "Expansion ARR", pct: 62 },
      ],
    },
    {
      title: "Ship the mobile app",
      status: "At risk",
      statusColor: "#dc2626",
      krs: [
        { label: "Closed beta: 1,000 users", pct: 45 },
        { label: "App Store rating 4.5", pct: 90 },
      ],
    },
    {
      title: "Lift net retention",
      status: "On track",
      statusColor: "#16a34a",
      krs: [{ label: "NRR to 115%", pct: 72 }],
    },
  ];
  return (
    <div className="p-4">
      <AppHeader title="Company OKRs" pill="Q2 2026" />
      <div className="mb-3 rounded-lg px-3 py-2.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <div className="mb-1 flex items-center justify-between font-mono text-[10px]" style={{ color: C.textSecondary }}>
          <span>Overall progress</span>
          <span className="font-bold" style={{ color: C.text }}>{overall}%</span>
        </div>
        <Bar pct={overall} color={C.accent} />
      </div>
      <div className="space-y-2">
        {objectives.map((o) => (
          <div key={o.title} className="rounded-lg px-3 py-2.5" style={{ background: C.bgCard, border: `1px solid ${C.border}` }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold" style={{ color: C.text }}>{o.title}</span>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[8.5px] font-semibold" style={{ background: `${o.statusColor}1a`, color: o.statusColor }}>
                {o.status}
              </span>
            </div>
            <div className="space-y-1.5">
              {o.krs.map((kr) => (
                <div key={kr.label}>
                  <div className="mb-0.5 flex items-center justify-between font-mono text-[9.5px]">
                    <span style={{ color: C.textSecondary }}>{kr.label}</span>
                    <span style={{ color: pctColor(kr.pct) }}>{kr.pct}%</span>
                  </div>
                  <Bar pct={kr.pct} color={pctColor(kr.pct)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewApp() {
  const people = [
    { name: "Maya Chen", role: "Engineering", status: "Done", color: "#16a34a", score: 4.4 },
    { name: "Sam Patel", role: "Design", status: "In review", color: "#d97706", score: 4.0 },
    { name: "Lior Adler", role: "Sales", status: "Done", color: "#16a34a", score: 3.8 },
    { name: "Priya Rao", role: "Marketing", status: "Pending", color: "#a89888", score: null as number | null },
    { name: "Tom Becker", role: "Operations", status: "In review", color: "#d97706", score: 4.1 },
  ];
  return (
    <div className="p-4">
      <AppHeader title="Performance Reviews" pill="Spring 2026" />
      <div className="mb-3 flex gap-2">
        <StatTile label="Completed" value="24/30" />
        <StatTile label="Calibration" value="May 30" />
        <StatTile label="Avg score" value="3.9" accent={C.accent} />
      </div>
      <div className="space-y-1.5">
        {people.map((p) => (
          <div key={p.name} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2" style={{ background: C.bgCard, border: `1px solid ${C.border}` }}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: C.accent }}>
              {p.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold" style={{ color: C.text }}>{p.name}</div>
              <div className="truncate font-mono text-[9px]" style={{ color: C.textTertiary }}>{p.role}</div>
            </div>
            {p.score != null ? (
              <div className="w-12 shrink-0">
                <div className="mb-0.5 text-right font-mono text-[9px]" style={{ color: C.textSecondary }}>{p.score.toFixed(1)}</div>
                <Bar pct={(p.score / 5) * 100} color={C.accent} />
              </div>
            ) : (
              <span className="w-12 shrink-0 text-right font-mono text-[9px]" style={{ color: C.textTertiary }}>n/a</span>
            )}
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[8.5px] font-semibold" style={{ background: `${p.color}1a`, color: p.color }}>
              {p.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SalesApp() {
  const bars = [40, 55, 48, 70, 62, 85, 78, 96];
  const max = Math.max(...bars);
  const deals = [
    { name: "TechCorp", amount: "$120K", stage: "Negotiation", color: "#d97706" },
    { name: "Globex", amount: "$90K", stage: "Proposal", color: "#2563eb" },
    { name: "Initech", amount: "$210K", stage: "Closed", color: "#16a34a" },
  ];
  return (
    <div className="p-4">
      <AppHeader title="Pipeline" pill="This quarter" />
      <div className="mb-3 flex gap-2">
        <StatTile label="Pipeline" value="$1.2M" />
        <StatTile label="Closed" value="$480K" accent="#16a34a" />
        <StatTile label="Win rate" value="32%" accent={C.accent} />
      </div>
      <div className="mb-3 rounded-lg px-3 py-2.5" style={{ background: C.bgCard, border: `1px solid ${C.border}` }}>
        <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wide" style={{ color: C.textTertiary }}>
          New pipeline · last 8 weeks
        </div>
        <div className="flex items-end gap-1.5" style={{ height: 56 }}>
          {bars.map((b, i) => (
            <div
              key={i}
              className="flex-1 rounded-t"
              style={{
                height: `${(b / max) * 100}%`,
                background: i === bars.length - 1 ? C.accent : C.accentBg,
                border: `1px solid ${C.borderDark}`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {deals.map((d) => (
          <div key={d.name} className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: C.bgCard, border: `1px solid ${C.border}` }}>
            <span className="flex-1 truncate text-[11px] font-semibold" style={{ color: C.text }}>{d.name}</span>
            <span className="font-mono text-[11px] font-semibold" style={{ color: C.text }}>{d.amount}</span>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[8.5px] font-semibold" style={{ background: `${d.color}1a`, color: d.color }}>
              {d.stage}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TripApp() {
  // Pins positioned as percentages over the stylized map.
  const stops = [
    { id: "cnx", emoji: "🛕", name: "Chiang Mai", left: 30, top: 18 },
    { id: "bkk", emoji: "🏙️", name: "Bangkok", left: 47, top: 45 },
    { id: "hkt", emoji: "🏝️", name: "Phuket", left: 30, top: 80 },
    { id: "kbv", emoji: "🐚", name: "Krabi", left: 46, top: 83 },
    { id: "usm", emoji: "🤿", name: "Koh Samui", left: 65, top: 71 },
  ];
  const order = ["bkk", "cnx", "hkt", "kbv", "usm"];
  const points = order
    .map((id) => stops.find((s) => s.id === id))
    .filter((s): s is (typeof stops)[number] => !!s)
    .map((s) => `${s.left},${s.top}`)
    .join(" ");
  const suggestions = [
    { emoji: "🛕", name: "Wat Phra Singh", note: "Old City temples", tag: "Day 2" },
    { emoji: "🐘", name: "Elephant sanctuary", note: "Ethical, half day", tag: "Day 3" },
    { emoji: "🍜", name: "Khao soi crawl", note: "Best northern noodles", tag: "Food" },
    { emoji: "🛶", name: "Phi Phi islands", note: "Long-tail boat tour", tag: "Day 6" },
  ];
  return (
    <div className="p-4">
      <AppHeader title="Thailand Trip" pill="9 days · Mar 2026" />
      {/* Map */}
      <div
        className="relative mb-3 overflow-hidden rounded-lg"
        style={{ height: 156, background: "linear-gradient(160deg,#E7F1EE,#D7E7E2)", border: `1px solid ${C.border}` }}
      >
        {/* Stylized land masses */}
        <div className="absolute" style={{ left: "13%", top: "5%", width: "44%", height: "60%", background: "#E5DCC2", borderRadius: "58% 42% 50% 50% / 55% 60% 40% 45%", transform: "rotate(-8deg)" }} />
        <div className="absolute" style={{ left: "24%", top: "52%", width: "22%", height: "46%", background: "#E5DCC2", borderRadius: "50% 50% 60% 40% / 40% 40% 60% 60%", transform: "rotate(7deg)" }} />
        <div className="absolute" style={{ left: "55%", top: "50%", width: "24%", height: "38%", background: "#E5DCC2", borderRadius: "50%", opacity: 0.9 }} />
        {/* Route */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polyline points={points} fill="none" stroke={C.accent} strokeWidth="0.7" strokeDasharray="2 2" opacity="0.65" />
        </svg>
        {/* Pins with photo-style emoji bubbles */}
        {stops.map((s) => (
          <div
            key={s.id}
            className="absolute flex flex-col items-center"
            style={{ left: `${s.left}%`, top: `${s.top}%`, transform: "translate(-50%,-50%)" }}
          >
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-[13px]"
              style={{ background: "#fff", border: `2px solid ${C.accent}`, boxShadow: "0 2px 6px -2px rgba(59,47,47,0.4)" }}
            >
              {s.emoji}
            </div>
            <span
              className="mt-0.5 rounded px-1 py-px font-mono text-[8px] font-semibold"
              style={{ background: "rgba(255,255,255,0.88)", color: C.text }}
            >
              {s.name}
            </span>
          </div>
        ))}
      </div>
      {/* Suggestions with image thumbnails */}
      <div className="grid grid-cols-2 gap-2">
        {suggestions.map((s) => (
          <div key={s.name} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: C.bgCard, border: `1px solid ${C.border}` }}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base" style={{ background: C.accentBg }}>
              {s.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold" style={{ color: C.text }}>{s.name}</div>
              <div className="truncate font-mono text-[9px]" style={{ color: C.textTertiary }}>{s.note}</div>
            </div>
            <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold" style={{ background: C.accentBg, color: C.accent }}>
              {s.tag}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The macOS-style window mockup, ported from the cabinet-website. */
export function ShowcaseWindow({ showcase }: { showcase: CabinetShowcase }) {
  return (
    <div
      className="overflow-hidden rounded-xl text-left"
      style={{
        border: `1px solid ${C.border}`,
        boxShadow: "0 1px 0 rgba(59,47,47,0.04), 0 30px 60px -32px rgba(59,47,47,0.45)",
      }}
    >
      {/* Window chrome */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ background: C.bgWarm, borderBottom: `1px solid ${C.border}` }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f87171" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#fbbf24" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#34d399" }} />
        <div className="mx-3 flex flex-1 items-center justify-center gap-1.5">
          <span className="font-logo text-[12px] italic" style={{ color: C.text }}>
            Cabinet
          </span>
          <span className="text-[11px]" style={{ color: C.textTertiary }}>
            /
          </span>
          <span className="truncate font-mono text-[11px]" style={{ color: C.textTertiary }}>
            {showcase.projectName}
          </span>
        </div>
        <Search className="h-3.5 w-3.5" style={{ color: C.textTertiary }} />
      </div>

      {/* Body */}
      <div className="flex" style={{ height: 300 }}>
        {/* Sidebar */}
        <div
          className="flex shrink-0 flex-col"
          style={{ width: 200, background: C.bg, borderInlineEnd: `1px solid ${C.border}` }}
        >
          {/* Cabinet header */}
          <div
            className="flex items-center gap-2 px-3 py-3"
            style={{ borderBottom: `1px solid ${C.border}` }}
          >
            <span className="text-sm leading-none">{showcase.emoji}</span>
            <span className="truncate font-mono text-[12px] font-semibold" style={{ color: C.text }}>
              {showcase.projectName}
            </span>
          </div>
          {/* Agents */}
          <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
            <p
              className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.15em]"
              style={{ color: C.textTertiary }}
            >
              Agents
            </p>
            <div className="space-y-1.5">
              {showcase.agents.map((a) => (
                <div key={a.name} className="flex items-center gap-1.5">
                  <span className="text-xs leading-none">{a.emoji}</span>
                  <span className="flex-1 truncate font-mono text-[11px]" style={{ color: C.textSecondary }}>
                    {a.name}
                  </span>
                  {a.pulse ? (
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "#4ade80" }} />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "#22c55e" }} />
                    </span>
                  ) : (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.borderDark }} />
                  )}
                </div>
              ))}
            </div>
          </div>
          {/* Files */}
          <div className="flex-1 overflow-y-auto py-1">
            <p
              className="px-3 pb-1 pt-1.5 font-mono text-[9px] uppercase tracking-[0.15em]"
              style={{ color: C.textTertiary }}
            >
              Files
            </p>
            {showcase.files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-1.5 py-[3px] font-mono text-[11px]"
                style={{
                  paddingInlineStart: 8 + f.depth * 12,
                  paddingInlineEnd: 8,
                  background: f.active ? C.accentBg : "transparent",
                  borderInlineStart: `2px solid ${f.active ? C.accent : "transparent"}`,
                  color: f.active ? C.accent : C.textSecondary,
                }}
              >
                <NodeIcon type={f.type} active={!!f.active} />
                <span className="flex-1 truncate" style={{ fontWeight: f.active ? 500 : 400 }}>
                  {displayName(f.name, f.type)}
                </span>
                {f.badge && (
                  <span
                    className="shrink-0 rounded px-1 py-px font-mono text-[8px] leading-none"
                    style={{ background: "#ecfdf5", color: "#16a34a", border: "1px solid #bbf7d0" }}
                  >
                    {f.badge}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content pane — a markdown-style doc, or a live "webapp" page */}
        <div className="flex-1 overflow-y-auto" style={{ background: C.bgCard }}>
          {showcase.app === "okr" ? (
            <OkrApp />
          ) : showcase.app === "review" ? (
            <ReviewApp />
          ) : showcase.app === "sales" ? (
            <SalesApp />
          ) : showcase.app === "trip" ? (
            <TripApp />
          ) : (
            <div className="p-5">
              {(showcase.preview?.lines ?? []).map((line, i) => {
            if (line.t === "h1") {
              return (
                <div key={i} className="font-logo text-[17px] font-bold leading-tight" style={{ color: C.text }}>
                  {line.v}
                </div>
              );
            }
            if (line.t === "meta") {
              return (
                <div
                  key={i}
                  className="mb-3 border-b pb-2.5 font-mono text-[10px] leading-tight"
                  style={{ color: C.textTertiary, borderColor: C.border }}
                >
                  {line.v}
                </div>
              );
            }
            if (line.t === "h2") {
              return (
                <div
                  key={i}
                  className="mb-1.5 mt-3.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: C.text }}
                >
                  {line.v}
                </div>
              );
            }
            if (line.t === "p") {
              return (
                <div
                  key={i}
                  className="mb-1.5 h-1.5 rounded-full"
                  style={{ width: `${line.w}%`, background: C.border }}
                />
              );
            }
            if (line.t === "tags") {
              return (
                <div key={i} className="mt-1 flex flex-wrap gap-1">
                  {line.v.map((tag) => (
                    <span
                      key={tag}
                      className="rounded px-1.5 py-0.5 font-mono text-[9px]"
                      style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.borderDark}` }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              );
            }
            if (line.t !== "table") return null;
            return (
              <div
                key={i}
                className="mt-1 overflow-hidden rounded font-mono text-[9px]"
                style={{ border: `1px solid ${C.border}` }}
              >
                <div className="flex" style={{ background: C.bgWarm, borderBottom: `1px solid ${C.border}` }}>
                  {line.cols.map((col) => (
                    <div key={col} className="flex-1 truncate px-2 py-1.5 font-semibold" style={{ color: C.textTertiary }}>
                      {col}
                    </div>
                  ))}
                </div>
                {line.rows.map((row, ri) => (
                  <div
                    key={ri}
                    className="flex"
                    style={{
                      background: ri % 2 === 1 ? C.bg : C.bgCard,
                      borderBottom: ri === line.rows.length - 1 ? "none" : `1px solid ${C.borderLight}`,
                    }}
                  >
                    {row.map((cell, ci) => (
                      <div
                        key={ci}
                        className="flex-1 truncate px-2 py-1.5"
                        style={{
                          color: cell.includes("Researching")
                            ? "#d97706"
                            : cell.includes("Sent")
                              ? "#16a34a"
                              : cell.includes("Researched")
                                ? "#2563eb"
                                : cell.includes("Drafted")
                                  ? "#7c3aed"
                                  : ci === 3
                                    ? C.text
                                    : C.textSecondary,
                          fontWeight: ci === 3 ? 500 : 400,
                        }}
                      >
                        {cell}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
