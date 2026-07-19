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
  HermesOperationalHealth,
  HermesParityMetrics,
} from "./control-center-types";
import { sanitizeHermesBrowserModel, sanitizeHermesText } from "./control-center-sanitizer";

const SUCCESS_OUTCOMES = new Set<HermesEvidenceOutcome>(["success", "connected_empty"]);
const CURRENT_PROOF_KINDS = new Set(["live", "exact_fixture"]);
const CONCRETE_GATEWAY_STATES = new Set(["running", "stopped"]);

function evidenceFromObservation(observation: HermesCapabilityObservation): HermesCapabilityEvidence {
  return {
    source: observation.source,
    interface: observation.interface,
    observedAt: observation.observedAt,
    freshness: observation.freshness,
    stale: observation.freshness !== "fresh",
    proofKind: observation.proofKind,
    outcome: observation.outcome,
    summary: sanitizeHermesText(observation.summary, 240),
    installedBackendVersion: observation.installedBackendVersion,
    installedBackendCommit: observation.installedBackendCommit,
    facts: observation.facts,
  };
}

function gatewayResolution(observations: readonly HermesCapabilityObservation[]) {
  const current = observations.filter((item) => item.freshness === "fresh" && CURRENT_PROOF_KINDS.has(item.proofKind));
  const concrete = current.flatMap((item) => {
    const state = typeof item.facts?.state === "string" ? item.facts.state.toLowerCase() : "unknown";
    return CONCRETE_GATEWAY_STATES.has(state) ? [{ item, state: state as "running" | "stopped" }] : [];
  });
  if (concrete.length < 2 || new Set(concrete.map((item) => item.state)).size < 2) return null;
  const [first, second] = concrete;
  if (!first || !second) return null;
  return {
    summary: `${first.item.source} observed ${first.state} at ${first.item.observedAt ?? "unknown time"}; ${second.item.source} observed ${second.state} at ${second.item.observedAt ?? "unknown time"}.`,
    observedAt: second.item.observedAt ?? first.item.observedAt,
    proofKind: second.item.proofKind,
    installedBackendVersion: second.item.installedBackendVersion ?? first.item.installedBackendVersion,
    installedBackendCommit: second.item.installedBackendCommit ?? first.item.installedBackendCommit,
  };
}

function healthFor(definition: HermesCapabilityDefinition, observations: readonly HermesCapabilityObservation[]): {
  health: HermesOperationalHealth;
  detail: string;
} {
  if (definition.parityState === "unsupported" || !definition.installedSupported) {
    return { health: "unavailable", detail: definition.installedVersionSupport };
  }
  const current = observations.filter((item) => item.freshness === "fresh" && CURRENT_PROOF_KINDS.has(item.proofKind));
  if (definition.id === "gateway") {
    const conflict = gatewayResolution(current);
    if (conflict) return { health: "conflicting_evidence", detail: conflict.summary };
  }
  if (!current.length) return { health: "unknown", detail: "No fresh source-specific observation is available." };

  const outcomes = new Set(current.map((item) => item.outcome));
  const detail = current.map((item) => item.summary).filter(Boolean).join(" ") || "No bounded source detail was reported.";
  if (outcomes.has("conflict")) return { health: "conflicting_evidence", detail };
  if (outcomes.has("failure")) return { health: "degraded", detail };
  if (outcomes.has("not_configured") && ![...outcomes].some((item) => SUCCESS_OUTCOMES.has(item))) return { health: "not_configured", detail };
  if (outcomes.has("unavailable") && ![...outcomes].some((item) => SUCCESS_OUTCOMES.has(item))) return { health: "unavailable", detail };
  if (outcomes.has("unknown") && ![...outcomes].some((item) => SUCCESS_OUTCOMES.has(item))) return { health: "unknown", detail };
  if ([...outcomes].some((item) => SUCCESS_OUTCOMES.has(item)) && [...outcomes].some((item) => !SUCCESS_OUTCOMES.has(item))) {
    return { health: "degraded", detail };
  }
  return { health: "healthy", detail };
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

function parityMetrics(capabilities: readonly HermesCapabilityProjection[]): HermesParityMetrics {
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

/**
 * Sole derivation path for browser-facing Hermes capability truth. Collectors and
 * fixtures provide observations only; status, health, credits, exceptions, and
 * parity totals are intentionally derived here.
 */
export function buildHermesControlCenterProjection(input: HermesControlCenterProjectionInput): HermesControlCenterSnapshot {
  const capabilities = input.registry.map((definition): HermesCapabilityProjection => {
    const observed = input.observations.filter((item) => item.capabilityId === definition.id);
    const catalog = input.evidenceCatalog[definition.id];
    const historical: HermesCapabilityObservation[] = (catalog?.historical ?? []).map((proof) => ({
      capabilityId: definition.id,
      source: proof.source,
      interface: proof.interface,
      observedAt: proof.observedAt,
      freshness: "stale",
      proofKind: "historical_audit",
      outcome: proof.outcome,
      summary: proof.summary,
      installedBackendVersion: proof.installedBackendVersion,
      installedBackendCommit: proof.installedBackendCommit,
    }));
    const allObservations = [...observed, ...historical];
    const resolved = healthFor(definition, observed);
    const gatewayConflict = definition.id === "gateway" ? gatewayResolution(observed) : null;
    const evidence = allObservations.map(evidenceFromObservation);
    if (gatewayConflict) {
      evidence.unshift(evidenceFromObservation({
        capabilityId: definition.id,
        source: "Hermes gateway reconciliation",
        interface: "health bridge plus management status",
        observedAt: gatewayConflict.observedAt,
        freshness: "fresh",
        proofKind: gatewayConflict.proofKind,
        outcome: "conflict",
        summary: gatewayConflict.summary,
        installedBackendVersion: gatewayConflict.installedBackendVersion,
        installedBackendCommit: gatewayConflict.installedBackendCommit,
      }));
    }
    const currentSuccess = observed.some((item) =>
      item.freshness === "fresh" && CURRENT_PROOF_KINDS.has(item.proofKind) && SUCCESS_OUTCOMES.has(item.outcome) && item.facts?.scope !== "cabinet_local"
    );
    const currentVisibility = currentSuccess && resolved.health === "healthy";
    const liveProven = allObservations.some((item) => SUCCESS_OUTCOMES.has(item.outcome));
    const status = statusFor(definition.parityState, resolved.health);
    const statusDetail = definition.parityState === "diagnostic_only"
      ? "Diagnostic only. Full Cabinet management is intentionally unavailable."
      : resolved.detail;
    return {
      ...definition,
      installedSupport: { supported: definition.installedSupported, detail: definition.installedVersionSupport },
      surfaceState: definition.parityState,
      operationalHealth: resolved.health,
      operationalDetail: resolved.detail,
      evidence,
      status,
      statusDetail,
      credit: {
        discoverability: Boolean(definition.id && definition.name && definition.cabinetHref),
        liveVisibility: currentVisibility,
        governedManagement: validGovernanceProof(catalog?.governance),
        liveProven,
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
  const byAudience = (audience: HermesCapabilityDefinition["audience"]) => parityMetrics(capabilities.filter((item) => item.audience === audience));
  const snapshot: HermesControlCenterSnapshot = {
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
      ...parityMetrics(capabilities),
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
    evidence: capability.evidence.map((item) => ({ source: item.source, interface: item.interface, observedAt: item.observedAt, freshness: item.freshness, proofKind: item.proofKind, outcome: item.outcome })),
    credit: capability.credit,
    status: capability.status,
  }));
}
