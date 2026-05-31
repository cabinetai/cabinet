/**
 * Tour color palette — matches the onboarding wizard's WEB palette so the
 * tour reads as a continuation of the same cream-paper, mocha-brown
 * aesthetic instead of Tailwind's golden amber. Hardcoded (not theme
 * tokens) because the tour, like the wizard, forces its own look
 * regardless of the app's light/dark setting.
 */
export const TOUR_PALETTE = {
  paper: "#FAF6F1",
  paperWarm: "#F3EDE4",
  bgCard: "#FFFFFF",
  text: "#3B2F2F",
  textSecondary: "#6B5B4F",
  textTertiary: "#A89888",
  accent: "#8B5E3C",
  accentWarm: "#7A4F30",
  accentBg: "#F5E6D3",
  border: "#E8DDD0",
  borderLight: "#F0E8DD",
  borderDark: "#D4C4B0",
  /**
   * Warm yellow amber for the Archive glyph and the active drawer
   * pull-handle — matches the real sidebar's `text-amber-400` accent
   * rather than the mocha brown used for copy / borders.
   */
  iconAmber: "#FBBF24",
  iconAmberSoft: "rgba(251, 191, 36, 0.6)",
} as const;
