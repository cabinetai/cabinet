/**
 * Source-string parsing for the skill import endpoint. Extracted from the
 * route so it can be unit-tested in isolation. Mirrors the grammar accepted
 * by the open `npx skills` CLI (see Wave 12 in docs/SKILLS_PLAN.md).
 *
 * Accepted source forms:
 *   - "github:owner/repo[#ref][@skill-name]"
 *   - "github:owner/repo/path/to/skill[#ref]"
 *   - "https://github.com/owner/repo[/tree/<ref>[/path]][.git]"
 *   - "https://skills.sh/owner/repo[/skill]"
 *   - "gitlab:owner/repo[#ref][@skill-name]"
 *   - "https://gitlab.com/owner/repo[/-/tree/<ref>[/path]]"
 *   - "local:/absolute/path"
 *
 * Notes:
 *   - `@skill-name` is the CLI's "filter to a single skill" suffix; takes
 *     precedence over a path-style skill.
 *   - `#ref` selects a branch / tag / commit. Combined: `owner/repo#main@my-skill`.
 *   - The skill segment after a path-style `owner/repo/<dir>` is treated as
 *     a path inside the repo, not a skill filter — caller logic decides
 *     whether it's a single skill dir or a sub-tree.
 */

export interface ResolvedSource {
  kind: "github" | "gitlab" | "skills_sh" | "local";
  owner?: string;
  repo?: string;
  skillName?: string;
  ref?: string;
  /** Repo-relative path when the source was `owner/repo/path/to/something`. */
  subPath?: string;
  localPath?: string;
}

/**
 * Strip a `#<ref>` suffix and optional `@<skill>` from a `<repo>` segment.
 * Returns the cleaned repo + the parsed ref + skill filter.
 */
function splitRefAndFilter(input: string): {
  rest: string;
  ref?: string;
  skillName?: string;
} {
  let rest = input;
  let ref: string | undefined;
  let skillName: string | undefined;

  // Order matters: `repo#ref@skill` and `repo@skill#ref` are both legal in
  // some ecosystems. We split on whichever appears last to consume the
  // suffix, then look for the other in what remains.
  const atIdx = rest.lastIndexOf("@");
  const hashIdx = rest.lastIndexOf("#");
  if (atIdx > -1 && atIdx > hashIdx) {
    skillName = rest.slice(atIdx + 1) || undefined;
    rest = rest.slice(0, atIdx);
  }
  if (rest.includes("#")) {
    const i = rest.lastIndexOf("#");
    ref = rest.slice(i + 1) || undefined;
    rest = rest.slice(0, i);
  }
  if (!skillName && rest.includes("@")) {
    const i = rest.lastIndexOf("@");
    skillName = rest.slice(i + 1) || undefined;
    rest = rest.slice(0, i);
  }
  return { rest, ref, skillName };
}

function compact(input: ResolvedSource): ResolvedSource {
  // Strip undefined fields so deepEqual-style consumers don't see ghost keys.
  const out: ResolvedSource = { kind: input.kind };
  if (input.owner !== undefined) out.owner = input.owner;
  if (input.repo !== undefined) out.repo = input.repo;
  if (input.skillName !== undefined) out.skillName = input.skillName;
  if (input.ref !== undefined) out.ref = input.ref;
  if (input.subPath !== undefined) out.subPath = input.subPath;
  if (input.localPath !== undefined) out.localPath = input.localPath;
  return out;
}

function parseShorthand(
  raw: string,
  kind: "github" | "gitlab",
): ResolvedSource | null {
  // Form: owner/repo[/path...][#ref][@skill]
  // Split off the trailing ref/filter first so `/`-separated path segments
  // aren't confused by the `#` or `@`.
  const { rest, ref, skillName } = splitRefAndFilter(raw);
  const segments = rest.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const [owner, repo, ...pathSegs] = segments;
  // For GitLab, owner can be a group/subgroup path (`group/sub/repo`). Treat
  // everything before the last segment as the owner path.
  if (kind === "gitlab" && pathSegs.length > 0) {
    const owners = [owner, repo, ...pathSegs.slice(0, -1)].join("/");
    const realRepo = pathSegs[pathSegs.length - 1];
    return compact({ kind, owner: owners, repo: realRepo, ref, skillName });
  }
  const subPath = pathSegs.length > 0 ? pathSegs.join("/") : undefined;
  // If a path is present and no explicit @skill filter, treat the LAST
  // path segment as the skill (matches CLI behavior for `owner/repo/skill`).
  const inferredSkill = !skillName && subPath ? pathSegs[pathSegs.length - 1] : undefined;
  return compact({
    kind,
    owner,
    repo,
    ref,
    subPath,
    skillName: skillName ?? inferredSkill,
  });
}

/**
 * Strip an `npx skills add ...` (or `skills add ...`) prefix and pull a
 * `--skill <name>` flag out into a separate value. Lets users paste the
 * full install command they see on skills.sh without manual cleanup.
 */
function normalizeNpxCommand(raw: string): { source: string; flagSkill?: string } {
  let s = raw.trim();
  s = s.replace(/^(?:npx\s+)?skills\s+add\s+/i, "");
  const flagMatch = s.match(/\s+--skill[=\s]+([^\s]+)/);
  let flagSkill: string | undefined;
  if (flagMatch) {
    flagSkill = flagMatch[1];
    s = s.replace(flagMatch[0], "").trim();
  }
  return { source: s, flagSkill };
}

export function parseSource(raw: string): ResolvedSource | null {
  const { source: trimmed, flagSkill } = normalizeNpxCommand(raw);
  if (!trimmed) return null;
  // Backfill the flag's skillName when the inner parse didn't already
  // resolve one (most URL forms don't carry a skill segment).
  const result = parseSourceInner(trimmed);
  if (result && flagSkill && !result.skillName) {
    return { ...result, skillName: flagSkill };
  }
  return result;
}

function parseSourceInner(trimmed: string): ResolvedSource | null {

  // local:/path
  if (trimmed.startsWith("local:")) {
    const localPath = trimmed.slice("local:".length);
    if (!localPath) return null;
    return { kind: "local", localPath };
  }

  // skills.sh URL — owner/repo[/skill]
  const skillsShMatch = trimmed.match(
    /^https?:\/\/skills\.sh\/([^/]+)\/([^/]+)(?:\/([^/?#]+))?/,
  );
  if (skillsShMatch) {
    return {
      kind: "skills_sh",
      owner: skillsShMatch[1],
      repo: skillsShMatch[2],
      skillName: skillsShMatch[3],
    };
  }

  // GitHub URL — supports /tree/<ref>[/<path>] and a `.git` suffix.
  const ghTreeMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?\/?$/,
  );
  if (ghTreeMatch) {
    const [, owner, repo, ref, subPath] = ghTreeMatch;
    const segs = subPath ? subPath.split("/").filter(Boolean) : [];
    const skillName = segs.length > 0 ? segs[segs.length - 1] : undefined;
    return compact({ kind: "github", owner, repo, ref, subPath: subPath || undefined, skillName });
  }

  // gitlab.com URL — supports /-/tree/<ref>[/<path>]
  const glTreeMatch = trimmed.match(
    /^https?:\/\/gitlab\.com\/(.+?)(?:\.git)?(?:\/-\/tree\/([^/]+)(?:\/(.+))?)?\/?$/,
  );
  if (glTreeMatch) {
    const [, fullPath, ref, subPath] = glTreeMatch;
    const segs = fullPath.split("/").filter(Boolean);
    if (segs.length >= 2) {
      const repo = segs[segs.length - 1];
      const owner = segs.slice(0, -1).join("/");
      const sub = subPath ? subPath.split("/").filter(Boolean) : [];
      const skillName = sub.length > 0 ? sub[sub.length - 1] : undefined;
      return compact({ kind: "gitlab", owner, repo, ref, subPath: subPath || undefined, skillName });
    }
  }

  // gitlab:owner/repo[#ref][@skill]
  if (trimmed.startsWith("gitlab:")) {
    const body = trimmed.slice("gitlab:".length);
    const parsed = parseShorthand(body, "gitlab");
    if (parsed) return parsed;
  }

  // github:owner/repo[/path][#ref][@skill]
  if (trimmed.startsWith("github:")) {
    const body = trimmed.slice("github:".length);
    const parsed = parseShorthand(body, "github");
    if (parsed) return parsed;
  }

  return null;
}
