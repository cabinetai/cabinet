// One-shot generator for /public/agent-avatars/*.svg.
// Minimal, feature-less shoulders-up portraits — picks a hair silhouette,
// a skin tone, and a shirt color from a muted earth palette.
// Re-run with `node scripts/generate-agent-avatars.mjs` if you want to
// regenerate the set; it is safe to edit the SVGs by hand afterward.

import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "agent-avatars");
mkdirSync(outDir, { recursive: true });

const PALETTE = {
  bg: [
    "#f3ede4", // warm cream
    "#ece3d6", // deeper cream
    "#e8ddd0", // sand
    "#d9d2c4", // stone
    "#e5dcce", // oatmeal
    "#eee6d9", // linen
  ],
  skin: [
    "#f2d4b3",
    "#e8b98d",
    "#d49c72",
    "#b87e56",
    "#915a3c",
    "#6b3f26",
  ],
  hair: [
    "#2a1d14",
    "#4a2f1f",
    "#6b3f1f",
    "#8a5a2a",
    "#a67c52",
    "#c9a178",
    "#6f6a62",
    "#2a2a2a",
  ],
  shirt: [
    "#8b5e3c",
    "#a67c52",
    "#6b8070",
    "#4a6b82",
    "#8a6b7d",
    "#7a6b8a",
    "#9a8855",
    "#567878",
  ],
};

// 12 distinct combinations. Each "hair" value picks a silhouette below.
const AVATARS = [
  { hair: "crop",     skin: 0, hairC: 0, shirt: 0, bg: 0 },
  { hair: "bob",      skin: 2, hairC: 1, shirt: 1, bg: 1 },
  { hair: "long",     skin: 1, hairC: 2, shirt: 2, bg: 2 },
  { hair: "bun",      skin: 3, hairC: 3, shirt: 3, bg: 0 },
  { hair: "wavy",     skin: 4, hairC: 0, shirt: 4, bg: 3 },
  { hair: "curly",    skin: 5, hairC: 7, shirt: 5, bg: 4 },
  { hair: "ponytail", skin: 1, hairC: 4, shirt: 6, bg: 1 },
  { hair: "afro",     skin: 4, hairC: 0, shirt: 7, bg: 2 },
  { hair: "bald",     skin: 2, hairC: 0, shirt: 0, bg: 5 },
  { hair: "side",     skin: 0, hairC: 5, shirt: 2, bg: 3 },
  { hair: "beanie",   skin: 3, hairC: 6, shirt: 3, bg: 4 },
  { hair: "long",     skin: 5, hairC: 0, shirt: 4, bg: 5 },
];

function hairShape(kind, hair) {
  switch (kind) {
    case "crop":
      // Short crop — skullcap arc above head.
      return `<path d="M38 52 Q60 28 82 52 Q82 44 60 36 Q38 44 38 52 Z" fill="${hair}"/>`;
    case "bob":
      // Chin-length bob — arcs past the jawline.
      return `<path d="M34 56 Q34 30 60 30 Q86 30 86 56 L86 70 Q80 56 60 56 Q40 56 34 70 Z" fill="${hair}"/>`;
    case "long":
      // Shoulder-length flowing hair — falls behind shoulders.
      return `
        <path d="M34 70 Q30 40 60 30 Q90 40 86 70 L92 100 Q60 90 28 100 Z" fill="${hair}"/>
        <path d="M40 50 Q60 34 80 50 Q80 44 60 38 Q40 44 40 50 Z" fill="${hair}"/>
      `;
    case "bun":
      // Low bun — small round above the head plus a skullcap.
      return `
        <circle cx="60" cy="28" r="8" fill="${hair}"/>
        <path d="M40 50 Q60 34 80 50 Q80 44 60 38 Q40 44 40 50 Z" fill="${hair}"/>
      `;
    case "wavy":
      // Wavy mid-length — rounded shape with a wave edge.
      return `<path d="M36 58 Q32 34 60 30 Q88 34 84 58 Q80 50 72 54 Q64 48 56 54 Q48 50 40 56 Z" fill="${hair}"/>`;
    case "curly":
      // Curly puff — cloud-like blob.
      return `
        <circle cx="44" cy="44" r="10" fill="${hair}"/>
        <circle cx="54" cy="36" r="11" fill="${hair}"/>
        <circle cx="66" cy="34" r="11" fill="${hair}"/>
        <circle cx="76" cy="42" r="10" fill="${hair}"/>
        <circle cx="72" cy="52" r="9"  fill="${hair}"/>
        <circle cx="48" cy="54" r="9"  fill="${hair}"/>
      `;
    case "ponytail":
      // Skullcap + tail behind.
      return `
        <path d="M40 50 Q60 30 80 50 Q80 42 60 34 Q40 42 40 50 Z" fill="${hair}"/>
        <path d="M80 50 Q94 60 88 84 L80 78 Q82 64 78 56 Z" fill="${hair}"/>
      `;
    case "afro":
      // Big soft cloud.
      return `
        <circle cx="60" cy="36" r="26" fill="${hair}"/>
      `;
    case "bald":
      // Nothing on top — shading stripe for subtle form.
      return `<path d="M42 44 Q60 38 78 44 L78 46 Q60 42 42 46 Z" fill="${hair}" opacity="0.25"/>`;
    case "side":
      // Side-swept fringe.
      return `<path d="M38 50 Q40 32 62 30 Q82 32 82 50 Q74 40 58 42 Q46 44 38 50 Z" fill="${hair}"/>`;
    case "beanie":
      // Slouchy beanie using shirt-warm tone (use hair slot color as the hat).
      return `
        <path d="M36 50 Q36 28 60 28 Q84 28 84 50 Z" fill="${hair}"/>
        <rect x="36" y="48" width="48" height="6" fill="${hair}" opacity="0.75"/>
      `;
    default:
      return "";
  }
}

function render({ hair, skin, hairC, shirt, bg }) {
  const bgColor = PALETTE.bg[bg];
  const skinColor = PALETTE.skin[skin];
  const hairColor = PALETTE.hair[hairC];
  const shirtColor = PALETTE.shirt[shirt];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <rect width="120" height="120" fill="${bgColor}"/>
  <path d="M14 120 Q14 84 60 80 Q106 84 106 120 Z" fill="${shirtColor}"/>
  <rect x="53" y="70" width="14" height="14" fill="${skinColor}"/>
  <circle cx="60" cy="54" r="22" fill="${skinColor}"/>
  ${hairShape(hair, hairColor)}
</svg>
`;
}

AVATARS.forEach((spec, i) => {
  const id = String(i + 1).padStart(2, "0");
  const file = join(outDir, `avatar-${id}.svg`);
  writeFileSync(file, render(spec).trim() + "\n");
  console.log("wrote", file);
});
