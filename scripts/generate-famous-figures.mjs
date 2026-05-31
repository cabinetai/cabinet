// One-shot generator for /public/agent-avatars/famous-*.svg.
// 100 famous-figure silhouettes in the same minimal vibe as the classic
// 12 avatars — background + shoulders + neck + face circle + one or two
// hair/hat/accessory paths. No facial features; identity comes from the
// silhouette, hat, glasses, scar, or mask.
//
// Re-run with `node scripts/generate-famous-figures.mjs` to regenerate.

import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "agent-avatars");
mkdirSync(outDir, { recursive: true });

const BG = {
  cream: "#f3ede4",
  sand: "#ece3d6",
  beige: "#e8ddd0",
  taupe: "#d9d2c4",
  oat: "#e5dcce",
  linen: "#eee6d9",
  mint: "#d7e6d2",
  sky: "#d0dde8",
  dusk: "#d8d0e2",
  rose: "#eed7d7",
  night: "#1e2330",
  gold: "#f4e6a8",
  salmon: "#f2cfc2",
  sage: "#dfe6d6",
};

const SHIRT = {
  rust: "#8b5e3c",
  tan: "#a67c52",
  sage: "#6b8070",
  navy: "#4a6b82",
  plum: "#8a6b7d",
  olive: "#9a8855",
  teal: "#567878",
  lavender: "#7a6b8a",
  black: "#2a2a2a",
  red: "#b33a3a",
  white: "#f0ebe2",
  yellow: "#e8c047",
  green: "#4a7a3a",
  blue: "#3a6ac2",
  purple: "#6b3f8a",
  pink: "#d88cb0",
  brown: "#6b4a30",
  grey: "#7a7a7a",
};

const SKIN = {
  light: "#f2d4b3",
  peach: "#e8b98d",
  tan: "#d49c72",
  medium: "#b87e56",
  brown: "#915a3c",
  deep: "#6b3f26",
  yellow: "#f7d13f", // Simpsons
  green: "#6aa84f", // Hulk / Shrek
  mint: "#b4d982", // Yoda
  pale: "#e4dccc", // Voldemort / ghost
  grey: "#c4c4c4",
  red: "#c24232", // devil
  blue: "#8db5d4", // genie
  orange: "#e58a3a", // pumpkin
};

const HAIR = {
  black: "#2a1d14",
  blackSoft: "#3a2a20",
  brown: "#6b3f1f",
  chestnut: "#8a5a2a",
  auburn: "#a1462c",
  red: "#c0553a",
  ginger: "#c07840",
  blonde: "#e8c484",
  honey: "#d4a866",
  platinum: "#f2e4b8",
  grey: "#a39e8f",
  silver: "#d5d0c4",
  white: "#f0ebe2",
  dyedGreen: "#6a8c4a",
  dyedPink: "#d88cb0",
  dyedPurple: "#9a6bb0",
  dyedBlue: "#5a8acc",
};

// ─── Base template ────────────────────────────────────────────────────
function base({ bg, shirt, skin }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <rect width="120" height="120" fill="${bg}"/>
  <path d="M14 120 Q14 84 60 80 Q106 84 106 120 Z" fill="${shirt}"/>
  <rect x="53" y="70" width="14" height="14" fill="${skin}"/>
  <circle cx="60" cy="54" r="22" fill="${skin}"/>`;
}

// ─── Hair ─────────────────────────────────────────────────────────────
const hair = {
  messy: (c) =>
    `<path d="M38 52 Q60 28 82 52 Q82 44 60 36 Q38 44 38 52 Z" fill="${c}"/>`,
  shortNeat: (c) =>
    `<path d="M38 50 Q40 32 60 30 Q80 32 82 50 Q78 42 60 42 Q42 42 38 50 Z" fill="${c}"/>`,
  bob: (c) =>
    `<path d="M34 56 Q34 30 60 30 Q86 30 86 56 L86 70 Q80 56 60 56 Q40 56 34 70 Z" fill="${c}"/>`,
  long: (c) =>
    `<path d="M34 70 Q30 40 60 30 Q90 40 86 70 L92 100 Q60 90 28 100 Z" fill="${c}"/>
  <path d="M40 50 Q60 34 80 50 Q80 44 60 38 Q40 44 40 50 Z" fill="${c}"/>`,
  veryLong: (c) =>
    `<path d="M30 78 Q24 36 60 26 Q96 36 90 78 L96 108 Q60 96 24 108 Z" fill="${c}"/>
  <path d="M40 50 Q60 32 80 50 Q80 44 60 36 Q40 44 40 50 Z" fill="${c}"/>`,
  wavy: (c) =>
    `<path d="M36 58 Q32 34 60 30 Q88 34 84 58 Q80 50 72 54 Q64 48 56 54 Q48 50 40 56 Z" fill="${c}"/>`,
  curly: (c) => `
  <circle cx="44" cy="44" r="10" fill="${c}"/>
  <circle cx="54" cy="36" r="11" fill="${c}"/>
  <circle cx="66" cy="34" r="11" fill="${c}"/>
  <circle cx="76" cy="42" r="10" fill="${c}"/>
  <circle cx="72" cy="52" r="9" fill="${c}"/>
  <circle cx="48" cy="54" r="9" fill="${c}"/>`,
  afro: (c) => `<circle cx="60" cy="36" r="26" fill="${c}"/>`,
  bigFro: (c) => `<ellipse cx="60" cy="32" rx="32" ry="24" fill="${c}"/>`,
  bald: () => "",
  baldHint: (c) =>
    `<path d="M42 44 Q60 38 78 44 L78 46 Q60 42 42 46 Z" fill="${c}" opacity="0.25"/>`,
  ponytail: (c) => `
  <path d="M40 50 Q60 30 80 50 Q80 42 60 34 Q40 42 40 50 Z" fill="${c}"/>
  <path d="M80 50 Q94 60 88 84 L80 78 Q82 64 78 56 Z" fill="${c}"/>`,
  sideSwoop: (c) =>
    `<path d="M38 50 Q40 32 62 30 Q82 32 82 50 Q74 40 58 42 Q46 44 38 50 Z" fill="${c}"/>`,
  pompadour: (c) =>
    `<path d="M36 52 Q36 24 60 20 Q84 24 84 52 Q82 32 60 36 Q38 32 36 52 Z" fill="${c}"/>`,
  wildEinstein: (c) => `
  <circle cx="38" cy="46" r="13" fill="${c}"/>
  <circle cx="82" cy="46" r="13" fill="${c}"/>
  <circle cx="48" cy="26" r="14" fill="${c}"/>
  <circle cx="60" cy="22" r="14" fill="${c}"/>
  <circle cx="72" cy="26" r="14" fill="${c}"/>
  <circle cx="40" cy="58" r="10" fill="${c}"/>
  <circle cx="80" cy="58" r="10" fill="${c}"/>`,
  dreads: (c) => `
  <rect x="36" y="40" width="6" height="44" rx="3" fill="${c}"/>
  <rect x="46" y="34" width="6" height="52" rx="3" fill="${c}"/>
  <rect x="56" y="32" width="6" height="54" rx="3" fill="${c}"/>
  <rect x="66" y="34" width="6" height="52" rx="3" fill="${c}"/>
  <rect x="76" y="38" width="6" height="46" rx="3" fill="${c}"/>
  <path d="M38 48 Q60 28 82 48 Q82 40 60 34 Q38 40 38 48 Z" fill="${c}"/>`,
  cornrowBraids: (c) => `
  <path d="M36 50 L34 92 L42 92 L42 50 Z" fill="${c}"/>
  <path d="M78 50 L78 92 L86 92 L84 50 Z" fill="${c}"/>
  <path d="M38 50 Q60 32 82 50 Q82 42 60 36 Q38 42 38 50 Z" fill="${c}"/>
  <circle cx="45" cy="94" r="3" fill="${c}"/>
  <circle cx="81" cy="94" r="3" fill="${c}"/>`,
  twinBuns: (c) => `
  <circle cx="30" cy="54" r="12" fill="${c}"/>
  <circle cx="90" cy="54" r="12" fill="${c}"/>
  <path d="M40 50 Q60 34 80 50 Q80 44 60 38 Q40 44 40 50 Z" fill="${c}"/>`,
  topBun: (c) => `
  <circle cx="60" cy="26" r="9" fill="${c}"/>
  <path d="M40 50 Q60 34 80 50 Q80 44 60 38 Q40 44 40 50 Z" fill="${c}"/>`,
  mohawk: (c) =>
    `<path d="M54 14 L66 14 L70 52 L50 52 Z" fill="${c}"/>`,
  bartSpikes: (c) => `
  <polygon points="34,38 40,12 46,38" fill="${c}"/>
  <polygon points="44,38 50,10 56,38" fill="${c}"/>
  <polygon points="54,38 60,8  66,38" fill="${c}"/>
  <polygon points="64,38 70,10 76,38" fill="${c}"/>
  <polygon points="74,38 80,12 86,38" fill="${c}"/>`,
  beehive: (c) => `
  <path d="M44 48 Q40 10 60 6 Q80 10 76 48 Z" fill="${c}"/>
  <path d="M44 48 Q60 42 76 48 L76 56 Q60 50 44 56 Z" fill="${c}"/>`,
  mullet: (c) => `
  <path d="M38 50 Q40 32 60 30 Q80 32 82 50 Q78 42 60 42 Q42 42 38 50 Z" fill="${c}"/>
  <path d="M36 60 Q40 92 60 90 Q80 92 84 60 L78 64 L82 86 L38 86 Z" fill="${c}"/>`,
  bowlCut: (c) => `
  <path d="M36 54 Q36 28 60 28 Q84 28 84 54 L80 54 L80 42 L40 42 L40 54 Z" fill="${c}"/>
  <rect x="40" y="42" width="40" height="8" fill="${c}"/>`,
  veryShortCurls: (c) => `
  <circle cx="44" cy="42" r="6" fill="${c}"/>
  <circle cx="52" cy="36" r="7" fill="${c}"/>
  <circle cx="60" cy="34" r="7" fill="${c}"/>
  <circle cx="68" cy="36" r="7" fill="${c}"/>
  <circle cx="76" cy="42" r="6" fill="${c}"/>`,
  franklinMale: (c) => `
  <path d="M28 56 Q26 40 36 40 L36 58 Z" fill="${c}"/>
  <path d="M92 56 Q94 40 84 40 L84 58 Z" fill="${c}"/>`,
  widowsPeak: (c) => `
  <path d="M38 48 Q40 32 60 32 L60 44 L60 32 Q80 32 82 48 Q78 40 64 40 L56 40 Q42 40 38 48 Z" fill="${c}"/>
  <path d="M60 32 L54 42 L66 42 Z" fill="${c}"/>`,
  dolly: (c) => `
  <path d="M28 70 Q18 26 60 22 Q102 26 92 70 L98 96 Q60 84 22 96 Z" fill="${c}"/>
  <ellipse cx="60" cy="22" rx="30" ry="14" fill="${c}"/>`,
};

// ─── Hats ─────────────────────────────────────────────────────────────
const hat = {
  topHat: (c = "#1a1a1a", band = null) => `
  <rect x="40" y="8" width="40" height="26" fill="${c}"/>
  <rect x="34" y="34" width="52" height="5" fill="${c}"/>${band ? `
  <rect x="40" y="28" width="40" height="4" fill="${band}"/>` : ""}`,
  bowler: (c = "#1a1a1a") => `
  <path d="M36 40 Q36 20 60 20 Q84 20 84 40 Z" fill="${c}"/>
  <rect x="32" y="38" width="56" height="5" fill="${c}"/>`,
  pointyWizard: (c, band = null) => `
  <path d="M38 40 L62 4 L82 40 Z" fill="${c}"/>
  <rect x="30" y="38" width="60" height="6" fill="${c}"/>${band ? `
  <rect x="32" y="36" width="56" height="3" fill="${band}"/>` : ""}`,
  witchHat: (c = "#2a1d14") => `
  <path d="M36 42 Q56 6 64 4 Q76 20 82 42 Z" fill="${c}"/>
  <rect x="28" y="40" width="64" height="6" fill="${c}"/>
  <rect x="52" y="34" width="16" height="5" fill="#d4a866"/>`,
  crown: (c = "#f4c430") => `
  <path d="M38 34 L44 16 L52 30 L60 12 L68 30 L76 16 L82 34 L82 42 L38 42 Z" fill="${c}"/>
  <circle cx="60" cy="20" r="2.5" fill="#c92e2e"/>`,
  tiara: (c = "#f4c430", gem = "#c92e2e") => `
  <path d="M38 44 L48 36 L60 30 L72 36 L82 44 Z" fill="${c}"/>
  <circle cx="60" cy="36" r="3" fill="${gem}"/>`,
  cowboy: (c) => `
  <path d="M24 40 Q40 22 60 22 Q80 22 96 40 L86 40 Q82 34 60 34 Q38 34 34 40 Z" fill="${c}"/>`,
  beret: (c, badge = null) => `
  <ellipse cx="60" cy="34" rx="26" ry="10" fill="${c}"/>
  <circle cx="46" cy="28" r="6" fill="${c}"/>${badge ? `
  <path d="M60 28 L63 34 L69 35 L64 39 L66 45 L60 42 L54 45 L56 39 L51 35 L57 34 Z" fill="${badge}"/>` : ""}`,
  baseball: (c, letter = null, letterColor = "#f0ebe2") => `
  <path d="M38 40 Q38 24 60 22 Q82 24 82 40 Z" fill="${c}"/>
  <path d="M30 40 L62 40 Q62 36 60 36 Q42 36 30 40 Z" fill="${c}"/>${letter ? `
  <text x="60" y="34" font-family="Arial" font-size="14" font-weight="bold" fill="${letterColor}" text-anchor="middle">${letter}</text>` : ""}`,
  santaHat: () => `
  <path d="M36 40 L86 10 L86 40 Z" fill="#c92e2e"/>
  <rect x="32" y="38" width="56" height="6" fill="#f0ebe2"/>
  <circle cx="86" cy="12" r="6" fill="#f0ebe2"/>`,
  beanie: (c, band = null) => `
  <path d="M34 50 Q34 24 60 24 Q86 24 86 50 Z" fill="${c}"/>
  <circle cx="60" cy="22" r="4" fill="${c}"/>${band ? `
  <rect x="34" y="46" width="52" height="8" fill="${band}"/>` : ""}`,
  bandana: (c, knot = true) => `
  <path d="M32 50 Q32 32 60 28 Q88 32 88 50 L88 54 Q60 46 32 54 Z" fill="${c}"/>${knot ? `
  <path d="M82 48 L94 58 L84 60 Z" fill="${c}"/>` : ""}`,
  pirateBandana: (c = "#c92e2e") => `
  <path d="M32 50 Q32 32 60 28 Q88 32 88 50 L88 54 Q60 46 32 54 Z" fill="${c}"/>
  <path d="M82 48 L94 58 L84 60 Z" fill="${c}"/>
  <circle cx="48" cy="42" r="3" fill="#f0ebe2"/>`,
  fedora: (c, band = null) => `
  <path d="M30 40 Q40 22 60 20 Q80 22 90 40 Z" fill="${c}"/>
  <rect x="30" y="38" width="60" height="5" fill="${c}"/>${band ? `
  <rect x="32" y="36" width="56" height="3" fill="${band}"/>` : ""}`,
  deerstalker: (c = "#8a5a2a") => `
  <path d="M36 38 Q36 22 60 20 Q84 22 84 38 L84 48 Q60 42 36 48 Z" fill="${c}"/>
  <path d="M28 40 L36 36 L36 48 Z" fill="${c}"/>
  <path d="M92 40 L84 36 L84 48 Z" fill="${c}"/>
  <path d="M56 30 L64 30 L62 22 L58 22 Z" fill="${c}"/>`,
  bicorne: (c = "#1e2330") => `
  <path d="M26 38 L46 12 L74 12 L94 38 Q76 46 60 40 Q44 46 26 38 Z" fill="${c}"/>
  <circle cx="60" cy="32" r="4" fill="#c92e2e"/>`,
  vikingHelmet: (c = "#8a7a55") => `
  <path d="M36 46 Q36 28 60 26 Q84 28 84 46 Z" fill="${c}"/>
  <rect x="32" y="44" width="56" height="4" fill="${c}"/>
  <path d="M26 42 Q18 24 30 24 L36 42 Z" fill="#e4dccc"/>
  <path d="M94 42 Q102 24 90 24 L84 42 Z" fill="#e4dccc"/>`,
  astronaut: () => `
  <circle cx="60" cy="54" r="30" fill="#f0ebe2" stroke="#c4c4c4" stroke-width="2"/>
  <path d="M38 48 L82 48 L82 62 Q60 66 38 62 Z" fill="#1a2a3a"/>
  <circle cx="74" cy="52" r="2" fill="#f4e6a8"/>`,
  batmanCowl: () => `
  <path d="M34 54 L42 14 L50 40 L70 40 L78 14 L86 54 L86 60 Q60 54 34 60 Z" fill="#1a1a1a"/>
  <path d="M44 50 L58 50 L54 58 L48 58 Z" fill="#f2d4b3"/>
  <path d="M62 50 L76 50 L72 58 L66 58 Z" fill="#f2d4b3"/>`,
  darthVader: () => `
  <path d="M28 42 Q28 18 60 16 Q92 18 92 42 L86 82 Q60 74 34 82 Z" fill="#1a1a1a"/>
  <path d="M40 46 L80 46 L72 66 L48 66 Z" fill="#2a2a2a"/>
  <circle cx="50" cy="54" r="4" fill="#6a8c4a"/>
  <circle cx="70" cy="54" r="4" fill="#6a8c4a"/>
  <rect x="54" y="56" width="12" height="4" fill="#c92e2e"/>`,
  spidermanMask: () => `
  <circle cx="60" cy="54" r="22" fill="#c92e2e"/>
  <g stroke="#1a3a7a" stroke-width="0.8" fill="none">
    <path d="M40 54 L80 54"/>
    <path d="M60 32 L60 76"/>
    <path d="M44 40 L76 68"/>
    <path d="M76 40 L44 68"/>
  </g>
  <path d="M40 50 Q48 44 54 50 L54 58 Q48 60 40 56 Z" fill="#f0ebe2"/>
  <path d="M80 50 Q72 44 66 50 L66 58 Q72 60 80 56 Z" fill="#f0ebe2"/>`,
  ironManMask: () => `
  <path d="M36 34 L84 34 L86 58 L78 68 L42 68 L34 58 Z" fill="#c92e2e"/>
  <path d="M42 54 L52 54 L50 58 L44 58 Z" fill="#f4e6a8"/>
  <path d="M68 54 L78 54 L76 58 L70 58 Z" fill="#f4e6a8"/>
  <rect x="52" y="62" width="16" height="3" fill="#f4e6a8"/>`,
  capAmericaHelmet: () => `
  <path d="M36 44 Q36 22 60 22 Q84 22 84 44 Z" fill="#3a6ac2"/>
  <rect x="32" y="42" width="56" height="4" fill="#3a6ac2"/>
  <path d="M60 26 L63 32 L69 33 L64 37 L66 43 L60 40 L54 43 L56 37 L51 33 L57 32 Z" fill="#f0ebe2"/>`,
  wonderWomanTiara: () => `
  <path d="M38 40 L48 32 L60 26 L72 32 L82 40 Z" fill="#f4c430"/>
  <path d="M60 30 L63 36 L69 37 L64 41 L66 47 L60 44 L54 47 L56 41 L51 37 L57 36 Z" fill="#c92e2e"/>`,
  jokerHair: () => `
  <path d="M30 60 Q22 30 44 20 Q60 12 76 20 Q98 30 90 60 Q82 44 72 46 Q64 36 56 46 Q46 44 30 60 Z" fill="#4a7a3a"/>`,
  mickeyEars: () => `
  <circle cx="38" cy="34" r="12" fill="#1a1a1a"/>
  <circle cx="82" cy="34" r="12" fill="#1a1a1a"/>
  <circle cx="60" cy="54" r="22" fill="#1a1a1a"/>
  <circle cx="60" cy="54" r="18" fill="#f0ebe2"/>`,
  minnieEarsBow: () => `
  <circle cx="38" cy="34" r="12" fill="#1a1a1a"/>
  <circle cx="82" cy="34" r="12" fill="#1a1a1a"/>
  <circle cx="60" cy="54" r="22" fill="#1a1a1a"/>
  <circle cx="60" cy="54" r="18" fill="#f0ebe2"/>
  <path d="M46 22 L60 30 L74 22 L74 36 L60 32 L46 36 Z" fill="#c92e2e"/>
  <circle cx="60" cy="30" r="3" fill="#c92e2e"/>`,
  donaldSailor: () => `
  <path d="M36 42 L84 42 L82 32 L38 32 Z" fill="#f0ebe2"/>
  <rect x="36" y="42" width="48" height="4" fill="#3a6ac2"/>
  <path d="M58 32 L62 32 L62 28 L58 28 Z" fill="#3a6ac2"/>`,
  uncleSam: () => `
  <rect x="38" y="8" width="44" height="26" fill="#c92e2e"/>
  <rect x="38" y="12" width="44" height="3" fill="#f0ebe2"/>
  <rect x="38" y="20" width="44" height="3" fill="#f0ebe2"/>
  <rect x="38" y="28" width="44" height="3" fill="#f0ebe2"/>
  <rect x="36" y="34" width="48" height="5" fill="#f0ebe2"/>
  <rect x="38" y="10" width="44" height="8" fill="#3a4aa2"/>
  <circle cx="46" cy="14" r="1" fill="#f0ebe2"/>
  <circle cx="54" cy="14" r="1" fill="#f0ebe2"/>
  <circle cx="62" cy="14" r="1" fill="#f0ebe2"/>
  <circle cx="70" cy="14" r="1" fill="#f0ebe2"/>`,
  indiana: () => `
  <path d="M26 42 Q40 22 60 20 Q80 22 94 42 Z" fill="#8a5a2a"/>
  <rect x="28" y="38" width="64" height="6" fill="#8a5a2a"/>
  <rect x="36" y="36" width="48" height="3" fill="#3a2818"/>`,
  halo: () => `
  <ellipse cx="60" cy="22" rx="18" ry="4" fill="none" stroke="#f4e6a8" stroke-width="3"/>`,
  devilHorns: (c = "#8a2a2a") => `
  <path d="M40 34 L36 20 L48 30 Z" fill="${c}"/>
  <path d="M80 34 L84 20 L72 30 Z" fill="${c}"/>`,
  reaperHood: () => `
  <path d="M26 78 Q20 28 60 20 Q100 28 94 78 Q94 58 78 56 L42 56 Q26 58 26 78 Z" fill="#1a1a1a"/>`,
  mummyWrap: () => `
  <rect x="34" y="34" width="52" height="4" fill="#e4dccc"/>
  <rect x="38" y="40" width="44" height="3" fill="#e4dccc"/>
  <rect x="32" y="46" width="56" height="4" fill="#e4dccc"/>
  <rect x="40" y="52" width="40" height="3" fill="#e4dccc"/>
  <rect x="36" y="58" width="48" height="4" fill="#e4dccc"/>
  <rect x="44" y="64" width="32" height="3" fill="#e4dccc"/>
  <rect x="40" y="70" width="36" height="3" fill="#e4dccc"/>`,
  headband: (c) => `<rect x="36" y="42" width="48" height="5" fill="${c}"/>`,
  pillbox: (c = "#d88cb0") => `
  <rect x="40" y="28" width="40" height="14" fill="${c}"/>`,
  mortarboard: () => `
  <rect x="32" y="36" width="56" height="4" fill="#1a1a1a"/>
  <rect x="40" y="28" width="40" height="12" fill="#1a1a1a"/>
  <line x1="70" y1="32" x2="88" y2="24" stroke="#f4c430" stroke-width="2"/>
  <circle cx="88" cy="24" r="3" fill="#f4c430"/>`,
  fez: (c = "#8a2a2a") => `
  <path d="M44 36 L76 36 L78 18 L42 18 Z" fill="${c}"/>
  <rect x="42" y="36" width="36" height="4" fill="${c}"/>
  <line x1="60" y1="18" x2="72" y2="8" stroke="#1a1a1a" stroke-width="2"/>`,
  cleoHeaddress: () => `
  <rect x="32" y="30" width="56" height="6" fill="#f4c430"/>
  <path d="M34 36 Q60 50 86 36" fill="#1a1a1a" opacity="0.3"/>
  <circle cx="60" cy="30" r="5" fill="#f4c430"/>
  <path d="M60 24 L58 32 L62 32 Z" fill="#3a6ac2"/>`,
};

// ─── Glasses ──────────────────────────────────────────────────────────
const glasses = {
  round: (stroke = "#1a1a1a") => `
  <circle cx="50" cy="54" r="6" fill="none" stroke="${stroke}" stroke-width="2"/>
  <circle cx="70" cy="54" r="6" fill="none" stroke="${stroke}" stroke-width="2"/>
  <line x1="56" y1="54" x2="64" y2="54" stroke="${stroke}" stroke-width="2"/>`,
  rect: (stroke = "#1a1a1a") => `
  <rect x="42" y="50" width="14" height="8" fill="none" stroke="${stroke}" stroke-width="2" rx="1"/>
  <rect x="64" y="50" width="14" height="8" fill="none" stroke="${stroke}" stroke-width="2" rx="1"/>
  <line x1="56" y1="54" x2="64" y2="54" stroke="${stroke}" stroke-width="2"/>`,
  halfmoon: (stroke = "#1a1a1a") => `
  <path d="M42 54 Q50 62 58 54" fill="none" stroke="${stroke}" stroke-width="2"/>
  <path d="M62 54 Q70 62 78 54" fill="none" stroke="${stroke}" stroke-width="2"/>
  <line x1="58" y1="54" x2="62" y2="54" stroke="${stroke}" stroke-width="2"/>`,
  sun: () => `
  <rect x="40" y="48" width="16" height="10" fill="#1a1a1a" rx="2"/>
  <rect x="64" y="48" width="16" height="10" fill="#1a1a1a" rx="2"/>
  <rect x="56" y="52" width="8" height="2" fill="#1a1a1a"/>`,
  aviator: () => `
  <path d="M42 52 Q42 60 50 60 Q58 60 58 52 Q58 48 50 48 Q42 48 42 52 Z" fill="#1a1a1a" opacity="0.85"/>
  <path d="M62 52 Q62 60 70 60 Q78 60 78 52 Q78 48 70 48 Q62 48 62 52 Z" fill="#1a1a1a" opacity="0.85"/>
  <line x1="58" y1="54" x2="62" y2="54" stroke="#c4c4c4" stroke-width="1"/>`,
};

// ─── Facial hair ──────────────────────────────────────────────────────
const beard = {
  toothbrush: (c = "#2a1d14") =>
    `<rect x="56" y="60" width="8" height="4" fill="${c}"/>`,
  mustacheWide: (c = "#2a1d14") =>
    `<path d="M44 60 Q50 66 60 62 Q70 66 76 60 Q70 64 60 64 Q50 64 44 60 Z" fill="${c}"/>`,
  mustacheHandlebar: (c = "#2a1d14") => `
  <path d="M40 62 Q46 54 52 60 L52 64 Q46 64 40 62 Z" fill="${c}"/>
  <path d="M80 62 Q74 54 68 60 L68 64 Q74 64 80 62 Z" fill="${c}"/>
  <rect x="52" y="60" width="16" height="4" fill="${c}"/>`,
  mustacheDali: (c = "#2a1d14") => `
  <path d="M40 60 Q46 42 52 52 Q54 60 52 62 L50 62 Q50 52 44 56 Z" fill="${c}"/>
  <path d="M80 60 Q74 42 68 52 Q66 60 68 62 L70 62 Q70 52 76 56 Z" fill="${c}"/>
  <rect x="50" y="60" width="20" height="3" fill="${c}"/>`,
  full: (c = "#2a1d14") =>
    `<path d="M40 58 Q40 76 60 76 Q80 76 80 58 Q80 68 60 70 Q40 68 40 58 Z" fill="${c}"/>`,
  fullLong: (c = "#2a1d14") =>
    `<path d="M40 58 Q40 92 60 96 Q80 92 80 58 Q80 70 60 72 Q40 70 40 58 Z" fill="${c}"/>`,
  wizardBeard: (c = "#f0ebe2") =>
    `<path d="M40 58 Q40 94 60 106 Q80 94 80 58 Q80 68 60 70 Q40 68 40 58 Z" fill="${c}"/>`,
  chin: (c = "#2a1d14") =>
    `<path d="M48 64 Q60 80 72 64 Q70 74 60 78 Q50 74 48 64 Z" fill="${c}"/>`,
  goatee: (c = "#2a1d14") =>
    `<path d="M54 64 L66 64 L62 74 L58 74 Z" fill="${c}"/>`,
  vanDyke: (c = "#2a1d14") => `
  <path d="M44 60 Q50 66 60 62 Q70 66 76 60 Q70 64 60 64 Q50 64 44 60 Z" fill="${c}"/>
  <path d="M54 66 L66 66 L60 78 Z" fill="${c}"/>`,
  stubble: (c = "#2a1d14") =>
    `<path d="M40 64 Q40 72 60 72 Q80 72 80 64 Q80 70 60 70 Q40 70 40 64 Z" fill="${c}" opacity="0.3"/>`,
  sideburns: (c = "#2a1d14") => `
  <rect x="37" y="48" width="5" height="20" fill="${c}"/>
  <rect x="78" y="48" width="5" height="20" fill="${c}"/>`,
};

// ─── Overlays ─────────────────────────────────────────────────────────
const mark = {
  lightningScar: () =>
    `<path d="M46 40 L49 44 L46 46 L50 52" stroke="#b33a3a" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  diagonalScar: () =>
    `<line x1="46" y1="46" x2="54" y2="58" stroke="#a8584a" stroke-width="1.5"/>`,
  noNoseSlits: () => `
  <path d="M56 52 L58 58" stroke="#1a1a1a" stroke-width="1.5"/>
  <path d="M62 52 L64 58" stroke="#1a1a1a" stroke-width="1.5"/>`,
  beautyMark: (side = "left") => {
    const x = side === "left" ? 46 : 74;
    return `<circle cx="${x}" cy="62" r="1.4" fill="#3a2818"/>`;
  },
  redLips: () =>
    `<path d="M52 64 Q60 68 68 64 Q60 66 52 64 Z" fill="#c92e2e"/>`,
  unibrow: () =>
    `<path d="M44 46 Q60 42 76 46 Q60 44 44 46 Z" fill="#2a1d14"/>`,
  pointyEars: (skin) => `
  <path d="M36 48 L34 38 L44 52 Z" fill="${skin}"/>
  <path d="M84 48 L86 38 L76 52 Z" fill="${skin}"/>`,
  cheekBlush: () => `
  <circle cx="44" cy="62" r="3.5" fill="#f4a0a0" opacity="0.85"/>
  <circle cx="76" cy="62" r="3.5" fill="#f4a0a0" opacity="0.85"/>`,
  redNose: () => `<circle cx="60" cy="58" r="4" fill="#c92e2e"/>`,
  flowersInHair: (c = "#c92e2e") => `
  <g transform="translate(34 28)">
    <circle cx="0" cy="-4" r="3" fill="${c}"/>
    <circle cx="4" cy="0" r="3" fill="${c}"/>
    <circle cx="0" cy="4" r="3" fill="${c}"/>
    <circle cx="-4" cy="0" r="3" fill="${c}"/>
    <circle cx="0" cy="0" r="2" fill="#f4e6a8"/>
  </g>
  <g transform="translate(86 28)">
    <circle cx="0" cy="-4" r="3" fill="${c}"/>
    <circle cx="4" cy="0" r="3" fill="${c}"/>
    <circle cx="0" cy="4" r="3" fill="${c}"/>
    <circle cx="-4" cy="0" r="3" fill="${c}"/>
    <circle cx="0" cy="0" r="2" fill="#f4e6a8"/>
  </g>`,
  featherInHair: () => `
  <path d="M34 22 L42 8 L44 26 Z" fill="#c92e2e"/>
  <path d="M36 22 L40 12" stroke="#2a1d14" stroke-width="0.8"/>`,
  eyeshadowBlue: () => `
  <rect x="44" y="48" width="10" height="3" fill="#3a6ac2" opacity="0.7"/>
  <rect x="66" y="48" width="10" height="3" fill="#3a6ac2" opacity="0.7"/>`,
  bowieBolt: () => `
  <path d="M48 38 L56 50 L52 54 L60 70 L62 58 L58 54 L64 38 Z" fill="#c92e2e"/>`,
  fangs: () => `
  <path d="M55 60 L57 68 L59 60 Z" fill="#f0ebe2"/>
  <path d="M61 60 L63 68 L65 60 Z" fill="#f0ebe2"/>`,
  frankensteinBolts: () => `
  <rect x="32" y="58" width="6" height="4" fill="#6a7a7a"/>
  <rect x="30" y="56" width="2" height="8" fill="#6a7a7a"/>
  <rect x="82" y="58" width="6" height="4" fill="#6a7a7a"/>
  <rect x="88" y="56" width="2" height="8" fill="#6a7a7a"/>`,
  eyepatch: () => `
  <path d="M42 48 Q50 44 58 48 L58 58 L42 58 Z" fill="#1a1a1a"/>
  <line x1="34" y1="44" x2="64" y2="50" stroke="#1a1a1a" stroke-width="1.2"/>`,
  clownRedNose: () => `<circle cx="60" cy="60" r="5" fill="#c92e2e"/>`,
  faceTat: () => `
  <path d="M42 44 L45 48 L50 48 L46 52 L48 58 L42 55 L36 58 L38 52 L34 48 L39 48 Z" fill="#1a1a1a" opacity="0.75"/>`,
  webLines: () => `
  <g stroke="#1a1a1a" stroke-width="0.6" fill="none" opacity="0.4">
    <path d="M40 42 L42 46 L44 42"/>
    <path d="M76 42 L78 46 L80 42"/>
  </g>`,
  chestSymbol: (glyph, color = "#f4c430") => {
    // Draw a small symbol on the shirt area
    const pos = { x: 60, y: 106 };
    if (glyph === "S") {
      return `<text x="${pos.x}" y="${pos.y}" font-family="Arial" font-size="14" font-weight="bold" fill="${color}" text-anchor="middle">S</text>`;
    }
    if (glyph === "star") {
      return `<path d="M60 100 L63 106 L70 107 L65 112 L67 119 L60 115 L53 119 L55 112 L50 107 L57 106 Z" fill="${color}"/>`;
    }
    return "";
  },
  waldoShirt: () => `
  <path d="M14 120 Q14 84 60 80 Q106 84 106 120 Z" fill="#c92e2e"/>
  <rect x="14" y="84" width="92" height="4" fill="#f0ebe2" opacity="0.9"/>
  <rect x="14" y="92" width="92" height="4" fill="#f0ebe2" opacity="0.9"/>
  <rect x="14" y="100" width="92" height="4" fill="#f0ebe2" opacity="0.9"/>
  <rect x="14" y="108" width="92" height="4" fill="#f0ebe2" opacity="0.9"/>
  <rect x="14" y="116" width="92" height="4" fill="#f0ebe2" opacity="0.9"/>`,
  whiteCollar: () => `<path d="M46 86 L54 84 L60 96 L66 84 L74 86 L68 98 L52 98 Z" fill="#f0ebe2"/>`,
  ruffCollar: () => `<path d="M30 84 Q60 74 90 84 Q90 92 60 88 Q30 92 30 84 Z" fill="#f0ebe2"/>`,
  necktie: (c = "#c92e2e") => `
  <path d="M58 82 L62 82 L64 88 L62 108 L58 108 L56 88 Z" fill="${c}"/>`,
  pearlChoker: () => `
  <g fill="#f0ebe2">
    <circle cx="48" cy="84" r="2"/>
    <circle cx="54" cy="82" r="2"/>
    <circle cx="60" cy="82" r="2"/>
    <circle cx="66" cy="82" r="2"/>
    <circle cx="72" cy="84" r="2"/>
  </g>`,
  feather: () => `
  <path d="M28 26 Q40 16 50 30 Q40 28 28 26 Z" fill="#6b8070"/>`,
  cigar: () => `
  <rect x="60" y="62" width="18" height="3" fill="#6b3f1f"/>
  <rect x="76" y="62" width="3" height="3" fill="#c24232"/>`,
  whiteGlove: () => `
  <rect x="94" y="90" width="12" height="10" rx="3" fill="#f0ebe2"/>
  <line x1="96" y1="94" x2="96" y2="100" stroke="#c4c4c4" stroke-width="0.5"/>`,
  sequinGlove: () => `
  <rect x="94" y="90" width="12" height="10" rx="3" fill="#f0ebe2"/>
  <g fill="#f4e6a8"><circle cx="96" cy="93" r="0.8"/><circle cx="100" cy="93" r="0.8"/><circle cx="104" cy="93" r="0.8"/><circle cx="98" cy="96" r="0.8"/><circle cx="102" cy="96" r="0.8"/><circle cx="100" cy="99" r="0.8"/></g>`,
};

// ─── Assemble ────────────────────────────────────────────────────────
function svg(parts) {
  return parts.filter(Boolean).join("\n  ") + "\n</svg>\n";
}

// Each entry: { id, label, bg, shirt, skin, layers: [...] }
// Layers render in order; later layers overlay earlier.
const FIGURES = [
  // ── Real people ────────────────────────────────────────────────────
  { id: "einstein", label: "Relativity Rebel",
    bg: BG.cream, shirt: SHIRT.grey, skin: SKIN.light,
    layers: [hair.wildEinstein(HAIR.white), beard.mustacheWide(HAIR.white)] },
  { id: "lincoln", label: "Rail Splitter",
    bg: BG.linen, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hat.topHat("#1a1a1a"), beard.chin(HAIR.black)] },
  { id: "marilyn", label: "Silver Screen Siren",
    bg: BG.rose, shirt: SHIRT.white, skin: SKIN.light,
    layers: [hair.wavy(HAIR.platinum), mark.beautyMark("left"), mark.redLips()] },
  { id: "elvis", label: "King of Rock",
    bg: BG.gold, shirt: SHIRT.white, skin: SKIN.light,
    layers: [hair.pompadour(HAIR.black), beard.sideburns(HAIR.black)] },
  { id: "frida", label: "Painter of Pain",
    bg: BG.rose, shirt: SHIRT.purple, skin: SKIN.tan,
    layers: [hair.topBun(HAIR.black), mark.flowersInHair("#c92e2e"), mark.unibrow()] },
  { id: "chaplin", label: "Silent Tramp",
    bg: BG.sand, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hat.bowler(), beard.toothbrush()] },
  { id: "lennon", label: "Round-Specs Rocker",
    bg: BG.mint, shirt: SHIRT.white, skin: SKIN.light,
    layers: [hair.long(HAIR.chestnut), glasses.round()] },
  { id: "bowie", label: "Starman",
    bg: BG.dusk, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.mullet(HAIR.red), mark.bowieBolt()] },
  { id: "che", label: "Revolution Icon",
    bg: BG.oat, shirt: SHIRT.olive, skin: SKIN.peach,
    layers: [hair.long(HAIR.blackSoft), hat.beret("#1a1a1a", "#c92e2e"), beard.stubble()] },
  { id: "napoleon", label: "Little Emperor",
    bg: BG.linen, shirt: SHIRT.blue, skin: SKIN.light,
    layers: [hat.bicorne(), mark.necktie("#f0ebe2")] },
  { id: "gandhi", label: "Peaceful Walker",
    bg: BG.linen, shirt: SHIRT.white, skin: SKIN.medium,
    layers: [hair.baldHint(HAIR.grey), glasses.round()] },
  { id: "mlk", label: "Dream Keeper",
    bg: BG.sand, shirt: SHIRT.black, skin: SKIN.brown,
    layers: [hair.shortNeat(HAIR.black), beard.mustacheWide(HAIR.black), mark.necktie("#c92e2e")] },
  { id: "malcolmx", label: "By Any Means",
    bg: BG.sand, shirt: SHIRT.black, skin: SKIN.brown,
    layers: [hair.shortNeat(HAIR.black), glasses.rect(), beard.stubble()] },
  { id: "churchill", label: "Bulldog PM",
    bg: BG.linen, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.baldHint(HAIR.grey), mark.cigar()] },
  { id: "dali", label: "Surreal Mustache",
    bg: BG.cream, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.shortNeat(HAIR.black), beard.mustacheDali()] },
  { id: "cleopatra", label: "Nile Queen",
    bg: BG.gold, shirt: SHIRT.white, skin: SKIN.tan,
    layers: [hair.bob(HAIR.black), hat.cleoHeaddress(), mark.eyeshadowBlue()] },
  { id: "twain", label: "White-Haired Wit",
    bg: BG.sand, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.wildEinstein(HAIR.white), beard.mustacheWide(HAIR.white)] },
  { id: "davinci", label: "Renaissance Polymath",
    bg: BG.taupe, shirt: SHIRT.brown, skin: SKIN.peach,
    layers: [hair.long(HAIR.white), beard.fullLong(HAIR.white), hat.fez("#8a5a2a")] },
  { id: "bobross", label: "Happy Trees",
    bg: BG.mint, shirt: SHIRT.white, skin: SKIN.light,
    layers: [hair.bigFro(HAIR.brown), beard.full(HAIR.brown)] },
  { id: "marley", label: "Reggae Lion",
    bg: BG.mint, shirt: SHIRT.yellow, skin: SKIN.brown,
    layers: [hair.dreads(HAIR.blackSoft), hat.beanie("#4a7a3a", "#c92e2e"), beard.goatee()] },
  { id: "snoop", label: "West Coast Icon",
    bg: BG.dusk, shirt: SHIRT.blue, skin: SKIN.brown,
    layers: [hair.cornrowBraids(HAIR.black), hat.bandana("#3a6ac2")] },
  { id: "hendrix", label: "Guitar God",
    bg: BG.rose, shirt: SHIRT.purple, skin: SKIN.brown,
    layers: [hair.afro(HAIR.black), hat.headband("#c92e2e")] },
  { id: "prince", label: "Purple Prodigy",
    bg: BG.dusk, shirt: SHIRT.purple, skin: SKIN.medium,
    layers: [hair.curly(HAIR.black), beard.mustacheWide(HAIR.black)] },
  { id: "mercury", label: "Bohemian Crooner",
    bg: BG.gold, shirt: SHIRT.white, skin: SKIN.peach,
    layers: [hair.shortNeat(HAIR.black), beard.mustacheHandlebar(), hat.crown("#f4c430")] },
  { id: "madonna", label: "Material Girl",
    bg: BG.rose, shirt: SHIRT.pink, skin: SKIN.light,
    layers: [hair.curly(HAIR.platinum), mark.beautyMark("right"), mark.redLips()] },
  { id: "mj", label: "Moonwalker",
    bg: BG.sky, shirt: SHIRT.black, skin: SKIN.medium,
    layers: [hair.curly(HAIR.black), hat.fedora("#1a1a1a", "#c4c4c4"), mark.sequinGlove()] },
  { id: "hepburn", label: "Breakfast Icon",
    bg: BG.cream, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.bob(HAIR.black), mark.pearlChoker()] },
  { id: "jobs", label: "Fruit Visionary",
    bg: BG.linen, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.baldHint(HAIR.grey), glasses.round(), beard.stubble()] },
  { id: "darwin", label: "Origin Theorist",
    bg: BG.sand, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.baldHint(HAIR.grey), beard.wizardBeard(HAIR.white)] },
  { id: "shakespeare", label: "Bard of Avon",
    bg: BG.taupe, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.franklinMale(HAIR.chestnut), beard.goatee(HAIR.chestnut), mark.ruffCollar()] },
  { id: "beethoven", label: "Moonlight Composer",
    bg: BG.linen, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.wildEinstein(HAIR.grey), mark.whiteCollar()] },
  { id: "queen-eliz", label: "Longest Reign",
    bg: BG.rose, shirt: SHIRT.lavender, skin: SKIN.light,
    layers: [hair.wavy(HAIR.silver), hat.crown("#f4c430")] },
  { id: "jfk", label: "Ask Not",
    bg: BG.sky, shirt: SHIRT.navy, skin: SKIN.light,
    layers: [hair.sideSwoop(HAIR.chestnut), mark.necktie("#c92e2e")] },
  { id: "obama", label: "Yes We Can",
    bg: BG.sky, shirt: SHIRT.navy, skin: SKIN.medium,
    layers: [hair.shortNeat(HAIR.black), mark.necktie("#c92e2e")] },
  { id: "trump", label: "Tower Builder",
    bg: BG.sand, shirt: SHIRT.navy, skin: SKIN.peach,
    layers: [hair.sideSwoop(HAIR.ginger), mark.necktie("#c92e2e")] },
  { id: "fidel", label: "Havana Chief",
    bg: BG.sage, shirt: SHIRT.olive, skin: SKIN.peach,
    layers: [hair.shortNeat(HAIR.blackSoft), hat.baseball("#4a5a3a"), beard.full(HAIR.blackSoft), mark.cigar()] },
  { id: "mozart", label: "Powdered Genius",
    bg: BG.rose, shirt: SHIRT.red, skin: SKIN.light,
    layers: [hair.curly(HAIR.white), mark.ruffCollar()] },
  { id: "tupac", label: "Thug Angel",
    bg: BG.dusk, shirt: SHIRT.black, skin: SKIN.brown,
    layers: [hair.baldHint(HAIR.black), hat.bandana("#1a1a1a")] },
  { id: "biggie", label: "Brooklyn King",
    bg: BG.night, shirt: SHIRT.black, skin: SKIN.deep,
    layers: [hair.shortNeat(HAIR.black), hat.crown("#f4c430"), glasses.sun()] },
  { id: "dolly", label: "Country Queen",
    bg: BG.rose, shirt: SHIRT.pink, skin: SKIN.light,
    layers: [hair.dolly(HAIR.platinum), mark.redLips()] },
  { id: "gaga", label: "Pop Provocateur",
    bg: BG.dusk, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.long(HAIR.platinum), glasses.sun()] },
  { id: "beyonce", label: "Queen Bey",
    bg: BG.gold, shirt: SHIRT.white, skin: SKIN.medium,
    layers: [hair.veryLong(HAIR.honey)] },
  { id: "bruce-lee", label: "Dragon Fighter",
    bg: BG.gold, shirt: SHIRT.yellow, skin: SKIN.peach,
    layers: [hair.bowlCut(HAIR.black)] },
  { id: "walt", label: "Mouse Maker",
    bg: BG.sky, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.sideSwoop(HAIR.chestnut), beard.mustacheWide(HAIR.chestnut), mark.necktie("#c92e2e")] },
  { id: "keith", label: "Rolling Survivor",
    bg: BG.taupe, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.mullet(HAIR.blackSoft), hat.bandana("#c92e2e"), beard.stubble()] },
  { id: "winehouse", label: "Valerie Vocalist",
    bg: BG.rose, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.beehive(HAIR.black), mark.eyeshadowBlue(), mark.redLips()] },
  { id: "cobain", label: "Nirvana Soul",
    bg: BG.mint, shirt: SHIRT.red, skin: SKIN.light,
    layers: [hair.long(HAIR.honey), glasses.sun(), beard.stubble(HAIR.honey)] },
  { id: "willie", label: "Red Headed Stranger",
    bg: BG.oat, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hair.cornrowBraids(HAIR.white), hat.bandana("#c92e2e"), beard.full(HAIR.white)] },
  { id: "douglass", label: "Abolitionist Voice",
    bg: BG.sand, shirt: SHIRT.black, skin: SKIN.brown,
    layers: [hair.wildEinstein(HAIR.grey), beard.full(HAIR.grey), mark.necktie("#c92e2e")] },
  { id: "franklin", label: "Kite Flyer",
    bg: BG.linen, shirt: SHIRT.navy, skin: SKIN.light,
    layers: [hair.franklinMale(HAIR.grey), glasses.halfmoon()] },

  // ── Fictional characters ───────────────────────────────────────────
  { id: "potter", label: "Lightning Scholar",
    bg: BG.cream, shirt: SHIRT.red, skin: SKIN.light,
    layers: [hair.messy(HAIR.black), glasses.round(), mark.lightningScar()] },
  { id: "hermione", label: "Bookish Bushy",
    bg: BG.cream, shirt: SHIRT.red, skin: SKIN.light,
    layers: [hair.bigFro(HAIR.chestnut)] },
  { id: "dumbledore", label: "Half-Moon Headmaster",
    bg: BG.dusk, shirt: SHIRT.purple, skin: SKIN.light,
    layers: [hat.pointyWizard("#6b4a8a"), hair.long(HAIR.white), beard.wizardBeard(HAIR.white), glasses.halfmoon()] },
  { id: "voldemort", label: "He Who Shall Not Be Named",
    bg: BG.dusk, shirt: SHIRT.black, skin: SKIN.pale,
    layers: [hair.bald(), mark.noNoseSlits()] },
  { id: "snape", label: "Half-Blood Potions Master",
    bg: BG.night, shirt: SHIRT.black, skin: SKIN.pale,
    layers: [hair.long(HAIR.blackSoft)] },
  { id: "hagrid", label: "Keeper of Keys",
    bg: BG.sage, shirt: SHIRT.brown, skin: SKIN.peach,
    layers: [hair.wildEinstein(HAIR.blackSoft), beard.wizardBeard(HAIR.blackSoft)] },
  { id: "gandalf", label: "Grey Pilgrim",
    bg: BG.taupe, shirt: SHIRT.grey, skin: SKIN.light,
    layers: [hat.pointyWizard("#7a7a7a"), hair.long(HAIR.grey), beard.wizardBeard(HAIR.grey)] },
  { id: "legolas", label: "Elven Archer",
    bg: BG.sage, shirt: SHIRT.sage, skin: SKIN.light,
    layers: [mark.pointyEars(SKIN.light), hair.long(HAIR.platinum)] },
  { id: "aragorn", label: "Ranger of the North",
    bg: BG.taupe, shirt: SHIRT.brown, skin: SKIN.peach,
    layers: [hair.long(HAIR.blackSoft), beard.stubble()] },
  { id: "yoda", label: "Green Swamp Sage",
    bg: BG.sage, shirt: SHIRT.brown, skin: SKIN.mint,
    layers: [mark.pointyEars(SKIN.mint), hair.baldHint(HAIR.grey)] },
  { id: "luke", label: "Farm Boy Jedi",
    bg: BG.sand, shirt: SHIRT.white, skin: SKIN.light,
    layers: [hair.bowlCut(HAIR.blonde)] },
  { id: "leia", label: "Twin-Bun Princess",
    bg: BG.linen, shirt: SHIRT.white, skin: SKIN.light,
    layers: [hair.twinBuns(HAIR.chestnut)] },
  { id: "vader", label: "Dark Father",
    bg: BG.night, shirt: SHIRT.black, skin: SKIN.pale,
    layers: [hat.darthVader()] },
  { id: "obiwan", label: "Wise Mentor",
    bg: BG.sand, shirt: SHIRT.brown, skin: SKIN.light,
    layers: [hair.shortNeat(HAIR.chestnut), beard.full(HAIR.chestnut)] },
  { id: "chewbacca", label: "Furry Copilot",
    bg: BG.taupe, shirt: SHIRT.brown, skin: SKIN.brown,
    layers: [hair.bigFro(HAIR.chestnut), beard.fullLong(HAIR.chestnut)] },
  { id: "mario", label: "Plumber in Red",
    bg: BG.sky, shirt: SHIRT.red, skin: SKIN.peach,
    layers: [hat.baseball("#c92e2e", "M", "#f0ebe2"), beard.mustacheHandlebar()] },
  { id: "luigi", label: "Plumber in Green",
    bg: BG.sky, shirt: SHIRT.green, skin: SKIN.peach,
    layers: [hat.baseball("#4a7a3a", "L", "#f0ebe2"), beard.mustacheHandlebar()] },
  { id: "peach", label: "Mushroom Royalty",
    bg: BG.rose, shirt: SHIRT.pink, skin: SKIN.light,
    layers: [hair.veryLong(HAIR.blonde), hat.crown("#f4c430")] },
  { id: "link", label: "Hylian Hero",
    bg: BG.sage, shirt: SHIRT.green, skin: SKIN.light,
    layers: [mark.pointyEars(SKIN.light), hat.beanie("#4a7a3a"), hair.sideSwoop(HAIR.blonde)] },
  { id: "pikachu", label: "Electric Mascot",
    bg: BG.gold, shirt: SHIRT.yellow, skin: SKIN.yellow,
    layers: [mark.pointyEars(SKIN.yellow), mark.cheekBlush()] },
  { id: "homer", label: "Donut Devotee",
    bg: BG.sky, shirt: SHIRT.white, skin: SKIN.yellow,
    layers: [`<path d="M44 42 L46 28 L50 42 Z" fill="${HAIR.black}"/>`, `<path d="M70 42 L72 28 L76 42 Z" fill="${HAIR.black}"/>`, hair.baldHint(HAIR.black)] },
  { id: "bart", label: "Underachiever & Proud",
    bg: BG.sky, shirt: SHIRT.red, skin: SKIN.yellow,
    layers: [hair.bartSpikes(HAIR.honey)] },
  { id: "marge", label: "Blue Tower",
    bg: BG.sky, shirt: SHIRT.green, skin: SKIN.yellow,
    layers: [hair.beehive(HAIR.dyedBlue), `<circle cx="44" cy="86" r="3" fill="#f0ebe2"/>`] },
  { id: "mickey", label: "Three-Circle Mouse",
    bg: BG.red, shirt: SHIRT.red, skin: SKIN.light,
    layers: [hat.mickeyEars()] },
  { id: "minnie", label: "Polka Dot Sweetheart",
    bg: BG.rose, shirt: SHIRT.pink, skin: SKIN.light,
    layers: [hat.minnieEarsBow()] },
  { id: "donald", label: "Sailor Fowl",
    bg: BG.sky, shirt: SHIRT.blue, skin: SKIN.yellow,
    layers: [hat.donaldSailor(), `<path d="M52 56 Q60 66 68 56 L68 62 Q60 68 52 62 Z" fill="#e8a030"/>`] },
  { id: "snoopy", label: "Roof Dreamer",
    bg: BG.sky, shirt: SHIRT.white, skin: SKIN.pale,
    layers: [`<ellipse cx="40" cy="58" rx="10" ry="14" fill="#1a1a1a"/>`, `<circle cx="62" cy="58" r="4" fill="#1a1a1a"/>`] },
  { id: "scooby", label: "Meddling Mutt",
    bg: BG.sand, shirt: SHIRT.olive, skin: SKIN.medium,
    layers: [`<path d="M36 44 L30 60 L40 56 Z" fill="${HAIR.chestnut}"/>`, `<path d="M84 44 L90 60 L80 56 Z" fill="${HAIR.chestnut}"/>`, `<path d="M40 50 Q60 34 80 50 L80 60 Q60 50 40 60 Z" fill="${HAIR.chestnut}"/>`] },
  { id: "batman", label: "Caped Crusader",
    bg: BG.night, shirt: SHIRT.black, skin: SKIN.light,
    layers: [hat.batmanCowl()] },
  { id: "superman", label: "Last Son of Krypton",
    bg: BG.sky, shirt: SHIRT.blue, skin: SKIN.light,
    layers: [hair.shortNeat(HAIR.black), `<path d="M56 44 Q60 40 62 46 Q58 48 56 44 Z" fill="${HAIR.black}"/>`, mark.chestSymbol("S", "#c92e2e")] },
  { id: "spidey", label: "Friendly Neighborhood Hero",
    bg: BG.red, shirt: SHIRT.red, skin: SKIN.pale,
    layers: [hat.spidermanMask()] },
  { id: "ironman", label: "Tin Can Genius",
    bg: BG.red, shirt: SHIRT.red, skin: SKIN.gold,
    layers: [hat.ironManMask()] },
  { id: "capamerica", label: "Star Spangled Soldier",
    bg: BG.sky, shirt: SHIRT.blue, skin: SKIN.light,
    layers: [hat.capAmericaHelmet(), mark.chestSymbol("star", "#f0ebe2")] },
  { id: "thor", label: "Hammer God",
    bg: BG.dusk, shirt: SHIRT.red, skin: SKIN.light,
    layers: [hair.long(HAIR.blonde), beard.stubble(HAIR.honey)] },
  { id: "hulk", label: "Angry Green Smash",
    bg: BG.sage, shirt: SHIRT.purple, skin: SKIN.green,
    layers: [hair.shortNeat(HAIR.black)] },
  { id: "deadpool", label: "Merc with a Mouth",
    bg: BG.red, shirt: SHIRT.red, skin: SKIN.red,
    layers: [`<circle cx="60" cy="54" r="22" fill="#c92e2e"/>`, `<path d="M44 48 L56 48 L52 58 L48 58 Z" fill="#1a1a1a"/>`, `<path d="M64 48 L76 48 L72 58 L68 58 Z" fill="#1a1a1a"/>`] },
  { id: "wonderwoman", label: "Amazon Warrior",
    bg: BG.sky, shirt: SHIRT.red, skin: SKIN.light,
    layers: [hair.long(HAIR.black), hat.wonderWomanTiara()] },
  { id: "joker", label: "Clown Prince of Crime",
    bg: BG.dusk, shirt: SHIRT.purple, skin: SKIN.pale,
    layers: [hat.jokerHair(), mark.redLips()] },
  { id: "dracula", label: "Count of the Night",
    bg: BG.night, shirt: SHIRT.black, skin: SKIN.pale,
    layers: [hair.widowsPeak(HAIR.black), mark.fangs(), mark.redLips()] },
  { id: "frankenstein", label: "Monster with Bolts",
    bg: BG.sage, shirt: SHIRT.black, skin: SKIN.green,
    layers: [hair.bowlCut(HAIR.black), mark.diagonalScar(), mark.frankensteinBolts()] },
  { id: "mummy", label: "Wrapped Pharaoh",
    bg: BG.sand, shirt: SHIRT.tan, skin: SKIN.pale,
    layers: [hat.mummyWrap()] },
  { id: "werewolf", label: "Lunar Lycanthrope",
    bg: BG.night, shirt: SHIRT.brown, skin: SKIN.brown,
    layers: [hair.wildEinstein(HAIR.chestnut), beard.fullLong(HAIR.chestnut), mark.fangs(), mark.pointyEars(SKIN.brown)] },
  { id: "witch", label: "Cauldron Cackler",
    bg: BG.dusk, shirt: SHIRT.purple, skin: SKIN.green,
    layers: [hair.long(HAIR.black), hat.witchHat()] },
  { id: "reaper", label: "Soul Collector",
    bg: BG.night, shirt: SHIRT.black, skin: SKIN.pale,
    layers: [hat.reaperHood()] },
  { id: "devil", label: "Horned Trickster",
    bg: BG.red, shirt: SHIRT.red, skin: SKIN.red,
    layers: [hat.devilHorns("#8a2a2a"), hair.shortNeat(HAIR.black), beard.goatee(HAIR.black)] },
  { id: "santa", label: "Jolly Gift-Giver",
    bg: BG.red, shirt: SHIRT.red, skin: SKIN.peach,
    layers: [hat.santaHat(), beard.wizardBeard(HAIR.white), beard.mustacheWide(HAIR.white)] },
  { id: "waldo", label: "Red-and-White Hider",
    bg: BG.cream, shirt: SHIRT.red, skin: SKIN.light,
    layers: [mark.waldoShirt(), hair.shortNeat(HAIR.chestnut), hat.beanie("#c92e2e", "#f0ebe2"), glasses.round()] },
  { id: "unclesam", label: "Patriotic Pointer",
    bg: BG.sky, shirt: SHIRT.blue, skin: SKIN.light,
    layers: [hat.uncleSam(), beard.wizardBeard(HAIR.white)] },
  { id: "indiana", label: "Whip-Wielding Archaeologist",
    bg: BG.sand, shirt: SHIRT.brown, skin: SKIN.peach,
    layers: [hat.indiana(), beard.stubble()] },
  { id: "sherlock", label: "Consulting Detective",
    bg: BG.taupe, shirt: SHIRT.sage, skin: SKIN.light,
    layers: [hat.deerstalker(), hair.shortNeat(HAIR.chestnut)] },
];

// ─── Write out ───────────────────────────────────────────────────────
function build(fig) {
  const svgBase = base({ bg: fig.bg, shirt: fig.shirt, skin: fig.skin });
  const body = fig.layers.filter(Boolean).map((l) => l.trim()).join("\n  ");
  return `${svgBase}\n  ${body}\n</svg>\n`;
}

let idx = 13;
const catalog = [];
for (const fig of FIGURES) {
  const num = String(idx).padStart(2, "0");
  const file = join(outDir, `avatar-${num}.svg`);
  writeFileSync(file, build(fig));
  catalog.push({ num, id: fig.id, label: fig.label });
  idx += 1;
}

console.log(`wrote ${FIGURES.length} avatars (avatar-13.svg through avatar-${String(idx - 1).padStart(2, "0")}.svg)`);
console.log("\n// Catalog entries to paste into avatar-catalog.ts:");
for (const { num, id, label } of catalog) {
  console.log(`  { id: "avatar-${num}", file: "/agent-avatars/avatar-${num}.svg", label: "${label}", suggestedFor: [] },  // ${id}`);
}
