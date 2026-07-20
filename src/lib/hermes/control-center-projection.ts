import type {
  HermesCapabilityDefinition,
  HermesCapabilityEvidence,
  HermesCapabilityObservation,
  HermesCapabilityProjection,
  HermesCapabilityStatus,
  HermesControlCenterProjectionInput,
  HermesControlCenterSnapshot,
  HermesEvidenceOutcome,
  HermesEvidenceOrigin,
  HermesGovernanceProof,
  HermesObservationFreshness,
  HermesOperationalHealth,
  HermesParityMetrics,
  HermesProjectionProvenance,
} from "./control-center-types";
import { HERMES_SNAPSHOT_SCHEMA_VERSION } from "./control-center-types";
import { validateHermesEvidenceAuthority } from "./control-center-authority";
import { sanitizeHermesBrowserModel, sanitizeHermesText } from "./control-center-sanitizer";
import { emptyRuntimeExecution, type HermesRuntimeExecutionSnapshot } from "./runtime-execution";

const SUCCESS_OUTCOMES = new Set<HermesEvidenceOutcome>(["success", "connected_empty"]);
const CONCRETE_GATEWAY_STATES = new Set(["running", "stopped"]);
const FUTURE_CLOCK_SKEW_MS = 30_000;
const SOURCE_CLASS_MAX_AGE_MS = {
  runtime_api: 5 * 60_000,
  local_diagnostic: 10 * 60_000,
  installation_metadata: 60 * 60_000,
  exact_fixture: 5 * 60_000,
  cabinet_local: 24 * 60 * 60_000,
} as const;

type PreparedObservation = HermesCapabilityObservation & {
  origin: HermesEvidenceOrigin;
  authorityValid: boolean;
  assertedFreshness: HermesObservationFreshness;
  effectiveFreshness: HermesObservationFreshness;
};

function epoch(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function effectiveHermesFreshness(
  observation: HermesCapabilityObservation,
  now: string,
  provenance: HermesProjectionProvenance
): HermesObservationFreshness {
  const observedAt = epoch(observation.observedAt);
  if (observedAt === null) return "unknown";
  if (observation.proofScope === "source_audit" || observation.proofScope === "historical_live_acceptance") return "stale";
  const referenceValue = observation.proofScope === "exact_fixture_path" ? provenance.capturedAt : now;
  const reference = epoch(referenceValue);
  if (reference === null || observedAt > reference + FUTURE_CLOCK_SKEW_MS) return "unknown";
  const maxAge = observation.proofScope === "exact_fixture_path"
    ? SOURCE_CLASS_MAX_AGE_MS.exact_fixture
    : observation.proofScope === "cabinet_local_surface"
      ? SOURCE_CLASS_MAX_AGE_MS.cabinet_local
      : observation.source === "OpenCLI doctor"
        ? SOURCE_CLASS_MAX_AGE_MS.local_diagnostic
        : observation.source === "Installed Hermes metadata"
          ? SOURCE_CLASS_MAX_AGE_MS.installation_metadata
          : SOURCE_CLASS_MAX_AGE_MS.runtime_api;
  return reference - observedAt > maxAge ? "stale" : "fresh";
}

export function hermesObservationTimeValidity(
  observation: Pick<HermesCapabilityObservation, "observedAt" | "proofScope">,
  now: string,
  provenance: HermesProjectionProvenance
): { parseable: boolean; validAgainstReference: boolean; epoch: number | null } {
  const observedAt = epoch(observation.observedAt);
  if (observedAt === null) return { parseable: false, validAgainstReference: false, epoch: null };
  const referenceValue = observation.proofScope === "exact_fixture_path" ? provenance.capturedAt : now;
  const reference = epoch(referenceValue);
  return {
    parseable: true,
    validAgainstReference: reference !== null && observedAt <= reference + FUTURE_CLOCK_SKEW_MS,
    epoch: observedAt,
  };
}

function prepareObservation(
  observation: HermesCapabilityObservation,
  input: Pick<HermesControlCenterProjectionInput, "now" | "installedRuntime">,
  origin: HermesEvidenceOrigin
): PreparedObservation {
  const authority = validateHermesEvidenceAuthority({
    origin,
    provenanceKind: input.installedRuntime.provenance.kind,
    proofKind: observation.proofKind,
    proofScope: observation.proofScope,
  });
  return {
    ...observation,
    origin,
    authorityValid: authority.valid,
    assertedFreshness: observation.assertedFreshness ?? "unknown",
    effectiveFreshness: effectiveHermesFreshness(observation, input.now, input.installedRuntime.provenance),
  };
}

function evidenceFromObservation(observation: PreparedObservation): HermesCapabilityEvidence {
  return {
    origin: observation.origin,
    source: observation.source,
    interface: observation.interface,
    observedAt: observation.observedAt,
    assertedFreshness: observation.assertedFreshness,
    effectiveFreshness: observation.effectiveFreshness,
    proofKind: observation.proofKind,
    proofScope: observation.proofScope,
    outcome: observation.outcome,
    installedBackendVersion: observation.installedBackendVersion,
    installedBackendCommit: observation.installedBackendCommit,
    facts: observation.facts,
    stale: observation.effectiveFreshness !== "fresh",
    summary: sanitizeHermesText(observation.summary, 240),
  };
}

function isOperationalScope(observation: PreparedObservation, provenance: HermesProjectionProvenance): boolean {
  if (!observation.authorityValid || observation.origin === "approved_evidence_catalog") return false;
  if (observation.proofScope === "cabinet_local_surface") return true;
  return provenance.kind === "live_runtime"
    ? observation.proofScope === "live_runtime_operation"
    : observation.proofScope === "exact_fixture_path";
}

function activeObservations(observations: readonly PreparedObservation[], provenance: HermesProjectionProvenance) {
  return observations.filter((item) => item.effectiveFreshness === "fresh" && isOperationalScope(item, provenance));
}

function gatewayState(observation: PreparedObservation): "running" | "stopped" | null {
  if (observation.outcome === "unavailable" || observation.outcome === "unknown") return null;
  const state = typeof observation.facts?.state === "string" ? observation.facts.state.toLowerCase() : "unknown";
  return CONCRETE_GATEWAY_STATES.has(state) ? state as "running" | "stopped" : null;
}

function stableObservationOrder(left: PreparedObservation, right: PreparedObservation): number {
  return (gatewayState(left) ?? "").localeCompare(gatewayState(right) ?? "") ||
    left.outcome.localeCompare(right.outcome) ||
    left.summary.localeCompare(right.summary) ||
    left.source.localeCompare(right.source) ||
    left.interface.localeCompare(right.interface);
}

function latestGatewaySources(
  observations: readonly PreparedObservation[],
  provenance: HermesProjectionProvenance,
  now: string
): { selected: PreparedObservation[]; ambiguities: Array<{ source: string; interface: string; observedAt: string }> } {
  const groups = new Map<string, PreparedObservation[]>();
  for (const item of observations) {
    const time = hermesObservationTimeValidity(item, now, provenance);
    if (!isOperationalScope(item, provenance) || !time.validAgainstReference) continue;
    const key = `${item.source}\u0000${item.interface}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const selected: PreparedObservation[] = [];
  const ambiguities: Array<{ source: string; interface: string; observedAt: string }> = [];
  for (const records of groups.values()) {
    const newestEpoch = Math.max(...records.map((item) => hermesObservationTimeValidity(item, now, provenance).epoch ?? Number.NEGATIVE_INFINITY));
    const newest = records.filter((item) => hermesObservationTimeValidity(item, now, provenance).epoch === newestEpoch).sort(stableObservationOrder);
    const states = new Set(newest.map(gatewayState).filter((state): state is "running" | "stopped" => state !== null));
    if (states.size > 1) {
      ambiguities.push({ source: newest[0]!.source, interface: newest[0]!.interface, observedAt: newest[0]!.observedAt! });
      continue;
    }
    selected.push(newest[0]!);
  }
  return {
    selected: selected.sort((left, right) => left.source.localeCompare(right.source) || left.interface.localeCompare(right.interface)),
    ambiguities: ambiguities.sort((left, right) => left.source.localeCompare(right.source) || left.interface.localeCompare(right.interface)),
  };
}

export function resolveGatewayConflict(
  observations: readonly PreparedObservation[],
  provenance: HermesProjectionProvenance,
  now: string
): { conflict: { running: PreparedObservation; stopped: PreparedObservation; summary: string } | null; ambiguities: Array<{ source: string; interface: string; observedAt: string }>; selected: PreparedObservation[] } {
  const latest = latestGatewaySources(observations, provenance, now);
  const concrete = latest.selected
    .filter((item) => item.effectiveFreshness === "fresh")
    .flatMap((item) => {
      const state = gatewayState(item);
      return state ? [{ item, state }] : [];
    });
  const running = concrete.find((candidate) => candidate.state === "running")?.item;
  const stopped = concrete.find((candidate) => candidate.state === "stopped")?.item;
  if (!running || !stopped) return { conflict: null, ambiguities: latest.ambiguities, selected: latest.selected };
  return { conflict: {
    running,
    stopped,
    summary: `${running.source} observed running at ${running.observedAt}; ${stopped.source} observed stopped at ${stopped.observedAt}.`,
  }, ambiguities: latest.ambiguities, selected: latest.selected };
}

function healthFor(
  definition: HermesCapabilityDefinition,
  observations: readonly PreparedObservation[],
  provenance: HermesProjectionProvenance,
  now: string
): { health: HermesOperationalHealth; detail: string; gatewayResolution: ReturnType<typeof resolveGatewayConflict> | null } {
  if (definition.parityState === "unsupported" || !definition.installedSupported) {
    return { health: "unavailable", detail: definition.installedVersionSupport, gatewayResolution: null };
  }
  const gatewayResolution = definition.id === "gateway" ? resolveGatewayConflict(observations, provenance, now) : null;
  const current = gatewayResolution
    ? gatewayResolution.selected.filter((item) => item.effectiveFreshness === "fresh")
    : activeObservations(observations, provenance);
  if (gatewayResolution?.conflict) return { health: "conflicting_evidence", detail: gatewayResolution.conflict.summary, gatewayResolution };
  if (gatewayResolution?.ambiguities.length) {
    const first = gatewayResolution.ambiguities[0]!;
    return { health: "unknown", detail: `${first.source} reported opposing Gateway states at the same valid timestamp. The source is ambiguous.`, gatewayResolution };
  }
  if (!current.length) return { health: "unknown", detail: "No fresh source-specific observation is available.", gatewayResolution };

  const outcomes = new Set(current.map((item) => item.outcome));
  const detail = current.map((item) => item.summary).filter(Boolean).join(" ") || "No bounded source detail was reported.";
  if (outcomes.has("conflict")) return { health: "conflicting_evidence", detail, gatewayResolution };
  if (outcomes.has("failure")) return { health: "degraded", detail, gatewayResolution };
  if (outcomes.has("not_configured") && ![...outcomes].some((item) => SUCCESS_OUTCOMES.has(item))) return { health: "not_configured", detail, gatewayResolution };
  if (outcomes.has("unavailable") && ![...outcomes].some((item) => SUCCESS_OUTCOMES.has(item))) return { health: "unavailable", detail, gatewayResolution };
  if (outcomes.has("unknown") && ![...outcomes].some((item) => SUCCESS_OUTCOMES.has(item))) return { health: "unknown", detail, gatewayResolution };
  if ([...outcomes].some((item) => SUCCESS_OUTCOMES.has(item)) && [...outcomes].some((item) => !SUCCESS_OUTCOMES.has(item))) {
    return { health: "degraded", detail, gatewayResolution };
  }
  return { health: "healthy", detail, gatewayResolution };
}

function statusFor(surface: HermesCapabilityDefinition["parityState"], health: HermesOperationalHealth): HermesCapabilityStatus {
  if (surface === "unsupported") return "unsupported";
  if (surface === "missing") return "needs_setup";
  if (surface === "diagnostic_only") return "available";
  if (health === "healthy") return surface === "mapped" ? "available" : "connected";
  if (health === "not_configured") return "needs_setup";
  if (health === "unavailable") return "needs_setup";
  if (["degraded", "conflicting_evidence"].includes(health)) return "degraded";
  return "available";
}

export function hermesParityMetrics(capabilities: readonly HermesCapabilityProjection[]): HermesParityMetrics {
  const metric = (key: keyof HermesCapabilityProjection["credit"]) => {
    const covered = capabilities.filter((item) => item.credit[key]).length;
    return { covered, total: capabilities.length, percentage: capabilities.length ? Math.round((covered / capabilities.length) * 100) : 0 };
  };
  return {
    discoverability: metric("discoverability"),
    liveVisibility: metric("liveVisibility"),
    governedManagement: metric("governedManagement"),
    liveProven: metric("liveProven"),
  };
}

function validGovernanceProof(value: HermesGovernanceProof[] | undefined): boolean {
  if (!Array.isArray(value) || !value.length) return false;
  return value.some((proof) => Boolean(
    proof.confirmationBoundary && proof.stableRequestIdentity && proof.idempotencyBehavior &&
    proof.visibleOutcomeEvidence && proof.testedContract && proof.proofTimestamp && proof.proofSource
  ));
}

/** Sole derivation path for browser-facing Hermes capability truth. */
export function buildHermesControlCenterProjection(input: HermesControlCenterProjectionInput): HermesControlCenterSnapshot {
  const capabilities = input.registry.map((definition): HermesCapabilityProjection => {
    const observed = input.observations
      .filter((item) => item.capabilityId === definition.id)
      .map((item) => prepareObservation(item, input, "raw_observation"))
      .filter((item) => item.authorityValid);
    const catalog = input.evidenceCatalog[definition.id];
    const historical = (catalog?.historical ?? []).map((proof) => prepareObservation({
      capabilityId: proof.capabilityId,
      source: proof.source,
      interface: proof.interface,
      observedAt: proof.observedAt,
      assertedFreshness: "stale",
      proofKind: proof.proofKind,
      proofScope: proof.proofScope,
      outcome: proof.outcome,
      summary: proof.summary,
      installedBackendVersion: proof.installedBackendVersion,
      installedBackendCommit: proof.installedBackendCommit,
      facts: { evidenceReference: proof.evidenceReference },
    }, input, "approved_evidence_catalog")).filter((item) => item.authorityValid);
    const allObservations = [...observed, ...historical];
    const resolved = healthFor(definition, observed, input.installedRuntime.provenance, input.now);
    const evidence = allObservations.map(evidenceFromObservation);
    if (resolved.gatewayResolution?.conflict) {
      const { running, stopped, summary } = resolved.gatewayResolution.conflict;
      const derived = prepareObservation({
        capabilityId: definition.id,
        source: "Hermes gateway reconciliation",
        interface: `${running.source} + ${stopped.source}`,
        observedAt: (epoch(running.observedAt) ?? 0) >= (epoch(stopped.observedAt) ?? 0) ? running.observedAt : stopped.observedAt,
        proofKind: input.installedRuntime.provenance.kind === "acceptance_fixture" ? "exact_fixture" : "live",
        proofScope: input.installedRuntime.provenance.kind === "acceptance_fixture" ? "exact_fixture_path" : "live_runtime_operation",
        outcome: "conflict",
        summary,
        installedBackendVersion: running.installedBackendVersion ?? stopped.installedBackendVersion,
        installedBackendCommit: running.installedBackendCommit ?? stopped.installedBackendCommit,
        facts: { runningSource: running.source, stoppedSource: stopped.source },
      }, input, "derived_reconciliation");
      if (derived.authorityValid) evidence.unshift(evidenceFromObservation(derived));
    }
    const currentSuccess = observed.some((item) =>
      input.installedRuntime.provenance.kind === "live_runtime" &&
      item.origin === "raw_observation" && item.proofKind === "live" &&
      item.effectiveFreshness === "fresh" && item.proofScope === "live_runtime_operation" &&
      SUCCESS_OUTCOMES.has(item.outcome) && item.facts?.partialClaim !== true
    );
    const liveProven = allObservations.some((item) =>
      SUCCESS_OUTCOMES.has(item.outcome) && item.authorityValid && (
        (input.installedRuntime.provenance.kind === "live_runtime" && item.origin === "raw_observation" && item.facts?.partialClaim !== true &&
          item.proofKind === "live" && item.proofScope === "live_runtime_operation" && item.effectiveFreshness === "fresh") ||
        (item.origin === "approved_evidence_catalog" && item.proofKind === "historical_audit" &&
          item.proofScope === "historical_live_acceptance" &&
          hermesObservationTimeValidity(item, input.now, input.installedRuntime.provenance).validAgainstReference &&
          Boolean(item.source.trim() && item.interface.trim() && String(item.facts?.evidenceReference ?? "").trim()) &&
          Boolean(item.installedBackendVersion || item.installedBackendCommit))
      )
    );
    const exactFixturePath = observed.some((item) =>
      input.installedRuntime.provenance.kind === "acceptance_fixture" && item.origin === "raw_observation" &&
      item.proofKind === "exact_fixture" && item.proofScope === "exact_fixture_path" &&
      hermesObservationTimeValidity(item, input.now, input.installedRuntime.provenance).validAgainstReference &&
      item.outcome !== "unknown" && item.outcome !== "not_configured"
    );
    const status = statusFor(definition.parityState, resolved.health);
    return {
      ...definition,
      installedSupport: { supported: definition.installedSupported, detail: definition.installedVersionSupport },
      surfaceState: definition.parityState,
      operationalHealth: resolved.health,
      operationalDetail: resolved.detail,
      evidence,
      status,
      statusDetail: definition.parityState === "diagnostic_only"
        ? "Diagnostic only. Full Cabinet management is intentionally unavailable."
        : resolved.detail,
      credit: {
        discoverability: Boolean(definition.id && definition.name && definition.cabinetHref),
        liveVisibility: currentSuccess && resolved.health === "healthy",
        governedManagement: validGovernanceProof(catalog?.governance),
        liveProven,
      },
      pathProof: {
        proven: exactFixturePath,
        label: exactFixturePath ? "Exact fixture path proven" : null,
      },
    };
  });

  const summary = capabilities.reduce<Record<HermesCapabilityStatus, number>>((result, capability) => {
    result[capability.status] += 1;
    return result;
  }, { available: 0, connected: 0, degraded: 0, disabled: 0, unsupported: 0, needs_setup: 0 });
  const gateway = capabilities.find((item) => item.id === "gateway");
  const openCli = capabilities.find((item) => item.id === "browser-opencli");
  const runtime = capabilities.find((item) => item.id === "command-center");
  const installation = input.installedRuntime.installation;
  const byAudience = (audience: HermesCapabilityDefinition["audience"]) => hermesParityMetrics(capabilities.filter((item) => item.audience === audience));
  const freshEvidence = (id: string) => capabilities.find((item) => item.id === id)?.evidence.find((item) =>
    item.origin === "raw_observation" && item.effectiveFreshness === "fresh" &&
    (item.proofScope === "live_runtime_operation" || item.proofScope === "exact_fixture_path")
  );
  const freshEvidenceFrom = (id: string, source: string) => capabilities.find((item) => item.id === id)?.evidence.find((item) =>
    item.source === source && item.origin === "raw_observation" && item.effectiveFreshness === "fresh" &&
    (item.proofScope === "live_runtime_operation" || item.proofScope === "exact_fixture_path")
  );
  const projectEvidence = freshEvidence("projects");
  const worktreeEvidence = freshEvidence("worktrees");
  const reviewEvidence = freshEvidence("source-review");
  const agentIdentityEvidence = freshEvidenceFrom("about-updates", "Hermes Agent detailed health identity");
  const runtimeEvidence = freshEvidenceFrom("command-center", "Hermes runtime execution");
  const runtimeFacts = runtimeEvidence?.facts?.runtimeExecution;
  const runtimeExecution = runtimeFacts && typeof runtimeFacts === "object" && !Array.isArray(runtimeFacts)
    ? runtimeFacts as unknown as HermesRuntimeExecutionSnapshot
    : emptyRuntimeExecution(input.now, "No fresh source-specific runtime execution observation is available.");
  const scalar = (facts: HermesCapabilityEvidence["facts"] | undefined, key: string) => {
    const value = facts?.[key];
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null ? value : null;
  };
  const currentWorktree = worktreeEvidence?.facts?.current;
  const currentWorktreeRecord = currentWorktree && typeof currentWorktree === "object" && !Array.isArray(currentWorktree) ? currentWorktree : null;
  const managementUnavailableCapabilityIds = new Set(capabilities.flatMap((capability) => capability.evidence.some((item) =>
    item.origin === "raw_observation" && item.effectiveFreshness === "fresh" && item.outcome === "unavailable" && item.facts?.sourceGroup === "management"
  ) ? [capability.id] : []));
  const groupedExceptions: HermesControlCenterSnapshot["exceptions"] = managementUnavailableCapabilityIds.size
    ? [{
        kind: "source_group",
        capabilityId: null,
        sourceGroup: "management",
        dependentCount: managementUnavailableCapabilityIds.size,
        title: "Management unavailable",
        health: "unavailable",
        summary: `${managementUnavailableCapabilityIds.size} dependent capability observations were not collected. Hermes Management is not configured for this review.`,
      }]
    : [];
  const capabilityExceptions: HermesControlCenterSnapshot["exceptions"] = capabilities.flatMap((capability) => {
    if (capability.surfaceState === "unsupported" || !["degraded", "conflicting_evidence", "unavailable"].includes(capability.operationalHealth)) return [];
    const activeEvidence = capability.evidence.filter((item) => item.origin === "raw_observation" && item.effectiveFreshness === "fresh");
    const abnormal = activeEvidence.filter((item) => !SUCCESS_OUTCOMES.has(item.outcome) && item.outcome !== "unknown");
    const onlySharedManagementUnavailable = abnormal.length > 0 && abnormal.every((item) => item.outcome === "unavailable" && item.facts?.sourceGroup === "management");
    if (onlySharedManagementUnavailable) return [];
    return [{
      kind: "capability" as const,
      capabilityId: capability.id,
      sourceGroup: null,
      dependentCount: null,
      title: capability.name,
      health: capability.operationalHealth as "degraded" | "conflicting_evidence" | "unavailable",
      summary: capability.operationalDetail,
    }];
  });
  const snapshot: HermesControlCenterSnapshot = {
    schemaVersion: HERMES_SNAPSHOT_SCHEMA_VERSION,
    checkedAt: input.now,
    provenance: input.installedRuntime.provenance,
    evidenceProvenance: input.evidenceProvenance,
    installed: {
      desktopVersion: installation.desktopVersion,
      desktopCommit: installation.desktopCommit,
      backendVersion: installation.backendVersion,
      backendCommit: installation.backendCommit,
      cabinetCommit: installation.cabinetCommit,
      adapter: input.installedRuntime.adapter,
      observedRunningAgentVersion: (scalar(agentIdentityEvidence?.facts, "reportedVersion") ?? (input.installedRuntime.provenance.kind === "acceptance_fixture" ? installation.backendVersion : null)) as string | null,
      observedRunningAgentVersionSource: (scalar(agentIdentityEvidence?.facts, "versionSource") ?? (input.installedRuntime.provenance.kind === "acceptance_fixture" ? "acceptance fixture installed identity" : null)) as string | null,
      observedRunningAgentObservedAt: agentIdentityEvidence?.observedAt ?? (input.installedRuntime.provenance.kind === "acceptance_fixture" ? input.installedRuntime.provenance.capturedAt : null),
      observedRunningAgentCommit: scalar(agentIdentityEvidence?.facts, "reportedRunningCommit") as string | null,
      observedRunningAgentCommitSource: scalar(agentIdentityEvidence?.facts, "reportedRunningCommitSource") as string | null,
      detectedAgentCheckoutCommit: installation.backendCommit,
      detectedAgentCheckoutCommitSource: installation.backendCommit ? "local installation metadata" : null,
      contracts: {
        agentApiHealth: agentIdentityEvidence
          ? `installed Agent ${scalar(agentIdentityEvidence.facts, "reportedVersion") ?? "unknown"} GET /health/detailed`
          : input.installedRuntime.provenance.kind === "acceptance_fixture" ? `acceptance fixture contract ${input.installedRuntime.adapter}` : "Agent API health contract unavailable",
        management: input.installedRuntime.provenance.kind === "acceptance_fixture"
          ? `acceptance fixture contract ${input.installedRuntime.adapter}`
          : `unavailable; prior ${installation.upstreamAudit.installedBackendVersion} audit ${installation.upstreamAudit.stale ? "stale" : "current"}`,
        gateway: input.installedRuntime.provenance.kind === "acceptance_fixture" ? `acceptance fixture contract ${input.installedRuntime.adapter}` : "unavailable",
        desktop: installation.desktopVersion ? `separately detected Desktop ${installation.desktopVersion}` : "Desktop version unknown",
      },
      upstreamAudit: {
        auditedAt: installation.upstreamAudit.auditedAt,
        auditedCommit: installation.upstreamAudit.auditedCommit.slice(0, 12),
        installedBackendVersion: installation.upstreamAudit.installedBackendVersion,
        commitsBehind: installation.upstreamAudit.commitsBehind,
        stale: installation.upstreamAudit.stale,
      },
    },
    health: {
      runtime: runtime?.operationalHealth ?? "unknown",
      gateway: gateway?.operationalHealth === "conflicting_evidence" ? "conflicting evidence" : gateway?.operationalHealth ?? "unknown",
      profile: input.installedRuntime.observedActiveProfile ?? "unknown",
      configuredProfile: input.installedRuntime.configuredProfile,
      observedActiveProfile: input.installedRuntime.observedActiveProfile,
      observedProfileSource: input.installedRuntime.observedProfileSource,
      openCli: openCli?.operationalHealth ?? "unknown",
    },
    exceptions: [...groupedExceptions, ...capabilityExceptions],
    summary,
    parity: {
      ...hermesParityMetrics(capabilities),
      byAudience: { operator: byAudience("operator"), management: byAudience("management"), developer: byAudience("developer") },
    },
    capabilities,
    live: input.installedRuntime.live,
    developerRepository: {
      project: {
        label: scalar(projectEvidence?.facts, "project") as string | null,
        profile: scalar(projectEvidence?.facts, "profile") as string | null,
        repositoryAssociated: scalar(projectEvidence?.facts, "repositoryAssociated") as boolean | null,
        repository: (scalar(reviewEvidence?.facts, "repository") ?? scalar(projectEvidence?.facts, "repository")) as string | null,
        observedAt: projectEvidence?.observedAt ?? null,
      },
      worktree: {
        label: (currentWorktreeRecord && typeof currentWorktreeRecord.identity === "string" ? currentWorktreeRecord.identity : null),
        branch: (scalar(reviewEvidence?.facts, "branch") ?? (currentWorktreeRecord && typeof currentWorktreeRecord.branch === "string" ? currentWorktreeRecord.branch : null)) as string | null,
        detached: (scalar(reviewEvidence?.facts, "detached") ?? (currentWorktreeRecord && typeof currentWorktreeRecord.detached === "boolean" ? currentWorktreeRecord.detached : null)) as boolean | null,
        clean: scalar(reviewEvidence?.facts, "clean") as boolean | null,
        ambiguousCurrent: scalar(worktreeEvidence?.facts, "ambiguousCurrent") === true,
        observedAt: reviewEvidence?.observedAt ?? worktreeEvidence?.observedAt ?? null,
      },
    },
    runtimeExecution,
  };
  return sanitizeHermesBrowserModel(snapshot);
}

export function hermesProjectionMatrixRows(snapshot: HermesControlCenterSnapshot) {
  return snapshot.capabilities.map((capability) => ({
    id: capability.id,
    name: capability.name,
    installed: capability.installedSupport.supported ? "supported" : "unsupported",
    surfaceState: capability.surfaceState,
    operationalHealth: capability.operationalHealth,
    evidence: capability.evidence.map((item) => ({
      source: item.source,
      interface: item.interface,
      observedAt: item.observedAt,
      assertedFreshness: item.assertedFreshness,
      effectiveFreshness: item.effectiveFreshness,
      proofKind: item.proofKind,
      proofScope: item.proofScope,
      origin: item.origin,
      outcome: item.outcome,
      facts: item.facts,
    })),
    credit: capability.credit,
    pathProof: capability.pathProof,
    status: capability.status,
  }));
}
