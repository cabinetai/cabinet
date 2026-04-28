// Audit #082: ~110 avatars in a single grid was overwhelming; categories
// let the picker default to a small "Silhouettes" set and tab into the
// rest only when the user wants to.
//
// Audit #083: 41 presets had labels that named copyrighted franchises
// (Harry Potter / LOTR / Star Wars / Mario / Zelda / Pokémon / Simpsons /
// Disney / Peanuts / Scooby-Doo / DC / Marvel / Indiana Jones / Sherlock /
// Waldo / Santa / Uncle Sam). Labels were rewritten to descriptive copy
// that doesn't signal the franchise — IP review is still on the table for
// the art itself, but the catalog no longer advertises the connection.
export type AvatarCategory =
  | "silhouettes"
  | "historical"
  | "musicians"
  | "fantasy"
  | "video-games"
  | "cartoons"
  | "superheroes"
  | "spooky";

export const AVATAR_CATEGORY_ORDER: AvatarCategory[] = [
  "silhouettes",
  "historical",
  "musicians",
  "fantasy",
  "video-games",
  "cartoons",
  "superheroes",
  "spooky",
];

export const AVATAR_CATEGORY_LABEL: Record<AvatarCategory, string> = {
  silhouettes: "Silhouettes",
  historical: "Historical",
  musicians: "Musicians",
  fantasy: "Fantasy",
  "video-games": "Video games",
  cartoons: "Cartoons",
  superheroes: "Superheroes",
  spooky: "Spooky",
};

export interface AvatarPreset {
  id: string;
  file: string; // path under /public
  label: string;
  /**
   * Optional explicit category. If omitted, inferred from the avatar's
   * numeric id range — see {@link getAvatarCategory}. Adding the field
   * to a specific preset wins over the range-based default.
   */
  category?: AvatarCategory;
  suggestedFor?: string[]; // agent slugs where this is a natural fit
}

/**
 * Derive the category for a preset. The avatar set ships in numeric
 * ranges that map to the categories below (`scripts/generate-*.mjs`
 * preserve this layout). Centralizing the mapping keeps the catalog
 * data flat — no need to annotate 110+ entries.
 */
export function getAvatarCategory(preset: AvatarPreset): AvatarCategory {
  if (preset.category) return preset.category;
  const num = parseInt(preset.id.replace(/^avatar-/, ""), 10);
  if (!Number.isFinite(num)) return "historical";
  if (num >= 1 && num <= 12) return "silhouettes";
  if (num >= 51 && num <= 60) return "musicians";
  if (num >= 69 && num <= 76) return "fantasy";
  if (num >= 77 && num <= 86) return "video-games";
  if (num >= 87 && num <= 90) return "cartoons";
  if (num >= 91 && num <= 100) return "superheroes";
  if (num >= 101 && num <= 107) return "spooky";
  if (num >= 108 && num <= 112) return "cartoons";
  // 13–50, 61–68: scientists, presidents, painters, headmasters, abolitionists.
  return "historical";
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  // Classic silhouettes (hair-style based, produced by scripts/generate-agent-avatars.mjs)
  { id: "avatar-01", file: "/agent-avatars/avatar-01.svg", label: "Crop",     suggestedFor: ["cto", "devops", "developer"] },
  { id: "avatar-02", file: "/agent-avatars/avatar-02.svg", label: "Bob",      suggestedFor: ["copywriter", "ux-designer"] },
  { id: "avatar-03", file: "/agent-avatars/avatar-03.svg", label: "Long",     suggestedFor: ["content-marketer", "social-media"] },
  { id: "avatar-04", file: "/agent-avatars/avatar-04.svg", label: "Bun",      suggestedFor: ["legal", "product-manager"] },
  { id: "avatar-05", file: "/agent-avatars/avatar-05.svg", label: "Wavy",     suggestedFor: ["growth-marketer", "sales"] },
  { id: "avatar-06", file: "/agent-avatars/avatar-06.svg", label: "Curly",    suggestedFor: ["researcher", "data-analyst"] },
  { id: "avatar-07", file: "/agent-avatars/avatar-07.svg", label: "Ponytail", suggestedFor: ["qa", "customer-success"] },
  { id: "avatar-08", file: "/agent-avatars/avatar-08.svg", label: "Afro",     suggestedFor: ["ceo", "coo"] },
  { id: "avatar-09", file: "/agent-avatars/avatar-09.svg", label: "Bald",     suggestedFor: ["cfo", "people-ops"] },
  { id: "avatar-10", file: "/agent-avatars/avatar-10.svg", label: "Side",     suggestedFor: ["seo", "editor"] },
  { id: "avatar-11", file: "/agent-avatars/avatar-11.svg", label: "Beanie",   suggestedFor: ["developer", "general"] },
  { id: "avatar-12", file: "/agent-avatars/avatar-12.svg", label: "Long Alt", suggestedFor: [] },

  // Famous figures — cryptic labels so folks can guess (produced by scripts/generate-famous-figures.mjs)
  { id: "avatar-13", file: "/agent-avatars/avatar-13.svg", label: "Relativity Rebel", suggestedFor: [] },
  { id: "avatar-14", file: "/agent-avatars/avatar-14.svg", label: "Rail Splitter", suggestedFor: [] },
  { id: "avatar-15", file: "/agent-avatars/avatar-15.svg", label: "Silver Screen Siren", suggestedFor: [] },
  { id: "avatar-16", file: "/agent-avatars/avatar-16.svg", label: "King of Rock", suggestedFor: [] },
  { id: "avatar-17", file: "/agent-avatars/avatar-17.svg", label: "Painter of Pain", suggestedFor: [] },
  { id: "avatar-18", file: "/agent-avatars/avatar-18.svg", label: "Silent Tramp", suggestedFor: [] },
  { id: "avatar-19", file: "/agent-avatars/avatar-19.svg", label: "Round-Specs Rocker", suggestedFor: [] },
  { id: "avatar-20", file: "/agent-avatars/avatar-20.svg", label: "Starman", suggestedFor: [] },
  { id: "avatar-21", file: "/agent-avatars/avatar-21.svg", label: "Revolution Icon", suggestedFor: [] },
  { id: "avatar-22", file: "/agent-avatars/avatar-22.svg", label: "Little Emperor", suggestedFor: [] },
  { id: "avatar-23", file: "/agent-avatars/avatar-23.svg", label: "Peaceful Walker", suggestedFor: [] },
  { id: "avatar-24", file: "/agent-avatars/avatar-24.svg", label: "Dream Keeper", suggestedFor: [] },
  { id: "avatar-25", file: "/agent-avatars/avatar-25.svg", label: "By Any Means", suggestedFor: [] },
  { id: "avatar-26", file: "/agent-avatars/avatar-26.svg", label: "Bulldog PM", suggestedFor: [] },
  { id: "avatar-27", file: "/agent-avatars/avatar-27.svg", label: "Surreal Mustache", suggestedFor: [] },
  { id: "avatar-28", file: "/agent-avatars/avatar-28.svg", label: "Nile Queen", suggestedFor: [] },
  { id: "avatar-29", file: "/agent-avatars/avatar-29.svg", label: "White-Haired Wit", suggestedFor: [] },
  { id: "avatar-30", file: "/agent-avatars/avatar-30.svg", label: "Renaissance Polymath", suggestedFor: [] },
  { id: "avatar-31", file: "/agent-avatars/avatar-31.svg", label: "Happy Trees", suggestedFor: [] },
  { id: "avatar-32", file: "/agent-avatars/avatar-32.svg", label: "Reggae Lion", suggestedFor: [] },
  { id: "avatar-33", file: "/agent-avatars/avatar-33.svg", label: "West Coast Icon", suggestedFor: [] },
  { id: "avatar-34", file: "/agent-avatars/avatar-34.svg", label: "Guitar God", suggestedFor: [] },
  { id: "avatar-35", file: "/agent-avatars/avatar-35.svg", label: "Purple Prodigy", suggestedFor: [] },
  { id: "avatar-36", file: "/agent-avatars/avatar-36.svg", label: "Bohemian Crooner", suggestedFor: [] },
  { id: "avatar-37", file: "/agent-avatars/avatar-37.svg", label: "Material Girl", suggestedFor: [] },
  { id: "avatar-38", file: "/agent-avatars/avatar-38.svg", label: "Moonwalker", suggestedFor: [] },
  { id: "avatar-39", file: "/agent-avatars/avatar-39.svg", label: "Breakfast Icon", suggestedFor: [] },
  { id: "avatar-40", file: "/agent-avatars/avatar-40.svg", label: "Fruit Visionary", suggestedFor: [] },
  { id: "avatar-41", file: "/agent-avatars/avatar-41.svg", label: "Origin Theorist", suggestedFor: [] },
  { id: "avatar-42", file: "/agent-avatars/avatar-42.svg", label: "Bard of Avon", suggestedFor: [] },
  { id: "avatar-43", file: "/agent-avatars/avatar-43.svg", label: "Moonlight Composer", suggestedFor: [] },
  { id: "avatar-44", file: "/agent-avatars/avatar-44.svg", label: "Longest Reign", suggestedFor: [] },
  { id: "avatar-45", file: "/agent-avatars/avatar-45.svg", label: "Ask Not", suggestedFor: [] },
  { id: "avatar-46", file: "/agent-avatars/avatar-46.svg", label: "Yes We Can", suggestedFor: [] },
  { id: "avatar-47", file: "/agent-avatars/avatar-47.svg", label: "Tower Builder", suggestedFor: [] },
  { id: "avatar-48", file: "/agent-avatars/avatar-48.svg", label: "Havana Chief", suggestedFor: [] },
  { id: "avatar-49", file: "/agent-avatars/avatar-49.svg", label: "Powdered Genius", suggestedFor: [] },
  { id: "avatar-50", file: "/agent-avatars/avatar-50.svg", label: "Thug Angel", suggestedFor: [] },
  { id: "avatar-51", file: "/agent-avatars/avatar-51.svg", label: "Brooklyn King", suggestedFor: [] },
  { id: "avatar-52", file: "/agent-avatars/avatar-52.svg", label: "Country Queen", suggestedFor: [] },
  { id: "avatar-53", file: "/agent-avatars/avatar-53.svg", label: "Pop Provocateur", suggestedFor: [] },
  { id: "avatar-54", file: "/agent-avatars/avatar-54.svg", label: "Queen Bey", suggestedFor: [] },
  { id: "avatar-55", file: "/agent-avatars/avatar-55.svg", label: "Dragon Fighter", suggestedFor: [] },
  { id: "avatar-56", file: "/agent-avatars/avatar-56.svg", label: "Mouse Maker", suggestedFor: [] },
  { id: "avatar-57", file: "/agent-avatars/avatar-57.svg", label: "Rolling Survivor", suggestedFor: [] },
  { id: "avatar-58", file: "/agent-avatars/avatar-58.svg", label: "Valerie Vocalist", suggestedFor: [] },
  { id: "avatar-59", file: "/agent-avatars/avatar-59.svg", label: "Nirvana Soul", suggestedFor: [] },
  { id: "avatar-60", file: "/agent-avatars/avatar-60.svg", label: "Red Headed Stranger", suggestedFor: [] },
  { id: "avatar-61", file: "/agent-avatars/avatar-61.svg", label: "Abolitionist Voice", suggestedFor: [] },
  { id: "avatar-62", file: "/agent-avatars/avatar-62.svg", label: "Kite Flyer", suggestedFor: [] },
  { id: "avatar-63", file: "/agent-avatars/avatar-63.svg", label: "Lightning Scholar", suggestedFor: [] },
  { id: "avatar-64", file: "/agent-avatars/avatar-64.svg", label: "Bookish Bushy", suggestedFor: [] },
  // Audit #083: labels below were rewritten to drop direct franchise
  // references. Art may still need IP review before launch.
  { id: "avatar-65", file: "/agent-avatars/avatar-65.svg", label: "Beard Down to Belt", suggestedFor: [] },
  { id: "avatar-66", file: "/agent-avatars/avatar-66.svg", label: "The Voldecough", suggestedFor: [] },
  { id: "avatar-67", file: "/agent-avatars/avatar-67.svg", label: "Greasy Hair Energy", suggestedFor: [] },
  { id: "avatar-68", file: "/agent-avatars/avatar-68.svg", label: "Big Beard, Bigger Heart", suggestedFor: [] },
  { id: "avatar-69", file: "/agent-avatars/avatar-69.svg", label: "Walks Everywhere", suggestedFor: [] },
  { id: "avatar-70", file: "/agent-avatars/avatar-70.svg", label: "Hair-Flip Sniper", suggestedFor: [] },
  { id: "avatar-71", file: "/agent-avatars/avatar-71.svg", label: "Mysterious Stew Lover", suggestedFor: [] },
  { id: "avatar-72", file: "/agent-avatars/avatar-72.svg", label: "Backwards Talker", suggestedFor: [] },
  { id: "avatar-73", file: "/agent-avatars/avatar-73.svg", label: "Whiny Farm Kid", suggestedFor: [] },
  { id: "avatar-74", file: "/agent-avatars/avatar-74.svg", label: "Cinnamon Roll Hairdo", suggestedFor: [] },
  { id: "avatar-75", file: "/agent-avatars/avatar-75.svg", label: "Heavy Breather", suggestedFor: [] },
  { id: "avatar-76", file: "/agent-avatars/avatar-76.svg", label: "Beardy Old Mentor", suggestedFor: [] },
  { id: "avatar-77", file: "/agent-avatars/avatar-77.svg", label: "Spiky Speedster", suggestedFor: [] },
  { id: "avatar-78", file: "/agent-avatars/avatar-78.svg", label: "The Red Pasta", suggestedFor: [] },
  { id: "avatar-79", file: "/agent-avatars/avatar-79.svg", label: "The Green Pasta", suggestedFor: [] },
  { id: "avatar-80", file: "/agent-avatars/avatar-80.svg", label: "Royal Mushroom Fan", suggestedFor: [] },
  { id: "avatar-81", file: "/agent-avatars/avatar-81.svg", label: "Pointy-Eared Adventurer", suggestedFor: [] },
  { id: "avatar-82", file: "/agent-avatars/avatar-82.svg", label: "Yellow Lightning Mouse", suggestedFor: [] },
  { id: "avatar-83", file: "/agent-avatars/avatar-83.svg", label: "Donut Lifestyle", suggestedFor: [] },
  { id: "avatar-84", file: "/agent-avatars/avatar-84.svg", label: "Spiky Hair Slacker", suggestedFor: [] },
  { id: "avatar-85", file: "/agent-avatars/avatar-85.svg", label: "Blue-Haired Smarty", suggestedFor: [] },
  { id: "avatar-86", file: "/agent-avatars/avatar-86.svg", label: "Two Big Round Ears", suggestedFor: [] },
  { id: "avatar-87", file: "/agent-avatars/avatar-87.svg", label: "Polka Dot Bow", suggestedFor: [] },
  { id: "avatar-88", file: "/agent-avatars/avatar-88.svg", label: "Sailor Hat Bird", suggestedFor: [] },
  { id: "avatar-89", file: "/agent-avatars/avatar-89.svg", label: "Tiny Tongue Out", suggestedFor: [] },
  { id: "avatar-90", file: "/agent-avatars/avatar-90.svg", label: "Always-Hungry Hound", suggestedFor: [] },
  { id: "avatar-91", file: "/agent-avatars/avatar-91.svg", label: "Brooding Cape Wearer", suggestedFor: [] },
  { id: "avatar-92", file: "/agent-avatars/avatar-92.svg", label: "Spit Curl Strongman", suggestedFor: [] },
  { id: "avatar-93", file: "/agent-avatars/avatar-93.svg", label: "Bug-Themed Acrobat", suggestedFor: [] },
  { id: "avatar-94", file: "/agent-avatars/avatar-94.svg", label: "Goatee Tech Bro", suggestedFor: [] },
  { id: "avatar-95", file: "/agent-avatars/avatar-95.svg", label: "Patriotic Frisbee Thrower", suggestedFor: [] },
  { id: "avatar-96", file: "/agent-avatars/avatar-96.svg", label: "Long Blonde Hammer Fan", suggestedFor: [] },
  { id: "avatar-97", file: "/agent-avatars/avatar-97.svg", label: "Big Green Mood", suggestedFor: [] },
  { id: "avatar-98", file: "/agent-avatars/avatar-98.svg", label: "Loudmouth in Red", suggestedFor: [] },
  { id: "avatar-99", file: "/agent-avatars/avatar-99.svg", label: "Lasso Truth-Teller", suggestedFor: [] },
  { id: "avatar-100", file: "/agent-avatars/avatar-100.svg", label: "Disheveled Clown", suggestedFor: [] },
  { id: "avatar-101", file: "/agent-avatars/avatar-101.svg", label: "Count of the Night", suggestedFor: [] },
  { id: "avatar-102", file: "/agent-avatars/avatar-102.svg", label: "Monster with Bolts", suggestedFor: [] },
  { id: "avatar-103", file: "/agent-avatars/avatar-103.svg", label: "Wrapped Pharaoh", suggestedFor: [] },
  { id: "avatar-104", file: "/agent-avatars/avatar-104.svg", label: "Lunar Lycanthrope", suggestedFor: [] },
  { id: "avatar-105", file: "/agent-avatars/avatar-105.svg", label: "Cauldron Cackler", suggestedFor: [] },
  { id: "avatar-106", file: "/agent-avatars/avatar-106.svg", label: "Soul Collector", suggestedFor: [] },
  { id: "avatar-107", file: "/agent-avatars/avatar-107.svg", label: "Horned Trickster", suggestedFor: [] },
  { id: "avatar-108", file: "/agent-avatars/avatar-108.svg", label: "Bearded Sweater Guy", suggestedFor: [] },
  { id: "avatar-109", file: "/agent-avatars/avatar-109.svg", label: "Striped Sweater Guy", suggestedFor: [] },
  { id: "avatar-110", file: "/agent-avatars/avatar-110.svg", label: "Star-Spangled Recruiter", suggestedFor: [] },
  { id: "avatar-111", file: "/agent-avatars/avatar-111.svg", label: "Hat-and-Whip Adventurer", suggestedFor: [] },
  { id: "avatar-112", file: "/agent-avatars/avatar-112.svg", label: "Hat-and-Pipe Sleuth", suggestedFor: [] },
];

export function getPresetById(id: string | undefined | null): AvatarPreset | null {
  if (!id) return null;
  return AVATAR_PRESETS.find((p) => p.id === id) ?? null;
}

// Resolves an agent's persisted `avatar` field + optional `avatarExt` into a URL.
// - If avatar matches a preset id, return its bundled SVG path.
// - If avatar === "custom", return the per-agent uploaded file path.
// - Otherwise return null (caller should fall back to icon rendering).
export function resolveAvatarUrl(
  agent: { slug: string; cabinetPath?: string; avatar?: string; avatarExt?: string }
): string | null {
  if (!agent.avatar) return null;
  const preset = getPresetById(agent.avatar);
  if (preset) return preset.file;
  if (agent.avatar === "custom" && agent.avatarExt) {
    const root = agent.cabinetPath
      ? `/api/agents/personas/${agent.slug}/avatar?ext=${agent.avatarExt}&cabinet=${encodeURIComponent(agent.cabinetPath)}`
      : `/api/agents/personas/${agent.slug}/avatar?ext=${agent.avatarExt}`;
    return root;
  }
  return null;
}
