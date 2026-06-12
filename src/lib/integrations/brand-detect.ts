/**
 * Best-effort brand detection from free-text identifiers.
 *
 * Used where we can't look a brand up by a stable id the way the Integrations
 * Hub does (`preview-catalog.ts`): auto-discovered MCP servers have arbitrary
 * names (`chrome_devtools`, `sentry`, the Sentry HTTP endpoint …) and installed
 * skills are named after what they do (`docker-development`, `linkedin-search-
 * icps`). In both cases we sniff a brand out of whatever text we have — name,
 * key, command, args, url — and show its mark when one matches.
 *
 * Most marks come from `simple-icons` (a single SVG path + brand hex), rendered
 * inline so they stay crisp and need no network. A few brands simple-icons
 * doesn't ship (LinkedIn was pulled for brand-policy; Slack/Salesforce we
 * already keep as full-colour assets) fall back to files under /public/logos.
 *
 * No match → null, and the UI shows a neutral fallback.
 */

import {
  siGooglechrome,
  siSentry,
  siGithub,
  siGitlab,
  siNotion,
  siDiscord,
  siLinear,
  siJira,
  siConfluence,
  siAtlassian,
  siFigma,
  siStripe,
  siPostgresql,
  siMysql,
  siSqlite,
  siMongodb,
  siRedis,
  siSupabase,
  siCloudflare,
  siDocker,
  siKubernetes,
  siVercel,
  siObsidian,
  siSpotify,
  siYoutube,
  siGmail,
  siGoogledrive,
  siGooglecalendar,
  siGooglemaps,
  siBrave,
  siPerplexity,
  siHubspot,
  siZendesk,
  siIntercom,
  siAsana,
  siTrello,
  siAirtable,
  siShopify,
  siPaypal,
  siAnthropic,
  siSnowflake,
  siDatabricks,
  siDatadog,
  siGrafana,
  siPrometheus,
  siElasticsearch,
  siPuppeteer,
} from "simple-icons";
import type { SimpleIcon } from "simple-icons";

/** A resolved brand mark, rendered either inline (simple-icons) or as a file. */
export interface Brand {
  title: string;
  /** Brand hex *without* the leading `#`. */
  hex: string;
  /** simple-icons single-path glyph, drawn inline on a 24×24 viewBox. */
  path?: string;
  /** Local asset path (full-colour brands simple-icons doesn't ship). */
  src?: string;
}

const ic = (icon: SimpleIcon): Brand => ({
  title: icon.title,
  hex: icon.hex,
  path: icon.path,
});

/**
 * Ordered match rules. `aliases` are matched against the input's tokens
 * (exact token match for short/ambiguous ones; substring for distinctive
 * ones ≥5 chars, so `chrome-devtools-mcp` / `docker-development` still
 * resolve). First rule with a hit wins — keep more specific brands above
 * generic ones.
 */
const RULES: { aliases: string[]; brand: Brand }[] = [
  { aliases: ["chrome", "chromium"], brand: ic(siGooglechrome) },
  { aliases: ["sentry"], brand: ic(siSentry) },
  {
    aliases: ["linkedin"],
    brand: { title: "LinkedIn", hex: "0A66C2", src: "/logos/linkedin.svg" },
  },
  { aliases: ["github"], brand: ic(siGithub) },
  { aliases: ["gitlab"], brand: ic(siGitlab) },
  { aliases: ["notion"], brand: ic(siNotion) },
  {
    aliases: ["slack"],
    brand: { title: "Slack", hex: "611F69", src: "/logos/slack.svg" },
  },
  { aliases: ["discord"], brand: ic(siDiscord) },
  { aliases: ["linear"], brand: ic(siLinear) },
  { aliases: ["jira"], brand: ic(siJira) },
  { aliases: ["confluence"], brand: ic(siConfluence) },
  { aliases: ["atlassian"], brand: ic(siAtlassian) },
  { aliases: ["figma"], brand: ic(siFigma) },
  { aliases: ["stripe"], brand: ic(siStripe) },
  { aliases: ["postgres", "postgresql"], brand: ic(siPostgresql) },
  { aliases: ["mysql"], brand: ic(siMysql) },
  { aliases: ["sqlite"], brand: ic(siSqlite) },
  { aliases: ["mongodb", "mongo"], brand: ic(siMongodb) },
  { aliases: ["redis"], brand: ic(siRedis) },
  { aliases: ["supabase"], brand: ic(siSupabase) },
  { aliases: ["cloudflare"], brand: ic(siCloudflare) },
  { aliases: ["docker"], brand: ic(siDocker) },
  { aliases: ["kubernetes", "k8s"], brand: ic(siKubernetes) },
  { aliases: ["vercel"], brand: ic(siVercel) },
  { aliases: ["obsidian"], brand: ic(siObsidian) },
  { aliases: ["spotify"], brand: ic(siSpotify) },
  { aliases: ["youtube"], brand: ic(siYoutube) },
  { aliases: ["gmail"], brand: ic(siGmail) },
  { aliases: ["googledrive", "gdrive"], brand: ic(siGoogledrive) },
  { aliases: ["googlecalendar", "gcal"], brand: ic(siGooglecalendar) },
  { aliases: ["googlemaps", "gmaps"], brand: ic(siGooglemaps) },
  { aliases: ["brave"], brand: ic(siBrave) },
  { aliases: ["perplexity"], brand: ic(siPerplexity) },
  { aliases: ["hubspot"], brand: ic(siHubspot) },
  {
    aliases: ["salesforce"],
    brand: { title: "Salesforce", hex: "00A1E0", src: "/logos/salesforce.webp" },
  },
  { aliases: ["zendesk"], brand: ic(siZendesk) },
  { aliases: ["intercom"], brand: ic(siIntercom) },
  { aliases: ["asana"], brand: ic(siAsana) },
  { aliases: ["trello"], brand: ic(siTrello) },
  { aliases: ["airtable"], brand: ic(siAirtable) },
  { aliases: ["shopify"], brand: ic(siShopify) },
  { aliases: ["paypal"], brand: ic(siPaypal) },
  { aliases: ["anthropic"], brand: ic(siAnthropic) },
  { aliases: ["snowflake"], brand: ic(siSnowflake) },
  { aliases: ["databricks"], brand: ic(siDatabricks) },
  { aliases: ["datadog"], brand: ic(siDatadog) },
  { aliases: ["grafana"], brand: ic(siGrafana) },
  { aliases: ["prometheus"], brand: ic(siPrometheus) },
  { aliases: ["elasticsearch", "elastic"], brand: ic(siElasticsearch) },
  { aliases: ["puppeteer"], brand: ic(siPuppeteer) },
];

/**
 * Sniff a brand out of the given text fragments (name, key, command, url, …),
 * or null if nothing matches. Falsy fragments are ignored.
 */
export function resolveBrand(parts: Array<string | undefined | null>): Brand | null {
  const present = parts.filter(Boolean) as string[];
  if (present.length === 0) return null;

  const hay = present.join(" ").toLowerCase();
  const tokens = new Set(hay.split(/[^a-z0-9]+/).filter(Boolean));

  for (const rule of RULES) {
    for (const alias of rule.aliases) {
      if (tokens.has(alias)) return rule.brand;
      if (alias.length >= 5 && hay.includes(alias)) return rule.brand;
    }
  }
  return null;
}

/**
 * Whether a brand hex is so dark or so light it would vanish against the
 * card background in one theme. Such monochrome marks (GitHub, Notion,
 * Vercel, Anthropic …) render with the foreground colour instead of the hex
 * so they stay visible in both light and dark mode.
 */
export function isExtremeHex(hex: string): boolean {
  if (hex.length !== 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.18 || lum > 0.92;
}
