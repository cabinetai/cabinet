import test from "node:test";
import assert from "node:assert/strict";
import { parseSource } from "./import-source";

test("parses github: shorthand without skill", () => {
  const parsed = parseSource("github:anthropics/skills");
  assert.equal(parsed?.kind, "github");
  assert.equal(parsed?.owner, "anthropics");
  assert.equal(parsed?.repo, "skills");
  assert.equal(parsed?.skillName, undefined);
});

test("parses github: shorthand with path-style skill", () => {
  const parsed = parseSource("github:anthropics/skills/release");
  assert.equal(parsed?.kind, "github");
  assert.equal(parsed?.owner, "anthropics");
  assert.equal(parsed?.repo, "skills");
  assert.equal(parsed?.skillName, "release");
  assert.equal(parsed?.subPath, "release");
});

test("parses skills.sh URL with three segments", () => {
  const parsed = parseSource("https://skills.sh/anthropics/skills/release");
  assert.deepEqual(parsed, {
    kind: "skills_sh",
    owner: "anthropics",
    repo: "skills",
    skillName: "release",
  });
});

test("parses skills.sh URL without skill segment", () => {
  const parsed = parseSource("https://skills.sh/vercel-labs/skills");
  assert.equal(parsed?.kind, "skills_sh");
  assert.equal(parsed?.owner, "vercel-labs");
  assert.equal(parsed?.repo, "skills");
  assert.equal(parsed?.skillName, undefined);
});

test("parses github.com URL with .git suffix", () => {
  const parsed = parseSource("https://github.com/shadcn-ui/ui.git");
  assert.deepEqual(parsed, {
    kind: "github",
    owner: "shadcn-ui",
    repo: "ui",
  });
});

test("parses github.com URL with /tree/<ref>/<path>", () => {
  const parsed = parseSource("https://github.com/shadcn-ui/ui/tree/main/registry");
  assert.equal(parsed?.kind, "github");
  assert.equal(parsed?.owner, "shadcn-ui");
  assert.equal(parsed?.repo, "ui");
  assert.equal(parsed?.ref, "main");
  assert.equal(parsed?.subPath, "registry");
  assert.equal(parsed?.skillName, "registry");
});

test("parses local: with absolute path", () => {
  const parsed = parseSource("local:/Users/me/skills/my-skill");
  assert.deepEqual(parsed, {
    kind: "local",
    localPath: "/Users/me/skills/my-skill",
  });
});

test("trims whitespace before parsing", () => {
  const parsed = parseSource("   github:foo/bar   ");
  assert.equal(parsed?.kind, "github");
  assert.equal(parsed?.owner, "foo");
});

test("returns null for empty input", () => {
  assert.equal(parseSource(""), null);
  assert.equal(parseSource("   "), null);
});

test("returns null for unrecognized format", () => {
  assert.equal(parseSource("not a real url"), null);
  assert.equal(parseSource("ftp://example.com/bar"), null);
  assert.equal(parseSource("https://example.com/repo"), null);
});

test("returns null for local: with empty path", () => {
  assert.equal(parseSource("local:"), null);
});

test("preserves non-https github URLs", () => {
  const parsed = parseSource("http://github.com/foo/bar");
  assert.equal(parsed?.kind, "github");
  assert.equal(parsed?.owner, "foo");
  assert.equal(parsed?.repo, "bar");
});

test("github: shorthand with @skill filter", () => {
  const parsed = parseSource("github:anthropics/skills@frontend-design");
  assert.equal(parsed?.kind, "github");
  assert.equal(parsed?.owner, "anthropics");
  assert.equal(parsed?.repo, "skills");
  assert.equal(parsed?.skillName, "frontend-design");
});

test("github: shorthand with #ref", () => {
  const parsed = parseSource("github:anthropics/skills#main");
  assert.equal(parsed?.kind, "github");
  assert.equal(parsed?.ref, "main");
  assert.equal(parsed?.skillName, undefined);
});

test("github: shorthand combining #ref and @skill", () => {
  const parsed = parseSource("github:anthropics/skills#main@release");
  assert.equal(parsed?.ref, "main");
  assert.equal(parsed?.skillName, "release");
});

test("github: shorthand with path infers last segment as skillName", () => {
  const parsed = parseSource("github:anthropics/skills/release");
  assert.equal(parsed?.kind, "github");
  assert.equal(parsed?.owner, "anthropics");
  assert.equal(parsed?.repo, "skills");
  assert.equal(parsed?.subPath, "release");
  assert.equal(parsed?.skillName, "release");
});

test("github: shorthand with multi-segment path", () => {
  const parsed = parseSource("github:owner/repo/skills/web-design");
  assert.equal(parsed?.subPath, "skills/web-design");
  assert.equal(parsed?.skillName, "web-design");
});

test("gitlab: shorthand basic", () => {
  const parsed = parseSource("gitlab:owner/repo");
  assert.equal(parsed?.kind, "gitlab");
  assert.equal(parsed?.owner, "owner");
  assert.equal(parsed?.repo, "repo");
});

test("gitlab: shorthand with subgroup", () => {
  const parsed = parseSource("gitlab:group/subgroup/repo");
  assert.equal(parsed?.kind, "gitlab");
  assert.equal(parsed?.owner, "group/subgroup");
  assert.equal(parsed?.repo, "repo");
});

test("gitlab.com URL with tree/ref/path", () => {
  const parsed = parseSource("https://gitlab.com/owner/repo/-/tree/main/skills/foo");
  assert.equal(parsed?.kind, "gitlab");
  assert.equal(parsed?.owner, "owner");
  assert.equal(parsed?.repo, "repo");
  assert.equal(parsed?.ref, "main");
  assert.equal(parsed?.skillName, "foo");
});

test("github.com URL with /tree/<ref>/<path>", () => {
  const parsed = parseSource("https://github.com/anthropics/skills/tree/main/release");
  assert.equal(parsed?.kind, "github");
  assert.equal(parsed?.ref, "main");
  assert.equal(parsed?.skillName, "release");
});
