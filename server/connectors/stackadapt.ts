/**
 * StackAdapt Connector
 *
 * Pulls programmatic-advertising campaign delivery from the StackAdapt GraphQL
 * API and writes a markdown report to `data/reports/stackadapt-YYYY-MM-DD.md`.
 * The report shows up in Cabinet's sidebar, is searchable, and can be read by
 * agents as context.
 *
 * Runs headless, triggered either manually or by the Cabinet job scheduler via
 * `resources/.agents/stackadapt/jobs/daily-report.yaml`.
 *
 * Usage: npx tsx server/connectors/stackadapt.ts
 *
 * Required environment variables (see `.env.example`):
 *   STACKADAPT_API_TOKEN     — GraphQL API token (read-only use)
 *
 * Optional environment variables:
 *   STACKADAPT_LOOKBACK_DAYS — rolling window ending yesterday (default: 14, max: 730)
 *   STACKADAPT_START_DATE    — explicit start date (YYYY-MM-DD); requires END_DATE
 *   STACKADAPT_END_DATE      — explicit end date (YYYY-MM-DD); requires START_DATE
 *
 * Read-only by design: this connector only sends GraphQL queries, never mutations.
 */

import fs from "fs";
import path from "path";
import { DATA_DIR } from "../../src/lib/storage/path-utils";

// Load .env.local for standalone `npx tsx` runs. dotenv is a transitive
// dependency (not declared at the repo root), and when the connector is invoked
// by the Cabinet job scheduler the environment is already populated — so a
// missing dotenv must not be fatal. Load it best-effort and fall back to the
// ambient environment.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require("dotenv") as typeof import("dotenv");
  dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
} catch {
  // dotenv not installed (or .env.local absent) — rely on process.env as set by
  // the scheduler or the shell.
}

// ===== Types =====

interface Credentials {
  token: string;
}

interface DateRange {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
}

// Window pair: current window plus the immediately preceding equal-length window
// (used for delivery-drift comparison).
interface WindowPair {
  current: DateRange;
  prior: DateRange;
}

// Raw GraphQL response shapes (only the fields we use). StackAdapt's money/count
// scalars (MoneyValue, BigInt) serialize as quoted strings, so metric values are
// typed as unknown and coerced via asFloat().
interface DeliveryNode {
  campaign: { id: string | number; name: string };
  metrics: Record<string, unknown>;
}

interface CampaignDeliveryResponse {
  campaignDelivery: {
    __typename: string;
    records?: { nodes: DeliveryNode[] };
  };
}

interface GraphQLError {
  message: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

// One campaign's delivery metrics over a window.
interface DeliveryRecord {
  campaignId: string;
  campaignName: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionRevenue: number;
  ctr: number; // click-through rate (StackAdapt-reported, fraction or %)
  cvr: number; // conversion rate (StackAdapt-reported)
  ecpa: number; // effective cost per acquisition
  ecpc: number; // effective cost per click
}

// Aggregated types rendered in the report.

interface DeliveryTotals {
  campaignCount: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionRevenue: number;
  blendedCtr: number; // clicks / impressions (computed, not reported)
  blendedRoas: number; // conversionRevenue / spend
}

interface CampaignPerfRow {
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number; // -1 when spend is 0 (undefined)
  ctrPct: number; // clicks / impressions, as a percentage
  cvrPct: number; // conversions / clicks, as a percentage
  ecpa: number;
  ecpc: number;
}

interface DriftRow {
  campaignName: string;
  currentSpend: number;
  priorSpend: number;
  spendDeltaPct: number | null; // null when prior spend is 0 (no baseline)
}

interface Anomalies {
  staleCampaigns: string[]; // campaigns with spend in prior window but zero now
  lowRoasCampaigns: Array<{ campaignName: string; roas: number; spend: number }>;
  drift: DriftRow[];
}

interface Insights {
  topSpender: { campaignName: string; spend: number } | null;
  topRoas: { campaignName: string; roas: number } | null;
  biggestSpendDrop: DriftRow | null;
  noConversionsSpend: { count: number; spend: number } | null;
}

// ===== Tunables =====

// A campaign whose ROAS is below this (and which spent money) is flagged.
const LOW_ROAS_THRESHOLD = 1.0;
// Minimum spend before a campaign is eligible for the low-ROAS flag, so trivial
// spend doesn't generate noise.
const LOW_ROAS_MIN_SPEND = 1.0;

// ===== Credentials =====

function loadCredentials(): Credentials {
  const token = process.env.STACKADAPT_API_TOKEN ?? "";
  if (!token) {
    throw new Error(
      "Missing required environment variable: STACKADAPT_API_TOKEN\n" +
        "Add it to .env.local and re-run. See server/connectors/README.md for details."
    );
  }
  return { token };
}

// ===== Date range =====

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Validate that a string is a real YYYY-MM-DD calendar date. The format regex
// alone accepts impossible dates like 2026-02-31, which Date.UTC silently
// normalizes (→ 2026-03-03), corrupting the reporting window. Round-tripping
// through Date.UTC and comparing the components back catches that.
function isValidCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatDate(dt);
}

function daysBetween(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  return Math.round((end - start) / 86_400_000) + 1; // inclusive
}

function resolveWindows(): WindowPair {
  const startEnv = process.env.STACKADAPT_START_DATE ?? "";
  const endEnv = process.env.STACKADAPT_END_DATE ?? "";
  const lookbackEnv = process.env.STACKADAPT_LOOKBACK_DAYS ?? "";

  let startDate: string;
  let endDate: string;

  if (startEnv || endEnv) {
    if (!startEnv || !endEnv) {
      throw new Error(
        "STACKADAPT_START_DATE and STACKADAPT_END_DATE must both be set, or neither."
      );
    }
    if (!isValidCalendarDate(startEnv) || !isValidCalendarDate(endEnv)) {
      throw new Error(
        "STACKADAPT_START_DATE and STACKADAPT_END_DATE must be real calendar dates in YYYY-MM-DD format."
      );
    }
    if (endEnv > formatDate(new Date())) {
      throw new Error("STACKADAPT_END_DATE must not be in the future.");
    }
    if (startEnv > endEnv) {
      throw new Error("STACKADAPT_START_DATE must be on or before STACKADAPT_END_DATE.");
    }
    startDate = startEnv;
    endDate = endEnv;
  } else {
    let lookbackDays = 14;
    if (lookbackEnv) {
      const parsed = parseInt(lookbackEnv, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 730) {
        throw new Error("STACKADAPT_LOOKBACK_DAYS must be an integer between 1 and 730.");
      }
      lookbackDays = parsed;
    }
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (lookbackDays - 1));
    startDate = formatDate(start);
    endDate = formatDate(end);
  }

  const windowLen = daysBetween(startDate, endDate);
  const priorEnd = shiftDays(startDate, -1);
  const priorStart = shiftDays(priorEnd, -(windowLen - 1));

  return {
    current: { startDate, endDate },
    prior: { startDate: priorStart, endDate: priorEnd },
  };
}

// ===== StackAdapt GraphQL API =====

const STACKADAPT_ENDPOINT = "https://api.stackadapt.com/graphql";

// Coerce a GraphQL scalar that may be a number, a quoted number (MoneyValue /
// BigInt serialize as strings), or null/undefined. Returns 0 for anything
// unparseable so totals never become NaN.
function asFloat(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const f = parseFloat(v);
    return Number.isFinite(f) ? f : 0;
  }
  return 0;
}

const DELIVERY_QUERY = `query($date:DateRangeInput,$gran:DeliveryStatsGranularity!,$f:CampaignFilters,$dt:DeliveryStatsDataType!){
  campaignDelivery(date:$date, granularity:$gran, filterBy:$f, dataType:$dt){
    __typename
    ... on CampaignDeliveryOutcome {
      records { nodes { campaign { id name } metrics { cost ctr cvr conversions conversionRevenue ecpa ecpc clicksBigint impressionsBigint } } }
    }
    ... on Progress { __typename }
  }
}`;

async function postGraphQL<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  attempt = 1
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(STACKADAPT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (res.status === 429 && attempt <= 3) {
      const delayMs = 2000 * attempt;
      console.warn(`[stackadapt] 429 rate limited, retrying in ${delayMs}ms (attempt ${attempt}/3)`);
      await new Promise((r) => setTimeout(r, delayMs));
      return postGraphQL<T>(token, query, variables, attempt + 1);
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `StackAdapt auth failed (HTTP ${res.status}): check STACKADAPT_API_TOKEN is a valid GraphQL token.`
      );
    }

    const json = (await res.json()) as GraphQLResponse<T>;

    if (!res.ok) {
      const detail = json.errors?.map((e) => e.message).join("; ") ?? `HTTP ${res.status}`;
      throw new Error(`StackAdapt API error (${res.status}): ${detail}`);
    }
    if (json.errors && json.errors.length > 0) {
      throw new Error(`StackAdapt GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    if (!json.data) {
      throw new Error("StackAdapt returned no data.");
    }
    return json.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Fetch per-campaign delivery aggregated over a window. Surfaces the async
// `Progress` union member as a clear retry error rather than empty data.
async function fetchDelivery(token: string, range: DateRange): Promise<DeliveryRecord[]> {
  const data = await postGraphQL<CampaignDeliveryResponse>(token, DELIVERY_QUERY, {
    date: { from: range.startDate, to: range.endDate },
    gran: "TOTAL",
    f: {},
    dt: "TABLE",
  });

  const cd = data.campaignDelivery;
  if (cd.__typename === "Progress") {
    throw new Error(
      "StackAdapt is still computing this report (async). Re-run in a moment or narrow the date window."
    );
  }

  const nodes = cd.records?.nodes ?? [];
  return nodes.map((n) => {
    const m = n.metrics;
    return {
      campaignId: String(n.campaign.id),
      campaignName: n.campaign.name,
      cost: asFloat(m.cost),
      impressions: asFloat(m.impressionsBigint),
      clicks: asFloat(m.clicksBigint),
      conversions: asFloat(m.conversions),
      conversionRevenue: asFloat(m.conversionRevenue),
      ctr: asFloat(m.ctr),
      cvr: asFloat(m.cvr),
      ecpa: asFloat(m.ecpa),
      ecpc: asFloat(m.ecpc),
    };
  });
}

// ===== Aggregation =====

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function roasOf(conversionRevenue: number, spend: number): number {
  return spend > 0 ? conversionRevenue / spend : -1;
}

function aggregateTotals(records: DeliveryRecord[]): DeliveryTotals {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;
  let conversionRevenue = 0;
  for (const r of records) {
    spend += r.cost;
    impressions += r.impressions;
    clicks += r.clicks;
    conversions += r.conversions;
    conversionRevenue += r.conversionRevenue;
  }
  return {
    campaignCount: records.length,
    spend,
    impressions,
    clicks,
    conversions,
    conversionRevenue,
    blendedCtr: pct(clicks, impressions),
    blendedRoas: roasOf(conversionRevenue, spend),
  };
}

function aggregatePerformance(records: DeliveryRecord[]): CampaignPerfRow[] {
  return records
    .map((r) => ({
      campaignName: r.campaignName,
      spend: r.cost,
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: r.conversions,
      roas: roasOf(r.conversionRevenue, r.cost),
      ctrPct: pct(r.clicks, r.impressions),
      cvrPct: pct(r.conversions, r.clicks),
      ecpa: r.ecpa,
      ecpc: r.ecpc,
    }))
    .sort((a, b) => b.spend - a.spend);
}

function aggregateAnomalies(current: DeliveryRecord[], prior: DeliveryRecord[]): Anomalies {
  // Join on campaignId, not campaignName: names can be duplicated across
  // campaigns and can change between windows (a rename would otherwise look
  // like one campaign vanishing and a new one appearing).
  const priorById = new Map<string, DeliveryRecord>();
  for (const r of prior) priorById.set(r.campaignId, r);
  const currentById = new Map<string, DeliveryRecord>();
  for (const r of current) currentById.set(r.campaignId, r);

  // Prefer the current name for display (it's the more recent label); fall back
  // to the prior name for campaigns that only appear in the prior window.
  const nameOf = (id: string): string =>
    currentById.get(id)?.campaignName ?? priorById.get(id)?.campaignName ?? id;

  // Stale: spent in the prior window but zero spend now.
  const staleCampaigns: string[] = [];
  for (const p of prior) {
    if (p.cost > 0) {
      const now = currentById.get(p.campaignId);
      if (!now || now.cost === 0) staleCampaigns.push(nameOf(p.campaignId));
    }
  }

  // Low ROAS: spent meaningfully this window but ROAS below threshold.
  const lowRoasCampaigns = current
    .filter((r) => r.cost >= LOW_ROAS_MIN_SPEND)
    .map((r) => ({ campaignName: r.campaignName, roas: roasOf(r.conversionRevenue, r.cost), spend: r.cost }))
    .filter((r) => r.roas >= 0 && r.roas < LOW_ROAS_THRESHOLD)
    .sort((a, b) => a.roas - b.roas);

  // Delivery drift: spend change vs the prior window, computed over the UNION of
  // both windows' campaign IDs. Iterating only `current` would hide campaigns
  // that went fully stale (prior spend > 0, current spend 0) — those are exactly
  // the -100% drops worth surfacing.
  const allIds = new Set<string>([...currentById.keys(), ...priorById.keys()]);
  const drift: DriftRow[] = [...allIds]
    .map((id) => {
      const currentSpend = currentById.get(id)?.cost ?? 0;
      const priorSpend = priorById.get(id)?.cost ?? 0;
      const spendDeltaPct = priorSpend > 0 ? ((currentSpend - priorSpend) / priorSpend) * 100 : null;
      return { campaignName: nameOf(id), currentSpend, priorSpend, spendDeltaPct };
    })
    .filter((d) => d.priorSpend > 0 || d.currentSpend > 0)
    .sort((a, b) => Math.abs(b.spendDeltaPct ?? 0) - Math.abs(a.spendDeltaPct ?? 0));

  return { staleCampaigns, lowRoasCampaigns, drift };
}

function buildInsights(
  perf: CampaignPerfRow[],
  anomalies: Anomalies,
  current: DeliveryRecord[]
): Insights {
  const topSpender =
    perf.length > 0 && perf[0].spend > 0
      ? { campaignName: perf[0].campaignName, spend: perf[0].spend }
      : null;

  const withRoas = perf.filter((p) => p.roas >= 0 && p.spend > 0);
  const topRoas =
    withRoas.length > 0
      ? withRoas.reduce((best, p) => (p.roas > best.roas ? p : best))
      : null;

  const drops = anomalies.drift.filter((d) => d.spendDeltaPct !== null && d.spendDeltaPct < 0);
  const biggestSpendDrop =
    drops.length > 0
      ? drops.reduce((worst, d) => ((d.spendDeltaPct ?? 0) < (worst.spendDeltaPct ?? 0) ? d : worst))
      : null;

  const zeroConv = current.filter((r) => r.cost >= LOW_ROAS_MIN_SPEND && r.conversions === 0);
  const noConversionsSpend =
    zeroConv.length > 0
      ? { count: zeroConv.length, spend: zeroConv.reduce((s, r) => s + r.cost, 0) }
      : null;

  return {
    topSpender,
    topRoas: topRoas ? { campaignName: topRoas.campaignName, roas: topRoas.roas } : null,
    biggestSpendDrop,
    noConversionsSpend,
  };
}

// ===== Report rendering =====

function formatMoney(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function formatPct(p: number): string {
  return `${p.toFixed(2)}%`;
}

function formatRoas(roas: number): string {
  return roas < 0 ? "—" : `${roas.toFixed(2)}×`;
}

function formatDelta(deltaPct: number | null): string {
  if (deltaPct === null) return "new";
  const sign = deltaPct > 0 ? "+" : "";
  return `${sign}${deltaPct.toFixed(1)}%`;
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderReport(
  totals: DeliveryTotals,
  perf: CampaignPerfRow[],
  anomalies: Anomalies,
  insights: Insights,
  windows: WindowPair
): string {
  const lines: string[] = [];
  const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  const { current, prior } = windows;
  const mode = current.startDate === current.endDate ? "single day" : "rolling window";

  lines.push("# StackAdapt Report");
  lines.push("");
  lines.push(`_Generated ${generatedAt} UTC · Window ${current.startDate} – ${current.endDate}_`);
  lines.push("");
  lines.push(`> Source: StackAdapt GraphQL API · Mode: ${mode} · Compared to ${prior.startDate} – ${prior.endDate}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // ----- Section 1: Spend & Delivery -----
  lines.push("## Spend & Delivery");
  lines.push("");
  if (totals.campaignCount === 0) {
    lines.push("_No campaign delivery in this window._");
    lines.push("");
  } else {
    lines.push("| Metric | Value |");
    lines.push("|---|---|");
    lines.push(`| Active campaigns | ${totals.campaignCount} |`);
    lines.push(`| Spend | USD ${formatMoney(totals.spend)} |`);
    lines.push(`| Impressions | ${formatInt(totals.impressions)} |`);
    lines.push(`| Clicks | ${formatInt(totals.clicks)} |`);
    lines.push(`| Blended CTR | ${formatPct(totals.blendedCtr)} |`);
    lines.push(`| Conversions | ${formatInt(totals.conversions)} |`);
    lines.push(`| Conversion revenue | USD ${formatMoney(totals.conversionRevenue)} |`);
    lines.push(`| Blended ROAS | ${formatRoas(totals.blendedRoas)} |`);
    lines.push("");
  }
  lines.push("---");
  lines.push("");

  // ----- Section 2: Campaign Performance -----
  lines.push("## Campaign Performance");
  lines.push("");
  if (perf.length === 0) {
    lines.push("_No campaigns to report._");
    lines.push("");
  } else {
    lines.push("Ranked by spend.");
    lines.push("");
    lines.push("| Campaign | Spend | Impr. | Clicks | CTR | Conv. | CVR | ROAS | eCPA | eCPC |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|");
    for (const p of perf) {
      lines.push(
        `| ${escapeCell(p.campaignName)} | ${formatMoney(p.spend)} | ${formatInt(p.impressions)} | ` +
          `${formatInt(p.clicks)} | ${formatPct(p.ctrPct)} | ${formatInt(p.conversions)} | ` +
          `${formatPct(p.cvrPct)} | ${formatRoas(p.roas)} | ${formatMoney(p.ecpa)} | ${formatMoney(p.ecpc)} |`
      );
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");

  // ----- Section 3: Pacing & Anomalies -----
  lines.push("## Pacing & Anomalies");
  lines.push("");

  lines.push("### Stale campaigns");
  lines.push("");
  if (anomalies.staleCampaigns.length === 0) {
    lines.push("_None — every campaign that spent last window is still delivering._");
  } else {
    lines.push("Spent in the prior window but zero spend now:");
    lines.push("");
    for (const name of anomalies.staleCampaigns) lines.push(`- ${escapeCell(name)}`);
  }
  lines.push("");

  lines.push("### Low ROAS");
  lines.push("");
  if (anomalies.lowRoasCampaigns.length === 0) {
    lines.push(`_None below ${LOW_ROAS_THRESHOLD.toFixed(1)}× ROAS._`);
  } else {
    lines.push(`Campaigns spending ≥ USD ${formatMoney(LOW_ROAS_MIN_SPEND)} with ROAS below ${LOW_ROAS_THRESHOLD.toFixed(1)}×:`);
    lines.push("");
    lines.push("| Campaign | Spend | ROAS |");
    lines.push("|---|---|---|");
    for (const r of anomalies.lowRoasCampaigns) {
      lines.push(`| ${escapeCell(r.campaignName)} | ${formatMoney(r.spend)} | ${formatRoas(r.roas)} |`);
    }
  }
  lines.push("");

  lines.push("### Delivery drift");
  lines.push("");
  if (anomalies.drift.length === 0) {
    lines.push("_No spend in either window to compare._");
  } else {
    lines.push("Spend change vs the prior equal-length window (largest swings first):");
    lines.push("");
    lines.push("| Campaign | This window | Prior window | Δ |");
    lines.push("|---|---|---|---|");
    for (const d of anomalies.drift) {
      lines.push(
        `| ${escapeCell(d.campaignName)} | ${formatMoney(d.currentSpend)} | ` +
          `${formatMoney(d.priorSpend)} | ${formatDelta(d.spendDeltaPct)} |`
      );
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // ----- Insights -----
  lines.push("## Insights");
  lines.push("");
  const bullets: string[] = [];
  if (insights.topSpender) {
    bullets.push(`Top spender: **${escapeCell(insights.topSpender.campaignName)}** (USD ${formatMoney(insights.topSpender.spend)})`);
  }
  if (insights.topRoas) {
    bullets.push(`Best ROAS: **${escapeCell(insights.topRoas.campaignName)}** (${formatRoas(insights.topRoas.roas)})`);
  }
  if (insights.biggestSpendDrop) {
    bullets.push(
      `Biggest spend drop: **${escapeCell(insights.biggestSpendDrop.campaignName)}** (${formatDelta(insights.biggestSpendDrop.spendDeltaPct)})`
    );
  }
  if (insights.noConversionsSpend) {
    bullets.push(
      `⚠️ **${insights.noConversionsSpend.count} campaign(s) spent with zero conversions** — total USD ${formatMoney(insights.noConversionsSpend.spend)}`
    );
  }
  if (bullets.length === 0) {
    lines.push("_No notable insights for this period._");
  } else {
    for (const b of bullets) lines.push(`- ${b}`);
  }
  lines.push("");

  return lines.join("\n");
}

// ===== Write report =====

function writeReport(content: string, runDate: string): string {
  const reportsDir = path.join(DATA_DIR, "reports");
  const fileName = `stackadapt-${runDate}.md`;
  const filePath = path.join(reportsDir, fileName);

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(DATA_DIR))) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// ===== Main =====

async function main(): Promise<void> {
  console.log("[stackadapt] Starting StackAdapt connector...");

  const creds = loadCredentials();
  const windows = resolveWindows();
  const runDate = formatDate(new Date());

  console.log(`[stackadapt] Report window: ${windows.current.startDate} → ${windows.current.endDate}`);
  console.log(`[stackadapt] Prior window:  ${windows.prior.startDate} → ${windows.prior.endDate}`);

  console.log("[stackadapt] Fetching campaign delivery (current + prior windows)...");
  const [current, prior] = await Promise.all([
    fetchDelivery(creds.token, windows.current),
    fetchDelivery(creds.token, windows.prior),
  ]);
  console.log(`[stackadapt] ${current.length} campaign(s) this window, ${prior.length} prior`);

  console.log("[stackadapt] Aggregating...");
  const totals = aggregateTotals(current);
  const perf = aggregatePerformance(current);
  const anomalies = aggregateAnomalies(current, prior);
  const insights = buildInsights(perf, anomalies, current);

  console.log("[stackadapt] Rendering report...");
  const report = renderReport(totals, perf, anomalies, insights, windows);

  const filePath = writeReport(report, runDate);
  console.log(`[stackadapt] Report written to ${filePath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[stackadapt] Error:", err.message ?? err);
    process.exit(1);
  });
}
