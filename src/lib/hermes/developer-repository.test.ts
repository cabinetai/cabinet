import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildHermesRepositoryFixtureProjection } from "./control-center-repository-fixture";
import { sanitizeHermesBrowserModel } from "./control-center-sanitizer";
import { normalizeProjectObservation, normalizeReviewObservation, normalizeWorktreeObservation, safePathIdentity, safeRepositoryIdentity } from "./developer-repository";

const observedAt = "2026-07-19T20:00:00.000Z";

test("bounds and redacts local and remote identities", () => {
  assert.equal(safePathIdentity("/Users/private-owner/projects/repository"), "repository");
  assert.equal(safePathIdentity("C:\\Users\\private-owner\\worktrees\\secondary"), "secondary");
  assert.equal(safeRepositoryIdentity("https://owner:token@example.test/org/repository.git?access_token=secret"), "repository");
  assert.equal(safeRepositoryIdentity("git@github.com:private-owner/repository.git"), "repository");
  assert.equal(safeRepositoryIdentity("file:///Users/private-owner/repository.git"), "repository");
});

test("represents a project with no repository as connected-empty association context", () => {
    const empty = normalizeProjectObservation({ sessions: [] }, "operator-os", observedAt);
    assert.equal(empty.state, "connected_empty");
    assert.equal(empty.repositoryAssociated, false);
    const active = normalizeProjectObservation({ sessions: [{ id: "s1", profile: "operator-os", cwd: "/Users/private/project", is_active: true }] }, "operator-os", observedAt);
    assert.equal(active.state, "connected_empty");
    assert.equal(active.workingDirectoryReported, true);
    assert.equal(active.repositoryAssociated, false);
});

test("deduplicates worktrees and preserves detached and multiple-current ambiguity", () => {
    const result = normalizeWorktreeObservation([
      { path: "/Users/private/main", branch: "main", current: true },
      { path: "/Users/private/main", branch: "main", current: true },
      { path: "/Users/private/review", detached: true, current: true },
    ], "/Users/private/main", observedAt);
    assert.equal(result.total, 2);
    assert.equal(result.ambiguousCurrent, true);
    assert.equal(result.current, null);
    assert.deepEqual(result.items.find((item) => item.identity === "review"), { identity: "review", current: true, main: false, branch: null, detached: true, locked: false });
});

test("keeps connected-empty, unknown, and clean distinct", () => {
  assert.equal(normalizeWorktreeObservation([], "/tmp/project", observedAt).state, "connected_empty");
  assert.equal(normalizeReviewObservation({}, {}, "/tmp/project", observedAt).clean, null);
  const clean = normalizeReviewObservation({ branch: "main", detached: false, staged: 0, unstaged: 0, untracked: 0, conflicted: 0 }, { files: [] }, "/tmp/project", observedAt);
  assert.deepEqual({ state: clean.state, clean: clean.clean, reviewAvailable: clean.reviewAvailable, reviewCount: clean.reviewCount }, { state: "success", clean: true, reviewAvailable: true, reviewCount: 0 });
});

test("normalization plus the recursive browser boundary blocks local identity and credential egress", () => {
  const project = normalizeProjectObservation({ sessions: [{
    id: "session\u0000-id",
    profile: "operator-os",
    project_name: `\u001b[31moauth_code=oauth-secret ${"x".repeat(300)}`,
    cwd: "/Users/local-user/.config/credentials.json",
    git_repo_root: "https://local-user:api-key-secret@example.test/org/safe-repo.git?token=query-secret",
  }] }, "operator-os", observedAt);
  const worktrees = normalizeWorktreeObservation([{ path: "C:\\Users\\local-user\\worktrees\\safe-tree", branch: `feature\u0007-${"b".repeat(300)}`, current: true }], "C:\\Users\\local-user\\worktrees\\safe-tree", observedAt);
  const sanitized = sanitizeHermesBrowserModel({
    project,
    worktrees,
    nested: { authorization: "Bearer authorization-secret", apiKey: "api-key-secret", error: "https://example.test/path?client_secret=query-secret" },
  });
  const serialized = JSON.stringify(sanitized);
  for (const forbidden of ["local-user", "oauth-secret", "api-key-secret", "query-secret", "authorization-secret", "/Users/", "C:\\\\Users\\\\", "\u001b", "\u0007"]) assert.equal(serialized.includes(forbidden), false);
  assert.equal(project.repository, "safe-repo");
  assert.equal(worktrees.current?.identity, "safe-tree");
  assert.equal((project.project?.length ?? 0) <= 96, true);
  assert.equal((worktrees.current?.branch?.length ?? 0) <= 96, true);
});

test("keeps exact-fixture paths from earning live credits and emits no sensitive material", () => {
    const fixture = buildHermesRepositoryFixtureProjection({ implementationRevision: "0".repeat(40) });
    const serialized = JSON.stringify(fixture);
    for (const forbidden of ["private-owner", "github_pat_secret", "oauth-secret", "fixture-secret", "Authorization: Bearer", "/Users/", "C:\\\\Users\\\\"]) assert.equal(serialized.includes(forbidden), false);
    for (const id of ["projects", "worktrees", "source-review"]) {
      const capability = fixture.capabilities.find((item) => item.id === id)!;
      assert.equal(capability.pathProof.proven, true);
      assert.equal(capability.credit.liveVisibility, false);
      assert.equal(capability.credit.liveProven, false);
    }
    assert.equal(fixture.capabilities.length, 48);
    assert.equal(new Set(fixture.capabilities.map((item) => item.id)).size, 48);
});

test("accepted Phase 2B machine evidence preserves its frozen repository observations", () => {
  const machine = JSON.parse(readFileSync(path.resolve("docs/evidence/hermes-developer-repository/acceptance-fixture-projection.json"), "utf8"));
  const fixture = buildHermesRepositoryFixtureProjection({
    implementationRevision: machine.evidenceProvenance.implementationRevision,
    artifactGeneratedAt: machine.evidenceProvenance.artifactGeneratedAt,
  });
  assert.deepEqual(machine.developerRepository, fixture.developerRepository);
  for (const id of ["projects", "worktrees", "source-review"]) {
    const machineCapability = machine.capabilities.find((item: { id: string }) => item.id === id);
    const fixtureCapability = fixture.capabilities.find((item) => item.id === id);
    assert.deepEqual(machineCapability?.evidence, fixtureCapability?.evidence);
    assert.deepEqual(machineCapability?.pathProof, fixtureCapability?.pathProof);
  }
  assert.deepEqual(machine.provenance, fixture.provenance);
});
