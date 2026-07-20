import fs from "node:fs";
import path from "node:path";
import { HERMES_CAPABILITY_EVIDENCE_CATALOG } from "../src/lib/hermes/capability-evidence-catalog";
import { HERMES_CAPABILITY_REGISTRY } from "../src/lib/hermes/capability-registry";
import { validateHermesEvidenceAuthority } from "../src/lib/hermes/control-center-authority";
import {
  buildHermesAcceptanceFixtureProjection,
  HERMES_ACCEPTANCE_FIXTURE_ID,
} from "../src/lib/hermes/control-center-acceptance-fixture";
import { buildHermesRepositoryFixtureProjection, HERMES_REPOSITORY_FIXTURE_ID } from "../src/lib/hermes/control-center-repository-fixture";
import { buildHermesRuntimeExecutionFixtureProjection, HERMES_RUNTIME_EXECUTION_FIXTURE_ID } from "../src/lib/hermes/control-center-runtime-fixture";
import { buildHermesControlCenterProjection, hermesParityMetrics, hermesProjectionMatrixRows } from "../src/lib/hermes/control-center-projection";
import {
  HERMES_EVIDENCE_CATALOG_ID,
  HERMES_PROOF_SCOPES,
  HERMES_RAW_PROJECTION_SCHEMA_VERSION,
  HERMES_SNAPSHOT_SCHEMA_VERSION,
  type HermesCapabilityObservation,
  type HermesCapabilityStatus,
  type HermesControlCenterSnapshot,
  type HermesRawProjectionEnvelope,
} from "../src/lib/hermes/control-center-types";

const START = "<!-- GENERATED:HERMES_TRUTH_STATE:START -->";
const END = "<!-- GENERATED:HERMES_TRUTH_STATE:END -->";
const SUMMARY_START = "<!-- GENERATED:HERMES_PARITY_SUMMARY:START -->";
const SUMMARY_END = "<!-- GENERATED:HERMES_PARITY_SUMMARY:END -->";
const documentPath = path.resolve("docs/plans/hermes-desktop-capability-parity.md");
const OUTCOMES = new Set(["success", "connected_empty", "not_configured", "unavailable", "failure", "conflict", "unknown"]);
const PROOF_KINDS = new Set(["live", "exact_fixture", "historical_audit"]);
const FRESHNESS = new Set(["fresh", "stale", "unknown"]);
const PROHIBITED_OBSERVATION_FIELDS = new Set(["status", "surfaceState", "operationalHealth", "exceptions", "parity", "credit", "percentage"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cell(value: unknown): string {
  return String(value ?? "unknown").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateObservation(value: unknown): value is HermesCapabilityObservation {
  if (!isRecord(value)) return false;
  if ([...PROHIBITED_OBSERVATION_FIELDS].some((key) => key in value)) return false;
  return typeof value.capabilityId === "string" &&
    typeof value.source === "string" &&
    typeof value.interface === "string" &&
    (typeof value.observedAt === "string" || value.observedAt === null) &&
    (value.assertedFreshness === undefined || FRESHNESS.has(String(value.assertedFreshness))) &&
    PROOF_KINDS.has(String(value.proofKind)) &&
    HERMES_PROOF_SCOPES.includes(value.proofScope as never) &&
    OUTCOMES.has(String(value.outcome)) &&
    typeof value.summary === "string" &&
    (typeof value.installedBackendVersion === "string" || value.installedBackendVersion === null) &&
    (typeof value.installedBackendCommit === "string" || value.installedBackendCommit === null);
}

export function validateRawProjectionEnvelope(value: unknown): asserts value is HermesRawProjectionEnvelope {
  if (!isRecord(value) || value.schemaVersion !== HERMES_RAW_PROJECTION_SCHEMA_VERSION) {
    throw new Error(`Raw observation envelope must use schema ${HERMES_RAW_PROJECTION_SCHEMA_VERSION}.`);
  }
  if (value.evidenceCatalogId !== HERMES_EVIDENCE_CATALOG_ID) throw new Error("Raw observation envelope uses an unapproved evidence catalog identity.");
  if (!isRecord(value.provenance) || !["live_runtime", "acceptance_fixture"].includes(String(value.provenance.kind))) throw new Error("Raw observation envelope provenance is invalid.");
  if (typeof value.capturedAt !== "string" || typeof value.now !== "string" || value.provenance.capturedAt !== value.capturedAt || !Number.isFinite(Date.parse(value.capturedAt)) || !Number.isFinite(Date.parse(value.now))) throw new Error("Raw observation envelope capturedAt/now provenance is invalid.");
  if (value.provenance.kind === "live_runtime" && value.provenance.fixtureId !== null) throw new Error("Live-runtime provenance cannot carry a fixture ID.");
  if (value.provenance.kind === "acceptance_fixture" && typeof value.provenance.fixtureId !== "string") throw new Error("Acceptance-fixture provenance requires a stable fixture ID.");
  if (!isRecord(value.installedRuntime) || "provenance" in value.installedRuntime || !isRecord(value.installedRuntime.installation) || !isRecord(value.installedRuntime.live) || typeof value.installedRuntime.profile !== "string" || typeof value.installedRuntime.adapter !== "string") throw new Error("Raw observation envelope installed runtime is invalid.");
  if (!Array.isArray(value.observations) || !value.observations.every(validateObservation)) throw new Error("Raw observation envelope contains invalid or authored projection observations.");
  const provenanceKind = value.provenance.kind as "live_runtime" | "acceptance_fixture";
  if (value.observations.some((observation) => !validateHermesEvidenceAuthority({
    origin: "raw_observation",
    provenanceKind,
    proofKind: observation.proofKind,
    proofScope: observation.proofScope,
  }).valid)) throw new Error("Raw observation envelope contains an invalid evidence-authority tuple.");
  if (!isRecord(value.evidenceProvenance) ||
    !(typeof value.evidenceProvenance.implementationRevision === "string" || value.evidenceProvenance.implementationRevision === null) ||
    !(typeof value.evidenceProvenance.fixtureId === "string" || value.evidenceProvenance.fixtureId === null) ||
    !(typeof value.evidenceProvenance.fixtureCapturedAt === "string" || value.evidenceProvenance.fixtureCapturedAt === null) ||
    !(typeof value.evidenceProvenance.artifactGeneratedAt === "string" || value.evidenceProvenance.artifactGeneratedAt === null)) {
    throw new Error("Raw observation envelope evidence provenance is invalid.");
  }
  if (typeof value.evidenceProvenance.implementationRevision === "string" && !/^[0-9a-f]{40}$/i.test(value.evidenceProvenance.implementationRevision)) throw new Error("Raw observation envelope implementation revision is invalid.");
  if (typeof value.evidenceProvenance.artifactGeneratedAt === "string" && !Number.isFinite(Date.parse(value.evidenceProvenance.artifactGeneratedAt))) throw new Error("Raw observation envelope artifact generation time is invalid.");
  if (provenanceKind === "acceptance_fixture" &&
    (value.evidenceProvenance.fixtureId !== value.provenance.fixtureId || value.evidenceProvenance.fixtureCapturedAt !== value.capturedAt)) {
    throw new Error("Raw observation envelope fixture evidence provenance does not match its projection provenance.");
  }
  if (provenanceKind === "live_runtime" && (value.evidenceProvenance.fixtureId !== null || value.evidenceProvenance.fixtureCapturedAt !== null)) {
    throw new Error("Live-runtime evidence provenance cannot claim fixture identity.");
  }
  const known = new Set(HERMES_CAPABILITY_REGISTRY.map((item) => item.id));
  const supplied = new Set(value.observations.map((item) => item.capabilityId));
  const unknown = [...supplied].filter((id) => !known.has(id));
  const missing = [...known].filter((id) => !supplied.has(id));
  if (unknown.length || missing.length) throw new Error(`Raw observation capability IDs are incomplete or unknown. Missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"}.`);
}

export function assembleRawProjectionEnvelope(value: unknown): HermesControlCenterSnapshot {
  validateRawProjectionEnvelope(value);
  return buildHermesControlCenterProjection({
    registry: HERMES_CAPABILITY_REGISTRY,
    installedRuntime: { ...value.installedRuntime, provenance: value.provenance },
    observations: value.observations,
    evidenceCatalog: HERMES_CAPABILITY_EVIDENCE_CATALOG,
    evidenceProvenance: value.evidenceProvenance,
    now: value.now,
  });
}

function recomputedAggregates(snapshot: HermesControlCenterSnapshot) {
  const summary = snapshot.capabilities.reduce<Record<HermesCapabilityStatus, number>>((result, capability) => {
    result[capability.status] += 1;
    return result;
  }, { available: 0, connected: 0, degraded: 0, disabled: 0, unsupported: 0, needs_setup: 0 });
  const byAudience = (audience: "operator" | "management" | "developer") => hermesParityMetrics(snapshot.capabilities.filter((item) => item.audience === audience));
  return {
    summary,
    parity: {
      ...hermesParityMetrics(snapshot.capabilities),
      byAudience: { operator: byAudience("operator"), management: byAudience("management"), developer: byAudience("developer") },
    },
  };
}

export function validateLiveProjection(value: unknown): asserts value is HermesControlCenterSnapshot {
  if (!isRecord(value) || value.schemaVersion !== HERMES_SNAPSHOT_SCHEMA_VERSION || !isRecord(value.provenance) || value.provenance.kind !== "live_runtime") {
    throw new Error("Fetched Control Center response is not a versioned live-runtime projection.");
  }
  if (!Array.isArray(value.capabilities)) throw new Error("Live projection has no capability rows.");
  const expected = new Set(HERMES_CAPABILITY_REGISTRY.map((item) => item.id));
  const ids = value.capabilities.map((item) => isRecord(item) ? item.id : null);
  const unique = new Set(ids);
  if (ids.length !== 48 || unique.size !== 48 || ids.some((id) => typeof id !== "string" || !expected.has(id))) {
    throw new Error("Live projection must contain exactly 48 unique known capability IDs.");
  }
  const snapshot = value as unknown as HermesControlCenterSnapshot;
  const recomputed = recomputedAggregates(snapshot);
  if (!equal(snapshot.summary, recomputed.summary) || !equal(snapshot.parity, recomputed.parity)) throw new Error("Live projection aggregate integrity check failed.");
}

export function formatHermesMatrixRows(snapshot: HermesControlCenterSnapshot): string[] {
  return hermesProjectionMatrixRows(snapshot).map((row) => {
    const current = row.evidence.find((item) => item.proofScope === "live_runtime_operation" || item.proofScope === "exact_fixture_path") ?? row.evidence[0];
    return `| ${cell(row.name)} | ${row.installed} | \`${row.surfaceState}\` | \`${row.operationalHealth}\` | ${current ? `${cell(current.proofKind)} / ${cell(current.proofScope)} / ${cell(current.outcome)}` : "none"} | ${cell(current?.source ?? "registry only")} | ${cell(current?.interface ?? "unknown")} | ${cell(current?.observedAt ?? "unknown")} | ${cell(current?.assertedFreshness ?? "unknown")} / ${cell(current?.effectiveFreshness ?? "unknown")} | ${row.pathProof.proven ? "yes" : "no"} | D:${row.credit.discoverability ? "yes" : "no"} L:${row.credit.liveVisibility ? "yes" : "no"} M:${row.credit.governedManagement ? "yes" : "no"} P:${row.credit.liveProven ? "yes" : "no"} |`;
  });
}

function provenanceSummary(snapshot: HermesControlCenterSnapshot): string {
  return snapshot.provenance.kind === "acceptance_fixture"
    ? `Acceptance-fixture projection captured ${snapshot.provenance.capturedAt}. These are not live-runtime percentages.`
    : `Live-runtime projection captured ${snapshot.provenance.capturedAt}.`;
}

export function renderHermesParityEvidence(snapshot: HermesControlCenterSnapshot, generatedAt: string): string {
  const rows = formatHermesMatrixRows(snapshot);
  const graph = snapshot.capabilities.find((item) => item.id === "starmap")?.evidence.find((item) => item.facts && typeof item.facts.nodes === "number");
  const provenance = snapshot.provenance.kind === "acceptance_fixture"
    ? `${snapshot.provenance.label}. Fixture ID: \`${snapshot.provenance.fixtureId}\`. Captured: ${snapshot.provenance.capturedAt}.`
    : `Live runtime projection captured ${snapshot.provenance.capturedAt}.`;
  return [
    START,
    "## Generated per-capability truth-state evidence",
    "",
    `Generated at ${generatedAt}. ${provenance}`,
    "",
    `Implementation revision: \`${snapshot.evidenceProvenance.implementationRevision ?? "not supplied"}\`. Artifact generated at: ${snapshot.evidenceProvenance.artifactGeneratedAt ?? generatedAt}.`,
    "",
    "Installed Desktop source commit: **unknown**. The commit `311a5b0a552be78f5c58807e2be1db02e3badcb0` is historical Desktop source-audit evidence only.",
    "",
    `All ${snapshot.capabilities.length} rows and all displayed percentages use the production Hermes Control Center projection assembler. Generated time is not an observation time. Exact fixture path proof is non-parity evidence and never earns Live-Proven credit.`,
    "",
    `Overall credits: Discoverability ${snapshot.parity.discoverability.covered}/${snapshot.parity.discoverability.total} (${snapshot.parity.discoverability.percentage}%); Current Live Visibility ${snapshot.parity.liveVisibility.covered}/${snapshot.parity.liveVisibility.total} (${snapshot.parity.liveVisibility.percentage}%); Governed Management ${snapshot.parity.governedManagement.covered}/${snapshot.parity.governedManagement.total} (${snapshot.parity.governedManagement.percentage}%); Live-Proven ${snapshot.parity.liveProven.covered}/${snapshot.parity.liveProven.total} (${snapshot.parity.liveProven.percentage}%).`,
    "",
    "| Capability | Installed | Cabinet surface | Operational health | Kind / scope / outcome | Source | Interface | Observed at | Asserted / effective freshness | Fixture path | Credits |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    graph
      ? `Memory graph observation: profile \`${cell(graph.facts?.profile ?? snapshot.health.profile)}\`, ${cell(graph.facts?.nodes)} nodes and ${cell(graph.facts?.edges)} edges, observed ${cell(graph.observedAt)}. This claim applies only to that profile and observation.`
      : "Memory graph observation: no typed graph-count evidence was supplied. No node or edge count is inferred.",
    END,
  ].join("\n");
}

export function renderHermesParitySummary(snapshot: HermesControlCenterSnapshot): string {
  const row = (label: string, audience: "operator" | "management" | "developer") => {
    const value = snapshot.parity.byAudience[audience];
    return `| ${label} (${value.discoverability.total}) | ${value.discoverability.percentage}% | ${value.liveVisibility.percentage}% | ${value.governedManagement.percentage}% | ${value.liveProven.percentage}% |`;
  };
  return [
    SUMMARY_START,
    provenanceSummary(snapshot),
    "",
    "| Audience | Discoverability | Current live visibility | Governed management | Live-proven |",
    "| --- | ---: | ---: | ---: | ---: |",
    row("Operator", "operator"),
    row("Management", "management"),
    row("Developer", "developer"),
    `| All capabilities (${snapshot.parity.discoverability.total}) | ${snapshot.parity.discoverability.percentage}% | ${snapshot.parity.liveVisibility.percentage}% | ${snapshot.parity.governedManagement.percentage}% | ${snapshot.parity.liveProven.percentage}% |`,
    SUMMARY_END,
  ].join("\n");
}

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

export async function loadExplicitProjection(args: { fixtureId?: string | null; observationsPath?: string | null; projectionUrl?: string | null; implementationRevision?: string | null; artifactGeneratedAt?: string | null }): Promise<HermesControlCenterSnapshot> {
  const selected = [args.fixtureId, args.observationsPath, args.projectionUrl].filter(Boolean);
  if (selected.length !== 1) throw new Error("Provide exactly one explicit input: --url <live Control Center URL>, --observations <raw projection-input.json>, or --fixture <fixture ID>.");
  if (args.fixtureId) {
    if (![HERMES_ACCEPTANCE_FIXTURE_ID, HERMES_REPOSITORY_FIXTURE_ID, HERMES_RUNTIME_EXECUTION_FIXTURE_ID].includes(args.fixtureId)) throw new Error(`Unknown Hermes fixture ID: ${args.fixtureId}.`);
    if (!args.implementationRevision || !/^[0-9a-f]{40}$/i.test(args.implementationRevision)) throw new Error("Fixture evidence generation requires --implementation-revision with a full 40-character commit SHA.");
    if (args.fixtureId === HERMES_RUNTIME_EXECUTION_FIXTURE_ID) return buildHermesRuntimeExecutionFixtureProjection({ implementationRevision: args.implementationRevision, artifactGeneratedAt: args.artifactGeneratedAt ?? null });
    return args.fixtureId === HERMES_REPOSITORY_FIXTURE_ID
      ? buildHermesRepositoryFixtureProjection({ implementationRevision: args.implementationRevision, artifactGeneratedAt: args.artifactGeneratedAt ?? null })
      : buildHermesAcceptanceFixtureProjection({ implementationRevision: args.implementationRevision, artifactGeneratedAt: args.artifactGeneratedAt ?? null });
  }
  if (args.observationsPath) {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(args.observationsPath), "utf8")) as unknown;
    return assembleRawProjectionEnvelope(parsed);
  }
  const response = await fetch(args.projectionUrl!, { cache: "no-store" });
  if (!response.ok) throw new Error(`Control Center projection returned HTTP ${response.status}.`);
  const parsed = await response.json() as unknown;
  validateLiveProjection(parsed);
  return parsed;
}

async function main() {
  try {
    if (arg("--input")) throw new Error("--input no longer accepts assembled snapshots. Use --observations with a versioned raw projection-input envelope.");
    const generatedAt = arg("--generated-at") ?? new Date().toISOString();
    const snapshot = await loadExplicitProjection({ fixtureId: arg("--fixture"), observationsPath: arg("--observations"), projectionUrl: arg("--url"), implementationRevision: arg("--implementation-revision"), artifactGeneratedAt: generatedAt });
    const generated = renderHermesParityEvidence(snapshot, generatedAt);
    const existing = fs.readFileSync(documentPath, "utf8");
    let next = existing.includes(START)
      ? existing.replace(new RegExp(`${START}[\\s\\S]*?${END}`), generated)
      : `${existing.trimEnd()}\n\n${generated}\n`;
    const summary = renderHermesParitySummary(snapshot);
    if (!next.includes(SUMMARY_START)) throw new Error("Parity document is missing the generated summary markers.");
    next = next.replace(new RegExp(`${SUMMARY_START}[\\s\\S]*?${SUMMARY_END}`), summary);
    fs.writeFileSync(documentPath, next);
    const projectionOut = arg("--projection-out");
    if (projectionOut) fs.writeFileSync(path.resolve(projectionOut), `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`Updated ${documentPath} from ${snapshot.capabilities.length} typed capability projections.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hermes parity evidence generation failed.";
    console.error(message.slice(0, 500));
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
