// Theme definitions for the multi-theme system
// Each theme defines CSS custom properties using OKLCh color space

// Vivid agent colors — Tailwind-500 family. Each entry is an 8%-alpha tint
// for the pill background and the full-saturation rgb for the text / glyph
// color. Order matters: `getAgentColor(slug)` hashes into this list, so
// shuffling will change every unset agent's default color.
export const AGENT_PALETTE: Array<{ bg: string; text: string }> = [
  { bg: "rgba(99, 102, 241, 0.08)", text: "rgb(99, 102, 241)" }, // indigo-500
  { bg: "rgba(16, 185, 129, 0.08)", text: "rgb(16, 185, 129)" }, // emerald-500
  { bg: "rgba(245, 158, 11, 0.08)", text: "rgb(245, 158, 11)" }, // amber-500
  { bg: "rgba(244, 63, 94, 0.08)", text: "rgb(244, 63, 94)" }, // rose-500
  { bg: "rgba(139, 92, 246, 0.08)", text: "rgb(139, 92, 246)" }, // violet-500
  { bg: "rgba(14, 165, 233, 0.08)", text: "rgb(14, 165, 233)" }, // sky-500
  { bg: "rgba(236, 72, 153, 0.08)", text: "rgb(236, 72, 153)" }, // pink-500
  { bg: "rgba(20, 184, 166, 0.08)", text: "rgb(20, 184, 166)" }, // teal-500
];

export interface ThemeDefinition {
  name: string;
  label: string;
  type: "dark" | "light";
  font?: string; // Google Font for body text
  headingFont?: string; // Google Font for headings (h1-h4)
  accent: string; // preview color for the picker
  vars: Record<string, string>;
}

export const THEMES: ThemeDefinition[] = [
  // ─── CLAUDE THEME (signature) ───
  {
    name: "claude",
    label: "Claude",
    type: "dark",
    font: "'Space Grotesk', var(--font-sans)",
    headingFont: "'Playfair Display', Georgia, serif",
    accent: "#cc785c",
    vars: {
      "--background": "oklch(0.13 0.01 45)",
      "--foreground": "oklch(0.93 0.02 60)",
      "--card": "oklch(0.18 0.01 45)",
      "--card-foreground": "oklch(0.93 0.02 60)",
      "--popover": "oklch(0.18 0.01 45)",
      "--popover-foreground": "oklch(0.93 0.02 60)",
      "--primary": "oklch(0.72 0.12 45)",
      "--primary-foreground": "oklch(0.13 0.01 45)",
      "--secondary": "oklch(0.22 0.01 45)",
      "--secondary-foreground": "oklch(0.88 0.03 55)",
      "--muted": "oklch(0.22 0.01 45)",
      "--muted-foreground": "oklch(0.65 0.03 55)",
      "--accent": "oklch(0.25 0.02 45)",
      "--accent-foreground": "oklch(0.93 0.02 60)",
      "--destructive": "oklch(0.65 0.2 25)",
      "--border": "oklch(1 0 0 / 8%)",
      "--input": "oklch(1 0 0 / 12%)",
      "--ring": "oklch(0.72 0.12 45)",
      "--sidebar": "oklch(0.16 0.01 45)",
      "--sidebar-foreground": "oklch(0.88 0.02 55)",
      "--sidebar-primary": "oklch(0.72 0.12 45)",
      "--sidebar-primary-foreground": "oklch(0.98 0 0)",
      "--sidebar-accent": "oklch(0.22 0.01 45)",
      "--sidebar-accent-foreground": "oklch(0.88 0.02 55)",
      "--sidebar-border": "oklch(1 0 0 / 8%)",
      "--sidebar-ring": "oklch(0.5 0.05 45)",
    },
  },

  // ─── DEFAULT THEMES ───
  {
    name: "white",
    label: "White",
    type: "light",
    font: "var(--font-sans)",
    accent: "#737373",
    vars: {
      "--background": "oklch(1 0 0)",
      "--foreground": "oklch(0.15 0 0)",
      "--card": "oklch(0.99 0 0)",
      "--card-foreground": "oklch(0.15 0 0)",
      "--popover": "oklch(0.99 0 0)",
      "--popover-foreground": "oklch(0.15 0 0)",
      "--primary": "oklch(0.25 0 0)",
      "--primary-foreground": "oklch(0.98 0 0)",
      "--secondary": "oklch(0.96 0 0)",
      "--secondary-foreground": "oklch(0.15 0 0)",
      "--muted": "oklch(0.96 0 0)",
      "--muted-foreground": "oklch(0.5 0 0)",
      "--accent": "oklch(0.96 0 0)",
      "--accent-foreground": "oklch(0.15 0 0)",
      "--destructive": "oklch(0.55 0.22 25)",
      "--border": "oklch(0.91 0 0)",
      "--input": "oklch(0.91 0 0)",
      "--ring": "oklch(0.4 0 0)",
      "--sidebar": "oklch(0.98 0 0)",
      "--sidebar-foreground": "oklch(0.15 0 0)",
      "--sidebar-primary": "oklch(0.25 0 0)",
      "--sidebar-primary-foreground": "oklch(0.98 0 0)",
      "--sidebar-accent": "oklch(0.95 0 0)",
      "--sidebar-accent-foreground": "oklch(0.15 0 0)",
      "--sidebar-border": "oklch(0.91 0 0)",
      "--sidebar-ring": "oklch(0.4 0 0)",
    },
  },
  {
    name: "black",
    label: "Black",
    type: "dark",
    font: "var(--font-sans)",
    accent: "#737373",
    vars: {
      "--background": "oklch(0.1 0 0)",
      "--foreground": "oklch(0.93 0 0)",
      "--card": "oklch(0.14 0 0)",
      "--card-foreground": "oklch(0.93 0 0)",
      "--popover": "oklch(0.14 0 0)",
      "--popover-foreground": "oklch(0.93 0 0)",
      "--primary": "oklch(0.93 0 0)",
      "--primary-foreground": "oklch(0.1 0 0)",
      "--secondary": "oklch(0.2 0 0)",
      "--secondary-foreground": "oklch(0.88 0 0)",
      "--muted": "oklch(0.2 0 0)",
      "--muted-foreground": "oklch(0.6 0 0)",
      "--accent": "oklch(0.22 0 0)",
      "--accent-foreground": "oklch(0.93 0 0)",
      "--destructive": "oklch(0.65 0.2 25)",
      "--border": "oklch(1 0 0 / 10%)",
      "--input": "oklch(1 0 0 / 12%)",
      "--ring": "oklch(0.6 0 0)",
      "--sidebar": "oklch(0.12 0 0)",
      "--sidebar-foreground": "oklch(0.88 0 0)",
      "--sidebar-primary": "oklch(0.93 0 0)",
      "--sidebar-primary-foreground": "oklch(0.1 0 0)",
      "--sidebar-accent": "oklch(0.18 0 0)",
      "--sidebar-accent-foreground": "oklch(0.88 0 0)",
      "--sidebar-border": "oklch(1 0 0 / 10%)",
      "--sidebar-ring": "oklch(0.5 0 0)",
    },
  },

  // ─── DARK THEMES ───
  {
    name: "midnight-ocean",
    label: "Midnight Ocean",
    type: "dark",
    font: "'DM Sans', var(--font-sans)",
    headingFont: "'Unbounded', var(--font-sans)",
    accent: "#5b8dee",
    vars: {
      "--background": "oklch(0.14 0.02 250)",
      "--foreground": "oklch(0.92 0.01 230)",
      "--card": "oklch(0.19 0.02 250)",
      "--card-foreground": "oklch(0.92 0.01 230)",
      "--popover": "oklch(0.19 0.02 250)",
      "--popover-foreground": "oklch(0.92 0.01 230)",
      "--primary": "oklch(0.7 0.15 250)",
      "--primary-foreground": "oklch(0.98 0 0)",
      "--secondary": "oklch(0.22 0.02 250)",
      "--secondary-foreground": "oklch(0.88 0.01 230)",
      "--muted": "oklch(0.22 0.02 250)",
      "--muted-foreground": "oklch(0.62 0.04 240)",
      "--accent": "oklch(0.25 0.03 250)",
      "--accent-foreground": "oklch(0.92 0.01 230)",
      "--destructive": "oklch(0.65 0.2 25)",
      "--border": "oklch(0.7 0.1 250 / 12%)",
      "--input": "oklch(0.7 0.1 250 / 15%)",
      "--ring": "oklch(0.7 0.15 250)",
      "--sidebar": "oklch(0.16 0.02 250)",
      "--sidebar-foreground": "oklch(0.88 0.01 230)",
      "--sidebar-primary": "oklch(0.7 0.15 250)",
      "--sidebar-primary-foreground": "oklch(0.98 0 0)",
      "--sidebar-accent": "oklch(0.22 0.02 250)",
      "--sidebar-accent-foreground": "oklch(0.88 0.01 230)",
      "--sidebar-border": "oklch(0.7 0.1 250 / 12%)",
      "--sidebar-ring": "oklch(0.5 0.08 250)",
    },
  },
  {
    name: "aurora",
    label: "Aurora",
    type: "dark",
    font: "'Outfit', var(--font-sans)",
    headingFont: "'Syne', var(--font-sans)",
    accent: "#8b5cf6",
    vars: {
      "--background": "oklch(0.13 0.02 290)",
      "--foreground": "oklch(0.94 0.01 280)",
      "--card": "oklch(0.18 0.02 290)",
      "--card-foreground": "oklch(0.94 0.01 280)",
      "--popover": "oklch(0.18 0.02 290)",
      "--popover-foreground": "oklch(0.94 0.01 280)",
      "--primary": "oklch(0.65 0.2 290)",
      "--primary-foreground": "oklch(0.98 0 0)",
      "--secondary": "oklch(0.22 0.03 290)",
      "--secondary-foreground": "oklch(0.88 0.01 280)",
      "--muted": "oklch(0.22 0.03 290)",
      "--muted-foreground": "oklch(0.6 0.06 280)",
      "--accent": "oklch(0.25 0.04 290)",
      "--accent-foreground": "oklch(0.94 0.01 280)",
      "--destructive": "oklch(0.65 0.2 25)",
      "--border": "oklch(0.65 0.15 290 / 12%)",
      "--input": "oklch(0.65 0.15 290 / 15%)",
      "--ring": "oklch(0.65 0.2 290)",
      "--sidebar": "oklch(0.15 0.02 290)",
      "--sidebar-foreground": "oklch(0.88 0.01 280)",
      "--sidebar-primary": "oklch(0.65 0.2 290)",
      "--sidebar-primary-foreground": "oklch(0.98 0 0)",
      "--sidebar-accent": "oklch(0.22 0.03 290)",
      "--sidebar-accent-foreground": "oklch(0.88 0.01 280)",
      "--sidebar-border": "oklch(0.65 0.15 290 / 12%)",
      "--sidebar-ring": "oklch(0.5 0.1 290)",
    },
  },
  {
    name: "ember",
    label: "Ember",
    type: "dark",
    font: "'Sora', var(--font-sans)",
    headingFont: "'Bricolage Grotesque', var(--font-sans)",
    accent: "#f97316",
    vars: {
      "--background": "oklch(0.14 0.01 30)",
      "--foreground": "oklch(0.93 0.02 50)",
      "--card": "oklch(0.19 0.02 30)",
      "--card-foreground": "oklch(0.93 0.02 50)",
      "--popover": "oklch(0.19 0.02 30)",
      "--popover-foreground": "oklch(0.93 0.02 50)",
      "--primary": "oklch(0.72 0.18 55)",
      "--primary-foreground": "oklch(0.13 0.01 30)",
      "--secondary": "oklch(0.23 0.02 30)",
      "--secondary-foreground": "oklch(0.88 0.02 50)",
      "--muted": "oklch(0.23 0.02 30)",
      "--muted-foreground": "oklch(0.62 0.04 40)",
      "--accent": "oklch(0.26 0.03 35)",
      "--accent-foreground": "oklch(0.93 0.02 50)",
      "--destructive": "oklch(0.65 0.22 25)",
      "--border": "oklch(0.72 0.12 45 / 10%)",
      "--input": "oklch(0.72 0.12 45 / 14%)",
      "--ring": "oklch(0.72 0.18 55)",
      "--sidebar": "oklch(0.16 0.01 30)",
      "--sidebar-foreground": "oklch(0.88 0.02 50)",
      "--sidebar-primary": "oklch(0.72 0.18 55)",
      "--sidebar-primary-foreground": "oklch(0.98 0 0)",
      "--sidebar-accent": "oklch(0.23 0.02 30)",
      "--sidebar-accent-foreground": "oklch(0.88 0.02 50)",
      "--sidebar-border": "oklch(0.72 0.12 45 / 10%)",
      "--sidebar-ring": "oklch(0.5 0.08 40)",
    },
  },
  {
    name: "forest",
    label: "Forest",
    type: "dark",
    font: "'Plus Jakarta Sans', var(--font-sans)",
    headingFont: "'Fraunces', Georgia, serif",
    accent: "#22c55e",
    vars: {
      "--background": "oklch(0.13 0.02 150)",
      "--foreground": "oklch(0.92 0.02 145)",
      "--card": "oklch(0.18 0.02 150)",
      "--card-foreground": "oklch(0.92 0.02 145)",
      "--popover": "oklch(0.18 0.02 150)",
      "--popover-foreground": "oklch(0.92 0.02 145)",
      "--primary": "oklch(0.7 0.18 150)",
      "--primary-foreground": "oklch(0.13 0.02 150)",
      "--secondary": "oklch(0.22 0.02 150)",
      "--secondary-foreground": "oklch(0.88 0.02 145)",
      "--muted": "oklch(0.22 0.02 150)",
      "--muted-foreground": "oklch(0.6 0.05 148)",
      "--accent": "oklch(0.25 0.03 150)",
      "--accent-foreground": "oklch(0.92 0.02 145)",
      "--destructive": "oklch(0.65 0.2 25)",
      "--border": "oklch(0.7 0.12 150 / 10%)",
      "--input": "oklch(0.7 0.12 150 / 14%)",
      "--ring": "oklch(0.7 0.18 150)",
      "--sidebar": "oklch(0.15 0.02 150)",
      "--sidebar-foreground": "oklch(0.88 0.02 145)",
      "--sidebar-primary": "oklch(0.7 0.18 150)",
      "--sidebar-primary-foreground": "oklch(0.98 0 0)",
      "--sidebar-accent": "oklch(0.22 0.02 150)",
      "--sidebar-accent-foreground": "oklch(0.88 0.02 145)",
      "--sidebar-border": "oklch(0.7 0.12 150 / 10%)",
      "--sidebar-ring": "oklch(0.5 0.08 150)",
    },
  },
  {
    name: "cyber",
    label: "Cyber",
    type: "dark",
    font: "'Space Mono', var(--font-mono)",
    headingFont: "'Orbitron', var(--font-mono)",
    accent: "#06b6d4",
    vars: {
      "--background": "oklch(0.1 0.01 200)",
      "--foreground": "oklch(0.88 0.08 185)",
      "--card": "oklch(0.15 0.01 200)",
      "--card-foreground": "oklch(0.88 0.08 185)",
      "--popover": "oklch(0.15 0.01 200)",
      "--popover-foreground": "oklch(0.88 0.08 185)",
      "--primary": "oklch(0.75 0.15 195)",
      "--primary-foreground": "oklch(0.1 0.01 200)",
      "--secondary": "oklch(0.18 0.01 200)",
      "--secondary-foreground": "oklch(0.82 0.06 190)",
      "--muted": "oklch(0.18 0.01 200)",
      "--muted-foreground": "oklch(0.55 0.06 195)",
      "--accent": "oklch(0.2 0.02 200)",
      "--accent-foreground": "oklch(0.88 0.08 185)",
      "--destructive": "oklch(0.65 0.2 25)",
      "--border": "oklch(0.75 0.1 195 / 12%)",
      "--input": "oklch(0.75 0.1 195 / 15%)",
      "--ring": "oklch(0.75 0.15 195)",
      "--sidebar": "oklch(0.12 0.01 200)",
      "--sidebar-foreground": "oklch(0.82 0.06 190)",
      "--sidebar-primary": "oklch(0.75 0.15 195)",
      "--sidebar-primary-foreground": "oklch(0.98 0 0)",
      "--sidebar-accent": "oklch(0.18 0.01 200)",
      "--sidebar-accent-foreground": "oklch(0.82 0.06 190)",
      "--sidebar-border": "oklch(0.75 0.1 195 / 12%)",
      "--sidebar-ring": "oklch(0.5 0.08 195)",
    },
  },

  // ─── LIGHT THEMES ───
  {
    // Warm parchment palette derived from runcabinet.com
    // #FAF6F1 bg · #F3EDE4 bg-warm · #3B2F2F text · #8B5E3C accent · #E8DDD0 border
    name: "paper",
    label: "Cabinet",
    type: "light",
    font: "'Inter', var(--font-sans)",
    headingFont: "'Source Serif 4', 'Instrument Serif', Georgia, serif",
    accent: "#8B5E3C",
    vars: {
      "--background":           "oklch(0.974 0.005 60)",   // #FAF6F1
      "--foreground":           "oklch(0.22 0.018 28)",    // #3B2F2F
      "--card":                 "oklch(1 0 0)",             // #FFFFFF
      "--card-foreground":      "oklch(0.22 0.018 28)",    // #3B2F2F
      "--popover":              "oklch(1 0 0)",             // #FFFFFF
      "--popover-foreground":   "oklch(0.22 0.018 28)",    // #3B2F2F
      "--primary":              "oklch(0.47 0.09 48)",     // #8B5E3C
      "--primary-foreground":   "oklch(1 0 0)",            // #FFFFFF
      "--secondary":            "oklch(0.92 0.026 56)",    // #F5E6D3 accent-bg
      "--secondary-foreground": "oklch(0.22 0.018 28)",    // #3B2F2F
      "--muted":                "oklch(0.961 0.014 58)",   // #FAF2EA accent-bg-subtle
      "--muted-foreground":     "oklch(0.64 0.025 50)",    // #A89888
      "--accent":               "oklch(0.946 0.010 60)",   // #F3EDE4 bg-warm
      "--accent-foreground":    "oklch(0.22 0.018 28)",    // #3B2F2F
      "--destructive":          "oklch(0.55 0.22 25)",
      "--border":               "oklch(0.882 0.016 56)",   // #E8DDD0
      "--input":                "oklch(0.882 0.016 56)",   // #E8DDD0
      // Audit #054: focus rings against the warm parchment background were
      // calculated at ~2.6:1 contrast — under WCAG 2.4.7 (3:1 for non-text
      // UI). Push L 0.47 → 0.34 (deeper rust, same hue) to clear 4:1.
      "--ring":                 "oklch(0.34 0.09 48)",     // deeper #6B4A2D for visibility
      // Manila Arc: the sidebar rail merges into the desk gutter (same warm
      // manila) so the bright content sheet reads as the one elevated surface.
      // This value MUST equal --gutter (globals.css, keyed on
      // data-custom-theme="paper") or a tonal seam appears between rail and
      // desk (#088). The gutter lives there — NOT here — because an inline
      // theme var sticks when you switch to a theme that doesn't redefine it.
      "--sidebar":              "oklch(0.925 0.026 79)",   // rail == desk (== --gutter)
      "--sidebar-foreground":   "oklch(0.22 0.018 28)",    // #3B2F2F
      "--sidebar-primary":      "oklch(0.47 0.09 48)",     // #8B5E3C
      "--sidebar-primary-foreground": "oklch(1 0 0)",      // #FFFFFF
      "--sidebar-accent":       "oklch(0.92 0.026 56)",    // #F5E6D3
      "--sidebar-accent-foreground":  "oklch(0.22 0.018 28)", // #3B2F2F
      "--sidebar-border":       "oklch(0.882 0.016 56)",   // #E8DDD0
      "--sidebar-ring":         "oklch(0.34 0.09 48)",     // matches --ring
    },
  },
  {
    name: "sakura",
    label: "Sakura",
    type: "light",
    font: "'Nunito', var(--font-sans)",
    headingFont: "'Cormorant Garamond', Georgia, serif",
    accent: "#ec4899",
    vars: {
      "--background": "oklch(0.97 0.01 340)",
      "--foreground": "oklch(0.25 0.02 330)",
      "--card": "oklch(0.98 0.01 340)",
      "--card-foreground": "oklch(0.25 0.02 330)",
      "--popover": "oklch(0.98 0.01 340)",
      "--popover-foreground": "oklch(0.25 0.02 330)",
      "--primary": "oklch(0.6 0.18 340)",
      "--primary-foreground": "oklch(0.98 0 0)",
      "--secondary": "oklch(0.93 0.02 340)",
      "--secondary-foreground": "oklch(0.3 0.02 330)",
      "--muted": "oklch(0.93 0.02 340)",
      "--muted-foreground": "oklch(0.55 0.04 335)",
      "--accent": "oklch(0.93 0.02 340)",
      "--accent-foreground": "oklch(0.25 0.02 330)",
      "--destructive": "oklch(0.55 0.22 25)",
      "--border": "oklch(0.88 0.03 340)",
      "--input": "oklch(0.88 0.03 340)",
      "--ring": "oklch(0.6 0.15 340)",
      "--sidebar": "oklch(0.96 0.01 340)",
      "--sidebar-foreground": "oklch(0.25 0.02 330)",
      "--sidebar-primary": "oklch(0.6 0.18 340)",
      "--sidebar-primary-foreground": "oklch(0.98 0 0)",
      "--sidebar-accent": "oklch(0.91 0.02 340)",
      "--sidebar-accent-foreground": "oklch(0.3 0.02 330)",
      "--sidebar-border": "oklch(0.88 0.03 340)",
      "--sidebar-ring": "oklch(0.6 0.12 340)",
    },
  },
  {
    name: "meadow",
    label: "Meadow",
    type: "light",
    font: "'Rubik', var(--font-sans)",
    headingFont: "'Bitter', Georgia, serif",
    accent: "#16a34a",
    vars: {
      "--background": "oklch(0.97 0.01 140)",
      "--foreground": "oklch(0.2 0.03 145)",
      "--card": "oklch(0.98 0.005 140)",
      "--card-foreground": "oklch(0.2 0.03 145)",
      "--popover": "oklch(0.98 0.005 140)",
      "--popover-foreground": "oklch(0.2 0.03 145)",
      "--primary": "oklch(0.55 0.18 150)",
      "--primary-foreground": "oklch(0.98 0 0)",
      "--secondary": "oklch(0.93 0.02 140)",
      "--secondary-foreground": "oklch(0.25 0.03 145)",
      "--muted": "oklch(0.93 0.02 140)",
      "--muted-foreground": "oklch(0.5 0.04 145)",
      "--accent": "oklch(0.93 0.02 140)",
      "--accent-foreground": "oklch(0.2 0.03 145)",
      "--destructive": "oklch(0.55 0.22 25)",
      "--border": "oklch(0.87 0.03 140)",
      "--input": "oklch(0.87 0.03 140)",
      "--ring": "oklch(0.55 0.12 150)",
      "--sidebar": "oklch(0.95 0.01 140)",
      "--sidebar-foreground": "oklch(0.2 0.03 145)",
      "--sidebar-primary": "oklch(0.55 0.18 150)",
      "--sidebar-primary-foreground": "oklch(0.98 0 0)",
      "--sidebar-accent": "oklch(0.91 0.02 140)",
      "--sidebar-accent-foreground": "oklch(0.25 0.03 145)",
      "--sidebar-border": "oklch(0.87 0.03 140)",
      "--sidebar-ring": "oklch(0.55 0.12 150)",
    },
  },
  {
    name: "sky",
    label: "Sky",
    type: "light",
    font: "'Figtree', var(--font-sans)",
    headingFont: "'Montserrat', var(--font-sans)",
    accent: "#2563eb",
    vars: {
      "--background": "oklch(0.97 0.01 240)",
      "--foreground": "oklch(0.2 0.02 240)",
      "--card": "oklch(0.98 0.005 240)",
      "--card-foreground": "oklch(0.2 0.02 240)",
      "--popover": "oklch(0.98 0.005 240)",
      "--popover-foreground": "oklch(0.2 0.02 240)",
      "--primary": "oklch(0.55 0.2 260)",
      "--primary-foreground": "oklch(0.98 0 0)",
      "--secondary": "oklch(0.93 0.01 240)",
      "--secondary-foreground": "oklch(0.25 0.02 240)",
      "--muted": "oklch(0.93 0.01 240)",
      "--muted-foreground": "oklch(0.5 0.04 240)",
      "--accent": "oklch(0.93 0.01 240)",
      "--accent-foreground": "oklch(0.2 0.02 240)",
      "--destructive": "oklch(0.55 0.22 25)",
      "--border": "oklch(0.87 0.02 240)",
      "--input": "oklch(0.87 0.02 240)",
      "--ring": "oklch(0.55 0.15 260)",
      "--sidebar": "oklch(0.95 0.01 240)",
      "--sidebar-foreground": "oklch(0.2 0.02 240)",
      "--sidebar-primary": "oklch(0.55 0.2 260)",
      "--sidebar-primary-foreground": "oklch(0.98 0 0)",
      "--sidebar-accent": "oklch(0.91 0.01 240)",
      "--sidebar-accent-foreground": "oklch(0.25 0.02 240)",
      "--sidebar-border": "oklch(0.87 0.02 240)",
      "--sidebar-ring": "oklch(0.55 0.15 260)",
    },
  },
  {
    name: "lavender",
    label: "Lavender",
    type: "light",
    font: "'Quicksand', var(--font-sans)",
    headingFont: "'Spectral', Georgia, serif",
    accent: "#a855f7",
    vars: {
      "--background": "oklch(0.97 0.01 295)",
      "--foreground": "oklch(0.22 0.03 290)",
      "--card": "oklch(0.98 0.005 295)",
      "--card-foreground": "oklch(0.22 0.03 290)",
      "--popover": "oklch(0.98 0.005 295)",
      "--popover-foreground": "oklch(0.22 0.03 290)",
      "--primary": "oklch(0.58 0.18 295)",
      "--primary-foreground": "oklch(0.98 0 0)",
      "--secondary": "oklch(0.93 0.02 295)",
      "--secondary-foreground": "oklch(0.28 0.03 290)",
      "--muted": "oklch(0.93 0.02 295)",
      "--muted-foreground": "oklch(0.52 0.04 290)",
      "--accent": "oklch(0.93 0.02 295)",
      "--accent-foreground": "oklch(0.22 0.03 290)",
      "--destructive": "oklch(0.55 0.22 25)",
      "--border": "oklch(0.87 0.03 295)",
      "--input": "oklch(0.87 0.03 295)",
      "--ring": "oklch(0.58 0.14 295)",
      "--sidebar": "oklch(0.95 0.01 295)",
      "--sidebar-foreground": "oklch(0.22 0.03 290)",
      "--sidebar-primary": "oklch(0.58 0.18 295)",
      "--sidebar-primary-foreground": "oklch(0.98 0 0)",
      "--sidebar-accent": "oklch(0.91 0.02 295)",
      "--sidebar-accent-foreground": "oklch(0.28 0.03 290)",
      "--sidebar-border": "oklch(0.87 0.03 295)",
      "--sidebar-ring": "oklch(0.58 0.14 295)",
    },
  },

  // ─── NOVELTY / ERA THEMES ───
  // Windows 95 — silver chassis as the page canvas, iconic teal as the
  // sidebar (think desktop wallpaper framing an Explorer window), navy
  // chrome for selection. Arimo is a metric-compatible Arial / MS Sans
  // Serif stand-in — reads cleanly at any size, unlike pixel fonts which
  // turn body copy into a puzzle.
  {
    name: "win95",
    label: "Windows 95",
    type: "light",
    font: "'Arimo', var(--font-sans)",
    headingFont: "'Arimo', var(--font-sans)",
    accent: "#008080",
    vars: {
      "--background":           "oklch(0.82 0 0)",         // #C0C0C0 silver — the page
      "--foreground":           "oklch(0.15 0 0)",         // near-black label text
      "--card":                 "oklch(0.98 0 0)",         // near-white content panels
      "--card-foreground":      "oklch(0.15 0 0)",
      "--popover":              "oklch(0.88 0 0)",         // lighter silver menus
      "--popover-foreground":   "oklch(0.15 0 0)",
      "--primary":              "oklch(0.30 0.14 265)",   // #000080 navy action
      "--primary-foreground":   "oklch(0.98 0 0)",
      "--secondary":            "oklch(0.88 0 0)",         // light silver inset
      "--secondary-foreground": "oklch(0.15 0 0)",
      "--muted":                "oklch(0.88 0 0)",
      "--muted-foreground":     "oklch(0.35 0 0)",
      "--accent":               "oklch(0.30 0.14 265)",   // navy selection
      "--accent-foreground":    "oklch(0.98 0 0)",
      "--destructive":          "oklch(0.55 0.22 25)",
      "--border":               "oklch(0.50 0 0)",         // mid-gray 3D edge
      "--input":                "oklch(1 0 0)",            // white input field
      "--ring":                 "oklch(0.30 0.14 265)",
      "--sidebar":              "oklch(0.55 0.11 196)",   // #008080 desktop teal — punchy
      "--sidebar-foreground":   "oklch(0.98 0 0)",         // white on teal
      "--sidebar-primary":      "oklch(0.30 0.14 265)",   // navy action in sidebar
      "--sidebar-primary-foreground": "oklch(0.98 0 0)",
      "--sidebar-accent":       "oklch(0.47 0.10 196)",   // deeper teal hover
      "--sidebar-accent-foreground": "oklch(0.98 0 0)",
      "--sidebar-border":       "oklch(0.40 0.09 196)",   // darkest teal divider
      "--sidebar-ring":         "oklch(0.98 0 0)",
    },
  },

  // Windows XP — Luna Blue theme. White canvas like Explorer, Luna-blue
  // sidebar with a touch more lift than hex #245EDC (echoes the gradient
  // top of the real Luna chrome), pale-blue secondary surfaces, and a
  // green primary that nods to the Start button. Open Sans stands in
  // for Tahoma.
  {
    name: "winxp",
    label: "Windows XP",
    type: "light",
    font: "'Open Sans', var(--font-sans)",
    headingFont: "'Open Sans', var(--font-sans)",
    accent: "#2F6FE5",
    vars: {
      "--background":           "oklch(1 0 0)",               // pure white canvas
      "--foreground":           "oklch(0.20 0.01 250)",       // cool near-black
      "--card":                 "oklch(0.99 0.006 240)",      // faint blue-white
      "--card-foreground":      "oklch(0.20 0.01 250)",
      "--popover":              "oklch(0.99 0.006 240)",
      "--popover-foreground":   "oklch(0.20 0.01 250)",
      "--primary":              "oklch(0.48 0.22 264)",       // brighter Luna blue
      "--primary-foreground":   "oklch(0.99 0 0)",
      "--secondary":            "oklch(0.93 0.028 245)",      // pale blue inset
      "--secondary-foreground": "oklch(0.20 0.01 250)",
      "--muted":                "oklch(0.95 0.018 245)",
      "--muted-foreground":     "oklch(0.45 0.04 250)",
      "--accent":               "oklch(0.93 0.028 245)",
      "--accent-foreground":    "oklch(0.20 0.01 250)",
      "--destructive":          "oklch(0.55 0.22 25)",
      "--border":               "oklch(0.88 0.02 245)",
      "--input":                "oklch(0.91 0.02 245)",
      "--ring":                 "oklch(0.48 0.22 264)",
      "--sidebar":              "oklch(0.48 0.22 264)",       // brighter Luna sidebar
      "--sidebar-foreground":   "oklch(0.99 0 0)",
      "--sidebar-primary":      "oklch(0.72 0.17 140)",       // Start-button green
      "--sidebar-primary-foreground": "oklch(0.15 0 0)",
      "--sidebar-accent":       "oklch(0.38 0.20 264)",       // deeper Luna hover
      "--sidebar-accent-foreground": "oklch(0.99 0 0)",
      "--sidebar-border":       "oklch(0.32 0.18 264)",
      "--sidebar-ring":         "oklch(0.99 0 0)",
    },
  },

  // Matrix — phosphor-green terminal. Near-black substrate with
  // luminous #00FF41 text, chosen to match the 1999 film's screen palette.
  {
    name: "matrix",
    label: "Matrix",
    type: "dark",
    font: "'Share Tech Mono', var(--font-mono)",
    headingFont: "'Major Mono Display', var(--font-mono)",
    accent: "#00ff41",
    vars: {
      "--background":           "oklch(0.06 0 0)",           // near-black
      "--foreground":           "oklch(0.86 0.24 142)",      // #00FF41 phosphor
      "--card":                 "oklch(0.10 0.02 142)",      // green-tinted black
      "--card-foreground":      "oklch(0.86 0.24 142)",
      "--popover":              "oklch(0.10 0.02 142)",
      "--popover-foreground":   "oklch(0.86 0.24 142)",
      "--primary":              "oklch(0.86 0.24 142)",      // bright green CTA
      "--primary-foreground":   "oklch(0.06 0 0)",
      "--secondary":            "oklch(0.18 0.06 142)",      // dim green panel
      "--secondary-foreground": "oklch(0.72 0.18 142)",
      "--muted":                "oklch(0.14 0.04 142)",
      "--muted-foreground":     "oklch(0.52 0.14 142)",      // fading phosphor
      "--accent":               "oklch(0.22 0.08 142)",
      "--accent-foreground":    "oklch(0.86 0.24 142)",
      "--destructive":          "oklch(0.65 0.22 25)",
      "--border":               "oklch(0.86 0.24 142 / 22%)",
      "--input":                "oklch(0.86 0.24 142 / 14%)",
      "--ring":                 "oklch(0.86 0.24 142)",
      "--sidebar":              "oklch(0.08 0.01 142)",
      "--sidebar-foreground":   "oklch(0.72 0.18 142)",
      "--sidebar-primary":      "oklch(0.86 0.24 142)",
      "--sidebar-primary-foreground": "oklch(0.06 0 0)",
      "--sidebar-accent":       "oklch(0.14 0.04 142)",
      "--sidebar-accent-foreground": "oklch(0.72 0.18 142)",
      "--sidebar-border":       "oklch(0.86 0.24 142 / 18%)",
      "--sidebar-ring":         "oklch(0.60 0.18 142)",
    },
  },

  // Apple — macOS-inspired minimal. Pure-white canvas, #F5F5F7 gray
  // for secondary surfaces, #1D1D1F text, Apple's current system blue
  // (#0071E3) as the primary action. Inter stands in for SF Pro.
  {
    name: "apple",
    label: "Apple",
    type: "light",
    font: "'Inter', var(--font-sans)",
    headingFont: "'Inter', var(--font-sans)",
    accent: "#0071e3",
    vars: {
      "--background":           "oklch(1 0 0)",               // #FFFFFF
      "--foreground":           "oklch(0.22 0.003 270)",      // #1D1D1F
      "--card":                 "oklch(1 0 0)",
      "--card-foreground":      "oklch(0.22 0.003 270)",
      "--popover":              "oklch(1 0 0)",
      "--popover-foreground":   "oklch(0.22 0.003 270)",
      "--primary":              "oklch(0.56 0.20 253)",       // #0071E3 system blue
      "--primary-foreground":   "oklch(0.99 0 0)",
      "--secondary":            "oklch(0.965 0.003 270)",     // #F5F5F7
      "--secondary-foreground": "oklch(0.22 0.003 270)",
      "--muted":                "oklch(0.965 0.003 270)",
      "--muted-foreground":     "oklch(0.52 0.008 270)",      // #6E6E73
      "--accent":               "oklch(0.965 0.003 270)",
      "--accent-foreground":    "oklch(0.22 0.003 270)",
      "--destructive":          "oklch(0.60 0.23 25)",        // system red ~#FF3B30
      "--border":               "oklch(0.90 0.003 270)",      // hairline
      "--input":                "oklch(0.92 0.003 270)",
      "--ring":                 "oklch(0.56 0.20 253)",
      "--sidebar":              "oklch(0.965 0.003 270)",     // #F5F5F7
      "--sidebar-foreground":   "oklch(0.22 0.003 270)",
      "--sidebar-primary":      "oklch(0.56 0.20 253)",
      "--sidebar-primary-foreground": "oklch(0.99 0 0)",
      "--sidebar-accent":       "oklch(0.93 0.003 270)",
      "--sidebar-accent-foreground": "oklch(0.22 0.003 270)",
      "--sidebar-border":       "oklch(0.90 0.003 270)",
      "--sidebar-ring":         "oklch(0.56 0.20 253)",
    },
  },
];

// Pull the quoted Google Font family name out of a CSS font-family stack
// like `'Space Grotesk', var(--font-sans)`. Unquoted generics / `var(...)`
// fallbacks never need loading — they're already available.
function extractGoogleFontFamily(stack: string | undefined): string | null {
  if (!stack) return null;
  const match = stack.match(/'([^']+)'|"([^"]+)"/);
  const name = match?.[1] ?? match?.[2];
  if (!name) return null;
  // System / already-loaded families that ship with the app.
  if (name === "Inter" || name === "JetBrains Mono" || name === "Georgia") {
    return null;
  }
  return name;
}

function buildFontStylesheetUrl(families: string[]): string | null {
  if (families.length === 0) return null;
  const encoded = families.map((family) => {
    const base = family.replace(/\s+/g, "+");
    // Variable-weight serifs get opsz+wght axes; everything else loads 400/500/600/700.
    if (family === "Fraunces") {
      return `family=${base}:opsz,wght@9..144,400;9..144,600;9..144,700`;
    }
    if (family === "Source Serif 4") {
      return `family=${base}:opsz,wght@8..60,400;8..60,600;8..60,700`;
    }
    // Display/mono single-weight fonts.
    if (
      family === "Major Mono Display" ||
      family === "Share Tech Mono" ||
      family === "Instrument Serif"
    ) {
      return `family=${base}`;
    }
    return `family=${base}:wght@400;500;600;700`;
  });
  return `https://fonts.googleapis.com/css2?${encoded.join("&")}&display=swap`;
}

/**
 * Load Noto Sans SC / TC when the active locale is Chinese, so themes whose
 * Latin font lacks CJK glyphs still render Chinese correctly. CSS rules in
 * globals.css scoped to `html:lang(zh-*)` add these as a font-stack fallback
 * after the theme font — browsers cascade per-character, so Latin keeps the
 * theme's look and Chinese characters pull from Noto Sans.
 */
export function loadCjkFonts(locale: string) {
  if (typeof document === "undefined") return;
  const link = document.getElementById("cjk-fonts-link") as HTMLLinkElement | null;
  let family: string | null = null;
  if (locale.startsWith("zh-Hans") || locale === "zh-CN" || locale === "zh") {
    family = "Noto+Sans+SC";
  } else if (locale.startsWith("zh-Hant") || locale === "zh-TW") {
    family = "Noto+Sans+TC";
  }
  if (!family) {
    link?.remove();
    return;
  }
  const url = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`;
  if (link) {
    if (link.href !== url) link.href = url;
    return;
  }
  const el = document.createElement("link");
  el.id = "cjk-fonts-link";
  el.rel = "stylesheet";
  el.href = url;
  document.head.appendChild(el);
}

// Swap the active Google Fonts <link> to only the families the current theme
// actually uses. Previously we loaded every theme's fonts (30+ families) on
// every page load, blocking LCP for seconds.
function loadThemeFonts(theme: ThemeDefinition | null) {
  if (typeof document === "undefined") return;
  const families = theme
    ? Array.from(
        new Set(
          [
            extractGoogleFontFamily(theme.font),
            extractGoogleFontFamily(theme.headingFont),
          ].filter((f): f is string => !!f)
        )
      )
    : [];

  const link = document.getElementById("theme-fonts-link") as HTMLLinkElement | null;
  const url = buildFontStylesheetUrl(families);

  if (!url) {
    link?.remove();
    return;
  }
  if (link) {
    if (link.href !== url) link.href = url;
    return;
  }
  const el = document.createElement("link");
  el.id = "theme-fonts-link";
  el.rel = "stylesheet";
  el.href = url;
  document.head.appendChild(el);
}

// Apply a custom theme by setting CSS variables on the root element
export function applyTheme(theme: ThemeDefinition | null) {
  const root = document.documentElement;

  if (!theme) {
    // Reset to default (remove custom vars, let .dark/:root handle it)
    root.removeAttribute("data-custom-theme");
    root.style.removeProperty("--font-theme");
    root.style.removeProperty("--font-heading-theme");
    if (THEMES[0]) {
      Object.keys(THEMES[0].vars).forEach((key) => {
        root.style.removeProperty(key);
      });
    }
    loadThemeFonts(null);
    return;
  }

  // Set the dark/light class
  root.classList.toggle("dark", theme.type === "dark");

  // Apply CSS variables
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  // Apply fonts
  if (theme.font) {
    root.style.setProperty("--font-theme", theme.font);
  } else {
    root.style.removeProperty("--font-theme");
  }

  if (theme.headingFont) {
    root.style.setProperty("--font-heading-theme", theme.headingFont);
  } else {
    root.style.removeProperty("--font-heading-theme");
  }

  root.setAttribute("data-custom-theme", theme.name);
  loadThemeFonts(theme);
}

// Get the stored theme name from localStorage
export function getStoredThemeName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cabinet-theme");
}

// Store theme name to localStorage
export function storeThemeName(name: string | null) {
  if (typeof window === "undefined") return;
  if (name) {
    localStorage.setItem("cabinet-theme", name);
  } else {
    localStorage.removeItem("cabinet-theme");
  }
}

// ─── Audit #045: "Match system" pair ──────────────────────────────
// When the user picks "Match system", Cabinet stores a pair of theme
// names — one to apply when prefers-color-scheme is light, one for dark
// — and listens on matchMedia to swap between them. The mode flag lives
// alongside so the picker UI knows which group to show as active.
const THEME_MODE_KEY = "cabinet-theme-mode";
const THEME_LIGHT_KEY = "cabinet-theme-light";
const THEME_DARK_KEY = "cabinet-theme-dark";

export type ThemeMode = "manual" | "system";

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "manual";
  const raw = localStorage.getItem(THEME_MODE_KEY);
  return raw === "system" ? "system" : "manual";
}

export function storeThemeMode(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_MODE_KEY, mode);
}

export function getStoredThemePair(): { light: string; dark: string } {
  const defaults = { light: "paper", dark: "claude" };
  if (typeof window === "undefined") return defaults;
  return {
    light: localStorage.getItem(THEME_LIGHT_KEY) || defaults.light,
    dark: localStorage.getItem(THEME_DARK_KEY) || defaults.dark,
  };
}

export function storeThemePair(pair: { light?: string; dark?: string }) {
  if (typeof window === "undefined") return;
  if (pair.light) localStorage.setItem(THEME_LIGHT_KEY, pair.light);
  if (pair.dark) localStorage.setItem(THEME_DARK_KEY, pair.dark);
}

export function findThemeByName(name: string): ThemeDefinition | null {
  return THEMES.find((t) => t.name === name) ?? null;
}

/**
 * Resolve which named theme should be applied right now given the system's
 * color scheme. When mode === "manual", returns the manually-chosen theme.
 * When mode === "system", returns the user's chosen light or dark variant
 * based on `prefers-color-scheme`. Returns null if no preferences are set.
 */
export function resolveActiveTheme(): ThemeDefinition | null {
  if (typeof window === "undefined") return null;
  const mode = getStoredThemeMode();
  if (mode === "system") {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const pair = getStoredThemePair();
    return findThemeByName(isDark ? pair.dark : pair.light);
  }
  const stored = getStoredThemeName();
  return stored ? findThemeByName(stored) : null;
}
