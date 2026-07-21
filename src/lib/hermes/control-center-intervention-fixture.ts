import {
  HERMES_EVIDENCE_CATALOG_ID,
  HERMES_RAW_PROJECTION_SCHEMA_VERSION,
  type HermesControlCenterProjectionInput,
  type HermesRawProjectionEnvelope,
} from "./control-center-types";
import { buildHermesControlCenterProjection } from "./control-center-projection";
import { buildHermesRuntimeExecutionFixtureInput } from "./control-center-runtime-fixture";

export const HERMES_RUNTIME_INTERVENTION_FIXTURE_ID = "hermes-phase-3b-governed-runtime-intervention-v1";
export const HERMES_RUNTIME_INTERVENTION_CAPTURED_AT = "2026-07-20T03:30:00.000Z";
export const HERMES_RUNTIME_INTERVENTION_FIXTURE_LABEL = "Acceptance fixture — no live mutation performed" as const;

type Options = { implementationRevision?: string | null; artifactGeneratedAt?: string | null };

export function buildHermesRuntimeInterventionFixtureInput(options: Options = {}): HermesControlCenterProjectionInput {
  const base = buildHermesRuntimeExecutionFixtureInput({ ...options, governedInterventions: true });
  return {
    ...base,
    installedRuntime: {
      ...base.installedRuntime,
      provenance: {
        kind: "acceptance_fixture",
        label: HERMES_RUNTIME_INTERVENTION_FIXTURE_LABEL,
        capturedAt: HERMES_RUNTIME_INTERVENTION_CAPTURED_AT,
        fixtureId: HERMES_RUNTIME_INTERVENTION_FIXTURE_ID,
      },
    },
    observations: base.observations.map((observation) => ({ ...observation, observedAt: HERMES_RUNTIME_INTERVENTION_CAPTURED_AT })),
    evidenceProvenance: {
      implementationRevision: options.implementationRevision ?? null,
      fixtureId: HERMES_RUNTIME_INTERVENTION_FIXTURE_ID,
      fixtureCapturedAt: HERMES_RUNTIME_INTERVENTION_CAPTURED_AT,
      artifactGeneratedAt: options.artifactGeneratedAt ?? null,
    },
    now: HERMES_RUNTIME_INTERVENTION_CAPTURED_AT,
  };
}

export function buildHermesRuntimeInterventionFixtureProjection(options: Options = {}) {
  return buildHermesControlCenterProjection(buildHermesRuntimeInterventionFixtureInput(options));
}

export function buildHermesRuntimeInterventionFixtureEnvelope(options: Options = {}): HermesRawProjectionEnvelope {
  const input = buildHermesRuntimeInterventionFixtureInput(options);
  const { provenance, ...installedRuntime } = input.installedRuntime;
  return {
    schemaVersion: HERMES_RAW_PROJECTION_SCHEMA_VERSION,
    capturedAt: HERMES_RUNTIME_INTERVENTION_CAPTURED_AT,
    now: input.now,
    provenance,
    installedRuntime,
    observations: input.observations,
    evidenceCatalogId: HERMES_EVIDENCE_CATALOG_ID,
    evidenceProvenance: input.evidenceProvenance,
  };
}
