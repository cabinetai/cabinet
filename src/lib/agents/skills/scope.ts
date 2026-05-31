import path from "path";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import { DATA_DIR, resolveContentPath } from "@/lib/storage/path-utils";

/**
 * Skill scopes are either `"root"` (or undefined) — meaning the cabinet-root
 * skills dir at `<project>/.agents/skills/` — or `"cabinet:<path>"` — meaning
 * the cabinet-scoped skills dir at `<DATA_DIR>/<path>/.agents/skills/`.
 *
 * The cabinet-scoped form takes a user-supplied `<path>` from the request
 * body. Without validation, a value like `"cabinet:../../tmp/evil"` would
 * resolve outside `DATA_DIR`. This helper resolves the path through
 * `resolveContentPath`, which enforces the `DATA_DIR` boundary (CLAUDE.md
 * rule 4: "all resolved paths must start with DATA_DIR").
 *
 * Throws on:
 *   - any scope that isn't `"root"`, undefined, or `cabinet:<path>`
 *   - any cabinet path that resolves outside `DATA_DIR`
 */
export function resolveSkillsScopeRoot(scope: string | undefined): string {
  if (!scope || scope === "root") {
    return path.join(PROJECT_ROOT, ".agents", "skills");
  }
  if (!scope.startsWith("cabinet:")) {
    throw new Error(`Invalid scope: "${scope}". Expected "root" or "cabinet:<path>".`);
  }
  const cabinet = scope.slice("cabinet:".length);
  if (!cabinet || path.isAbsolute(cabinet)) {
    throw new Error(`Invalid cabinet scope: "${scope}".`);
  }
  // resolveContentPath throws if the resolved path escapes DATA_DIR.
  const cabinetAbs = resolveContentPath(cabinet);
  return path.join(cabinetAbs, ".agents", "skills");
}

/**
 * Cabinet-relative path string for the same scope; used as the
 * `cabinetPath` argument to readSkill/listSkills.
 */
export function cabinetPathFromScope(scope: string | undefined): string | undefined {
  if (!scope || scope === "root") return undefined;
  if (!scope.startsWith("cabinet:")) return undefined;
  return scope.slice("cabinet:".length) || undefined;
}

/**
 * A skill key (folder name) must be a single kebab-case component:
 * lowercase letters / digits / hyphens, starting with a letter or digit.
 * Refuses anything containing a path separator or `..`.
 */
const SKILL_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isValidSkillKey(key: string): boolean {
  if (!key || key.length > 64) return false;
  return SKILL_KEY_PATTERN.test(key);
}

// Module-level guard: keep the constants reachable so a stray refactor
// can't silently drop the boundary checks.
void DATA_DIR;
