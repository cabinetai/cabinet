/**
 * Registry manifest client.
 *
 * Optale Observatory disables the upstream Cabinet template registry. This
 * module keeps the legacy type shape for old imports while returning no
 * templates and performing no external fetches.
 */

export interface RegistryTemplate {
  slug: string;
  name: string;
  description: string;
  domain: string;
  version: string;
  cover: string | null;
  coverUrl: string | null;
  agentCount: number;
  jobCount: number;
  childCount: number;
  tags: string[];
}


/**
 * Bundled fallback. Used when the live fetch fails. Kept short — the UI
 * shows whatever this list contains without covers, so older builds still
 * have something to render. Keep entries here only for the most-stable
 * cabinets.
 */
export const FALLBACK_TEMPLATES: RegistryTemplate[] = [
  {
    slug: "saas-startup",
    name: "SaaS Startup",
    description:
      "B2B SaaS startup with product-led growth, engineering, and customer success teams.",
    domain: "Software",
    version: "0.1.0",
    cover: null,
    coverUrl: null,
    agentCount: 3,
    jobCount: 2,
    childCount: 0,
    tags: [],
  },
  {
    slug: "agency",
    name: "Digital Agency",
    description:
      "Digital agency managing multiple client engagements with shared processes and templates.",
    domain: "Professional Services",
    version: "0.1.0",
    cover: null,
    coverUrl: null,
    agentCount: 2,
    jobCount: 2,
    childCount: 2,
    tags: [],
  },
  {
    slug: "career-ops",
    name: "Career Ops",
    description:
      "AI-powered job search command center. Evaluate offers, scan company portals, generate ATS-optimized CVs, and track your pipeline.",
    domain: "Operations",
    version: "0.1.0",
    cover: null,
    coverUrl: null,
    agentCount: 10,
    jobCount: 5,
    childCount: 0,
    tags: [],
  },
  {
    slug: "content-creator",
    name: "Content Creator",
    description:
      "Solo content creator operation with strategy, editing, and analytics workflows.",
    domain: "Media",
    version: "0.1.0",
    cover: null,
    coverUrl: null,
    agentCount: 3,
    jobCount: 2,
    childCount: 0,
    tags: [],
  },
  {
    slug: "ecommerce",
    name: "E-commerce Store",
    description:
      "Direct-to-consumer e-commerce brand with inventory, email marketing, and fulfillment operations.",
    domain: "E-commerce",
    version: "0.1.0",
    cover: null,
    coverUrl: null,
    agentCount: 2,
    jobCount: 2,
    childCount: 0,
    tags: [],
  },
  {
    slug: "real-estate",
    name: "Real Estate Brokerage",
    description:
      "Real estate brokerage with listings management, marketing, and client relationship operations.",
    domain: "Sales",
    version: "0.1.0",
    cover: null,
    coverUrl: null,
    agentCount: 2,
    jobCount: 2,
    childCount: 3,
    tags: [],
  },
  {
    slug: "text-your-mom",
    name: "Text Your Mom",
    description:
      "Relatable B2C app company cabinet used to test nested cabinet behavior.",
    domain: "Software",
    version: "0.1.0",
    cover: null,
    coverUrl: null,
    agentCount: 4,
    jobCount: 3,
    childCount: 3,
    tags: [],
  },
  {
    slug: "job-hunt-hq",
    name: "Job Hunt HQ",
    description:
      "Job search is a full-time job. This cabinet staffs it with a career strategist, resume tailor, interview coach, and networking scout.",
    domain: "Operations",
    version: "0.1.0",
    cover: null,
    coverUrl: null,
    agentCount: 4,
    jobCount: 4,
    childCount: 0,
    tags: [],
  },
];

export async function getRegistryTemplates(): Promise<RegistryTemplate[]> {
  return [];
}

export function getRegistryRawBase(): string {
  return "";
}

/**
 * Per-domain accent hex, used by `<TiltCard>` to tint the hover glow.
 * Falls through to `Other` for unknown domains.
 */
const DOMAIN_ACCENT_HEX: Record<string, string> = {
  Software: "#c2410c",
  "Professional Services": "#0e7490",
  Operations: "#475569",
  Media: "#7c3aed",
  "E-commerce": "#15803d",
  Sales: "#be123c",
  Education: "#0f766e",
  Lifestyle: "#a21caf",
  Marketing: "#2563eb",
  Finance: "#a16207",
  "Data & Research": "#4f46e5",
  Other: "#78716c",
};

export function getDomainAccent(domain: string): string {
  return DOMAIN_ACCENT_HEX[domain] || DOMAIN_ACCENT_HEX.Other;
}
