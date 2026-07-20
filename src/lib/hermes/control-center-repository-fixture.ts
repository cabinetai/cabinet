import { buildHermesAcceptanceFixtureInput } from "./control-center-acceptance-fixture";
import { buildHermesControlCenterProjection } from "./control-center-projection";
import type { HermesCapabilityObservation, HermesControlCenterProjectionInput, HermesRawProjectionEnvelope } from "./control-center-types";
import { HERMES_EVIDENCE_CATALOG_ID, HERMES_RAW_PROJECTION_SCHEMA_VERSION } from "./control-center-types";
import { normalizeProjectObservation, normalizeReviewObservation, normalizeWorktreeObservation } from "./developer-repository";

export const HERMES_REPOSITORY_FIXTURE_ID = "hermes-phase-2b-repository-visibility-v1";
export const HERMES_REPOSITORY_FIXTURE_CAPTURED_AT = "2026-07-19T20:00:00.000Z";

type Options = { implementationRevision?: string | null; artifactGeneratedAt?: string | null };

function observations(): HermesCapabilityObservation[] {
  const base = buildHermesAcceptanceFixtureInput().observations.filter((item) => !["projects", "worktrees", "source-review"].includes(item.capabilityId));
  const installed = { installedBackendVersion: "0.18.2", installedBackendCommit: "594308d4bbe95548c9fe418bb10c449099426f93" };
  const proof = { proofKind: "exact_fixture" as const, proofScope: "exact_fixture_path" as const, ...installed };
  const project = normalizeProjectObservation({ sessions: [{ id: "session-alpha", profile_name: "operator-os", project_name: "Hermes Cabinet", cwd: "/Users/private-owner/projects/hermes-cabinet", git_repo_root: "https://owner:github_pat_secret@example.test/org/hermes-cabinet.git?access_token=oauth-secret", is_active: true }] }, "operator-os", HERMES_REPOSITORY_FIXTURE_CAPTURED_AT);
  const emptyProject = normalizeProjectObservation({ sessions: [{ id: "session-non-git", profile_name: "operator-os", project_name: "Research notes", cwd: "/Users/private-owner/notes", git_repo_root: null }] }, "operator-os", HERMES_REPOSITORY_FIXTURE_CAPTURED_AT);
  const worktrees = normalizeWorktreeObservation([
    { path: "/Users/private-owner/projects/hermes-cabinet", branch: "feat/hermes-developer-repository-visibility", isMain: true, current: true, detached: false, locked: false },
    { path: "/Users/private-owner/projects/hermes-cabinet", branch: "feat/hermes-developer-repository-visibility", isMain: true, current: true, detached: false, locked: false },
    { path: "C:\\Users\\private-owner\\worktrees\\detached-review", branch: "", detached: true, current: true, locked: false },
  ], "/Users/private-owner/projects/hermes-cabinet", HERMES_REPOSITORY_FIXTURE_CAPTURED_AT);
  const review = normalizeReviewObservation({ branch: "feat/hermes-developer-repository-visibility", detached: false, staged: 2, unstaged: 3, untracked: 1, conflicted: 0, ahead: 1, behind: 0, repository: "git@github.com:private-owner/hermes-cabinet.git" }, { files: [{ path: "/Users/private-owner/secret.ts", diff: "Authorization: Bearer fixture-secret" }] }, "/Users/private-owner/projects/hermes-cabinet", HERMES_REPOSITORY_FIXTURE_CAPTURED_AT);
  const staleAt = "2026-07-19T18:00:00.000Z";
  return [...base,
    { capabilityId: "projects", source: "Hermes session project association", interface: "/api/sessions?limit=100", observedAt: project.observedAt, assertedFreshness: "fresh", outcome: project.state, summary: project.summary, facts: { project: project.project, profile: project.profile, sessionAssociation: project.sessionAssociation, workingDirectoryReported: project.workingDirectoryReported, repositoryAssociated: project.repositoryAssociated, repository: project.repository }, ...proof },
    { capabilityId: "projects", source: "Hermes session project association — empty repository scenario", interface: "/api/sessions?limit=100", observedAt: emptyProject.observedAt, assertedFreshness: "fresh", outcome: emptyProject.state, summary: emptyProject.summary, facts: { project: emptyProject.project, profile: emptyProject.profile, workingDirectoryReported: emptyProject.workingDirectoryReported, repositoryAssociated: false, repository: null }, ...proof },
    { capabilityId: "worktrees", source: "Hermes Git worktrees", interface: "/api/git/worktrees", observedAt: worktrees.observedAt, assertedFreshness: "fresh", outcome: worktrees.state, summary: worktrees.summary, facts: { total: worktrees.total, current: worktrees.current, ambiguousCurrent: worktrees.ambiguousCurrent, items: worktrees.items }, ...proof },
    { capabilityId: "worktrees", source: "Hermes Git worktrees — stale observation", interface: "/api/git/worktrees", observedAt: staleAt, assertedFreshness: "stale", outcome: "failure", summary: "A prior bounded worktree request failed and is stale.", facts: { total: 0 }, ...proof },
    { capabilityId: "source-review", source: "Hermes Git status", interface: "/api/git/status", observedAt: review.observedAt, assertedFreshness: "fresh", outcome: review.state, summary: review.summary, facts: { repository: review.repository, branch: review.branch, detached: review.detached, clean: review.clean, staged: review.staged, unstaged: review.unstaged, untracked: review.untracked, conflicts: review.conflicts, ahead: review.ahead, behind: review.behind }, ...proof },
    { capabilityId: "source-review", source: "Hermes review list", interface: "/api/git/review/list?scope=uncommitted", observedAt: review.observedAt, assertedFreshness: "fresh", outcome: "unavailable", summary: "The installed review-list source returned a bounded unavailable response.", facts: { reviewAvailable: false, reviewCount: null }, ...proof },
  ];
}

export function buildHermesRepositoryFixtureInput(options: Options = {}): HermesControlCenterProjectionInput {
  const base = buildHermesAcceptanceFixtureInput(options);
  return {
    ...base,
    installedRuntime: { ...base.installedRuntime, provenance: { kind: "acceptance_fixture", label: "Acceptance fixture — not live runtime", capturedAt: HERMES_REPOSITORY_FIXTURE_CAPTURED_AT, fixtureId: HERMES_REPOSITORY_FIXTURE_ID } },
    observations: observations(),
    evidenceProvenance: { implementationRevision: options.implementationRevision ?? null, fixtureId: HERMES_REPOSITORY_FIXTURE_ID, fixtureCapturedAt: HERMES_REPOSITORY_FIXTURE_CAPTURED_AT, artifactGeneratedAt: options.artifactGeneratedAt ?? null },
    now: HERMES_REPOSITORY_FIXTURE_CAPTURED_AT,
  };
}

export function buildHermesRepositoryFixtureProjection(options: Options = {}) {
  return buildHermesControlCenterProjection(buildHermesRepositoryFixtureInput(options));
}

export function buildHermesRepositoryFixtureEnvelope(options: Options = {}): HermesRawProjectionEnvelope {
  const input = buildHermesRepositoryFixtureInput(options);
  const { provenance, ...installedRuntime } = input.installedRuntime;
  return { schemaVersion: HERMES_RAW_PROJECTION_SCHEMA_VERSION, capturedAt: HERMES_REPOSITORY_FIXTURE_CAPTURED_AT, now: input.now, provenance, installedRuntime, observations: input.observations, evidenceCatalogId: HERMES_EVIDENCE_CATALOG_ID, evidenceProvenance: input.evidenceProvenance };
}
