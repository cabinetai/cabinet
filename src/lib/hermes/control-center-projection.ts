import type {
  HermesCapabilityDefinition,
  HermesCapabilityEvidence,
  HermesCapabilityObservation,
  HermesCapabilityProjection,
  HermesCapabilityStatus,
  HermesControlCenterProjectionInput,
  HermesControlCenterSnapshot,
  HermesEvidenceOutcome,
  HermesGovernanceProof,
  HermesObservationFreshness,
  HermesOperationalHealth,
  HermesParityMetrics,
  HermesProjectionProvenance,
} from "./control-center-types";
import { HERMES_SNAPSHOT_SCHEMA_VERSION } from "./control-center-types";
import { sanitizeHermesBrowserModel, sanitizeHermesText } from "./control-center-sanitizer";

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

function prepareObservation(
  observation: HermesCapabilityObservation,
  input: Pick<HermesControlCenterProjectionInput, "now" | "installedRuntime">
): PreparedObservation {
  return {
    ...observation,
    assertedFreshness: observation.assertedFreshness ?? "unknown",
    effectiveFreshness: effectiveHermesFreshness(observation, input.now, input.installedRuntime.provenance),
  };
}

function evidenceFromObservation(observation: PreparedObservation): HermesCapabilityEvidence {
  return {
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

function latestGatewaySources(observations: readonly PreparedObservation[], provenance: HermesProjectionProvenance) {
  const latest = new Map<string, PreparedObservation>();
  for (const item of observations) {
    if (!isOperationalScope(item, provenance) || epoch(item.observedAt) === null) continue;
    const key = `${item.source}\u0000${item.interface}`;
    const previous = latest.get(key);
    if (!previous || (epoch(item.observedAt) ?? 0) > (epoch(previous.observedAt) ?? 0)) latest.set(key, item);
  }
  return [...latest.values()].sort((left, right) =>
    left.source.localeCompare(right.source) ||
    left.interface.localeCompare(right.interface) ||
    (left.observedAt ?? "").localeCompare(right.observedAt ?? "")
  );
}

export function resolveGatewayConflict(
  observations: readonly PreparedObservation[],
  provenance: HermesProjectionProvenance
): { running: PreparedObservation; stopped: PreparedObservation; summary: string } | null {
  const concrete = latestGatewaySources(observations, provenance)
    .filter((item) => item.effectiveFreshness === "fresh")
    .flatMap((item) => {
      const state = gatewayState(item);
      return state ? [{ item, state }] : [];
    });
  const running = concrete.find((candidate) => candidate.state === "running")?.item;
  const stopped = concrete.find((candidate) => candidate.state === "stopped")?.item;
  if (!running || !stopped) return null;
  return {
    running,
    stopped,
    summary: `${running.source} observed running at ${running.observedAt}; ${stopped.source} observed stopped at ${stopped.observedAt}.`,
  };
}

function healthFor(
  definition: HermesCapabilityDefinition,
  observations: readonly PreparedObservation[],
  provenance: HermesProjectionProvenance
): { health: HermesOperationalHealth; detail: string; gatewayConflict: ReturnType<typeof resolveGatewayConflict> } {
  if (definition.parityState === "unsupported" || !definition.installedSupported) {
    return { health: "unavailable", detail: definition.installedVersionSupport, gatewayConflict: null };
  }
  const current = activeObservations(observations, provenance);
  const gatewayConflict = definition.id === "gateway" ? resolveGatewayConflict(observations, provenance) : null;
  if (gatewayConflict) return { health: "conflicting_evidence", detail: gatewayConflict.summary, gatewayConflict };
  if (!current.length) return { health: "unknown", detail: "No fresh source-specific observation is available.", gatewayConflict: null };

  const outcomes = new Set(current.map((item) => item.outcome));
  const detail = current.map((item) => item.summary).filter(Boolean).join(" ") || "No bounded source detail was reported.";
  if (outcomes.has("conflict")) return { health: "conflicting_evidence", detail, gatewayConflict: null };
  if (outcomes.has("failure")) return { health: "degraded", detail, gatewayConflict: null };
  if (outcomes.has("not_configured") && ![...outcomes].some((item) => SUCCESS_OUTCOMES.has(item))) return { health: "not_configured", detail, gatewayConflict: null };
  if (outcomes.has("unavailable") && ![...outcomes].some((item) => SUCCESS_OUTCOMES.has(item))) return { health: "unavailable", detail, gatewayConflict: null };
  if (outcomes.has("unknown") && ![...outcomes].some((item) => SUCCESS_OUTCOMES.has(item))) return { health: "unknown", detail, gatewayConflict: null };
  if ([...outcomes].some((item) => SUCCESS_OUTCOMES.has(item)) && [...outcomes].some((item) => !SUCCESS_OUTCOMES.has(item))) {
    return { health: "degraded", detail, gatewayConflict: null };
  }
  return { health: "healthy", detail, gatewayConflict: null };
}

function statusFor(surface: HermesCapabilityDefinition["parityState"], health: HermesOperationalHealth): HermesCapabilityStatus {
  if (surface === "unsupported") return "unsupported";
  if (surface === "missing") return "needs_setup";
  if (surface === "diagnostic_only") return "available";
  if (health === "healthy") return surface === "mapped" ? "available" : "connected";
  if (health === "not_configured") return "needs_setup";
  if (["degraded", "conflicting_evidence", "unavailable"].includes(health)) return "degraded";
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
      .map((item) => prepareObservation(item, input));
    const catalog = input.evidenceCatalog[definition.id];
    const historical = (catalog?.historical ?? []).map((proof) => prepareObservation({
      capabilityId: proof.capabilityId,
      source: proof.source,
      interface: proof.interface,
      observedAt: proof.observedAt,
      assertedFreshness: "stale",
      proofKind: "historical_audit",
      proofScope: proof.proofScope,
      outcome: proof.outcome,
      summary: proof.summary,
      installedBackendVersion: proof.installedBackendVersion,
      installedBackendCommit: proof.installedBackendCommit,
      facts: { evidenceReference: proof.evidenceReference },
    }, input));
    const allObservations = [...observed, ...historical];
    const resolved = healthFor(definition, observed, input.installedRuntime.provenance);
    const evidence = allObservations.map(evidenceFromObservation);
    if (resolved.gatewayConflict) {
      const { running, stopped, summary } = resolved.gatewayConflict;
      evidence.unshift(evidenceFromObservation({
        capabilityId: definition.id,
        source: "Hermes gateway reconciliation",
        interface: `${running.source} + ${stopped.source}`,
        observedAt: (epoch(running.observedAt) ?? 0) >= (epoch(stopped.observedAt) ?? 0) ? running.observedAt : stopped.observedAt,
        assertedFreshness: "fresh",
        effectiveFreshness: "fresh",
        proofKind: input.installedRuntime.provenance.kind === "acceptance_fixture" ? "exact_fixture" : "live",
        proofScope: input.installedRuntime.provenance.kind === "acceptance_fixture" ? "exact_fixture_path" : "live_runtime_operation",
        outcome: "conflict",
        summary,
        installedBackendVersion: running.installedBackendVersion ?? stopped.installedBackendVersion,
        installedBackendCommit: running.installedBackendCommit ?? stopped.installedBackendCommit,
        facts: { runningSource: running.source, stoppedSource: stopped.source },
      }));
    }
    const currentSuccess = observed.some((item) =>
      item.effectiveFreshness === "fresh" && item.proofScope === "live_runtime_operation" && SUCCESS_OUTCOMES.has(item.outcome)
    );
    const liveProven = allObservations.some((item) =>
      SUCCESS_OUTCOMES.has(item.outcome) && (
        (item.proofScope === "live_runtime_operation" && item.effectiveFreshness === "fresh") ||
        item.proofScope === "historical_live_acceptance"
      )
    );
    const exactFixturePath = observed.some((item) =>
      item.proofScope === "exact_fixture_path" && item.effectiveFreshness === "fresh" && item.outcome !== "unknown" && item.outcome !== "not_configured"
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
  const snapshot: HermesControlCenterSnapshot = {
    schemaVersion: HERMES_SNAPSHOT_SCHEMA_VERSION,
    checkedAt: input.now,
    provenance: input.installedRuntime.provenance,
    installed: {
      desktopVersion: installation.desktopVersion,
      desktopCommit: installation.desktopCommit,
      backendVersion: installation.backendVersion,
      backendCommit: installation.backendCommit,
      cabinetCommit: installation.cabinetCommit,
      adapter: input.installedRuntime.adapter,
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
      profile: input.installedRuntime.profile,
      openCli: openCli?.operationalHealth ?? "unknown",
    },
    exceptions: capabilities.flatMap((capability) =>
      capability.surfaceState !== "unsupported" && ["degraded", "conflicting_evidence", "unavailable"].includes(capability.operationalHealth)
        ? [{ capabilityId: capability.id, title: capability.name, health: capability.operationalHealth as "degraded" | "conflicting_evidence" | "unavailable", summary: capability.operationalDetail }]
        : []
    ),
    summary,
    parity: {
      ...hermesParityMetrics(capabilities),
      byAudience: { operator: byAudience("operator"), management: byAudience("management"), developer: byAudience("developer") },
    },
    capabilities,
    live: input.installedRuntime.live,
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
      outcome: item.outcome,
      facts: item.facts,
    })),
    credit: capability.credit,
    pathProof: capability.pathProof,
    status: capability.status,
  }));
}
