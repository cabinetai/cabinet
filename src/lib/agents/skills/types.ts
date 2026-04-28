/**
 * Origin of a skill — where on disk Cabinet found it, and what runtime
 * implications follow. See docs/SKILLS_PLAN.md C4 for the full origin model.
 */
export type SkillOrigin =
  | "cabinet-scoped" // <DATA_DIR>/<cabinet>/.agents/skills/<key>/
  | "cabinet-root"   // <PROJECT_ROOT>/.agents/skills/<key>/
  | "linked-repo"    // <linked>/.agents/skills/<key>/ (via .repo.yaml; read-only)
  | "system"         // ~/.claude/skills/<key>/ or ~/.agents/skills/<key>/ (host-managed; read-only)
  | "legacy-home";   // ~/.cabinet/skills/<key>/ (legacy Cabinet single-origin location; read-only)

export type TrustLevel = "markdown_only" | "assets" | "scripts_executables";

export type SkillFileKind = "skill" | "markdown" | "reference" | "script" | "asset" | "other";

export interface SkillFileInventoryEntry {
  /** Path relative to the skill bundle root. */
  path: string;
  kind: SkillFileKind;
}

/**
 * Lightweight skill metadata. Returned by `listSkills` — does NOT include the
 * full SKILL.md body (read on demand via `readSkill`).
 */
export interface SkillEntry {
  key: string;
  name: string;
  description: string | null;
  origin: SkillOrigin;
  /** Cabinet path for `cabinet-scoped`; null otherwise. */
  scope: string | null;
  /** Absolute path to the skill bundle directory. */
  path: string;
  fileInventory: SkillFileInventoryEntry[];
  trustLevel: TrustLevel;
  /** Parsed `allowed-tools` frontmatter list (comma-split, trimmed); empty when unset. */
  allowedTools: string[];
  /** Whether Cabinet permits in-app editing of this skill (false for system, linked, legacy). */
  editable: boolean;
  /**
   * When the skill came from a Claude Code plugin marketplace, identifies
   * which marketplace + plugin shipped it. Used by the UI to label these
   * separately from generic system skills. Layouts handled:
   *   ~/.claude/plugins/marketplaces/<marketplace>/skills/<skill>/
   *   ~/.claude/plugins/marketplaces/<marketplace>/plugins/<plugin>/skills/<skill>/
   *   ~/.claude/plugins/marketplaces/<marketplace>/external_plugins/<plugin>/skills/<skill>/
   */
  pluginSource?: {
    marketplace: string;
    /** Plugin name; equals marketplace when the marketplace itself ships skills directly. */
    plugin: string;
    /** Whether the plugin came from `external_plugins/` (community) vs `plugins/` (curated). */
    external?: boolean;
  };
}

/** Full skill bundle — entry metadata plus the SKILL.md body. */
export interface SkillBundle extends SkillEntry {
  /** SKILL.md body text with frontmatter stripped. */
  body: string;
}

export interface ListSkillsOptions {
  /** When set, walks `<DATA_DIR>/<cabinetPath>/.agents/skills/` for cabinet-scoped skills. */
  cabinetPath?: string;
  /** Include host-installed skills from `~/.claude/skills/` and `~/.agents/skills/`. Default: true. */
  includeSystem?: boolean;
  /** Include skills from linked repos (via `.repo.yaml`). Default: true. */
  includeLinked?: boolean;
  /**
   * Include the legacy single-origin `~/.cabinet/skills/` directory. Default: true
   * (preserved for back-compat with installations that pre-date the four-origin model).
   */
  includeLegacy?: boolean;
}
