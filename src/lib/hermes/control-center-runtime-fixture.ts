import { HERMES_EVIDENCE_CATALOG_ID, HERMES_RAW_PROJECTION_SCHEMA_VERSION, type HermesCapabilityObservation, type HermesControlCenterProjectionInput, type HermesRawProjectionEnvelope } from './control-center-types';
import { buildHermesRepositoryFixtureInput } from './control-center-repository-fixture';
import { buildHermesControlCenterProjection } from './control-center-projection';
import { normalizeRuntimeExecution } from './runtime-execution';

export const HERMES_RUNTIME_EXECUTION_FIXTURE_ID = 'hermes-phase-3a-runtime-execution-v1';
export const HERMES_RUNTIME_EXECUTION_CAPTURED_AT = '2026-07-19T22:15:00.000Z';

type Options = { implementationRevision?: string | null; artifactGeneratedAt?: string | null; governedInterventions?: boolean };
const RUNTIME_IDS = new Set(['command-center', 'agents-subagents', 'cron', 'approvals', 'artifacts', 'files', 'usage-insights']);

function runtimeSnapshot(governedInterventions = false) {
  const at = HERMES_RUNTIME_EXECUTION_CAPTURED_AT;
  const knownRuns = [
    { run_id: 'run-active', status: 'running', created_at: '2026-07-19T22:00:00.000Z', updated_at: at, current_step: 'Gather evidence', current_tool: 'browser.read', artifact_count: 1, source: 'Hermes Run status' },
    { run_id: 'run-queued', status: 'queued', created_at: '2026-07-19T22:14:00.000Z', updated_at: '2026-07-19T22:08:00.000Z' },
    { run_id: 'run-approval', status: 'waiting_for_approval', waiting_reason: 'approval', created_at: '2026-07-19T21:50:00.000Z', updated_at: '2026-07-19T22:14:00.000Z', parent_run_id: 'run-active' },
    { run_id: 'run-clarification', status: 'waiting_for_clarification', waiting_reason: 'clarification', created_at: '2026-07-19T21:45:00.000Z', updated_at: '2026-07-19T22:11:00.000Z' },
    { run_id: 'run-auth', status: 'waiting', waiting_reason: 'authentication', created_at: '2026-07-19T21:40:00.000Z', updated_at: '2026-07-19T22:10:00.000Z' },
    { run_id: 'run-blocked', status: 'blocked', waiting_reason: 'file', created_at: '2026-07-19T21:35:00.000Z', updated_at: '2026-07-19T22:09:00.000Z' },
    { run_id: 'run-retrying', status: 'retrying', retry_count: 2, created_at: '2026-07-19T21:30:00.000Z', updated_at: '2026-07-19T22:07:00.000Z' },
    { run_id: 'run-failed', status: 'failed', created_at: '2026-07-19T21:20:00.000Z', updated_at: '2026-07-19T22:13:00.000Z', error: 'Authorization: Bearer fixture-secret ' + 'oversized '.repeat(200), prompt: 'api_key=fixture-secret', tool_input: { secret: 'fixture-secret' } },
    { run_id: 'run-completed', status: 'completed', created_at: '2026-07-19T21:00:00.000Z', ended_at: '2026-07-19T21:10:00.000Z', updated_at: '2026-07-19T22:06:00.000Z', output: 'customer@example.test /Users/private-owner/secret.txt', usage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 }, estimated_cost_usd: 0.14, artifact_count: 2 },
    { run_id: 'run-conflict', status: 'running', created_at: '2026-07-19T21:00:00.000Z', updated_at: '2026-07-19T22:12:00.000Z', source: 'Hermes Run status' },
    { run_id: 'run-conflict', status: 'failed', created_at: '2026-07-19T21:00:00.000Z', updated_at: '2026-07-19T22:12:00.000Z', source: 'Hermes lifecycle event' },
  ];
  return normalizeRuntimeExecution({
    sessions: { sessions: [] },
    workers: { workers: [{ run_id: 17, profile: 'operator-os', worker_pid: 9999, task_title: 'secret customer@example.test', started_at: 1784500000 }] },
    board: { columns: [{ name: 'ready', tasks: [] }, { name: 'running', tasks: [] }, { name: 'blocked', tasks: [] }] },
    files: { entries: [
      { name: 'runtime-report.md', path: '/Users/private-owner/runtime-report.md', mime_type: 'text/markdown', size: 2048, mtime: 1784500000 },
      { name: 'screenshot.png', path: 'C:\\Users\\private-owner\\screenshots\\screenshot.png', mime_type: 'image/png', size: 4096, mtime: 1784500100 },
    ] },
    usage: { totals: { total_input: 4200, total_output: 900, total_estimated_cost: 0.48, total_actual_cost: 0.45, total_sessions: 9 } },
    knownRuns,
    includeWorkerRuns: governedInterventions,
  }, at);
}

function observations(governedInterventions = false): HermesCapabilityObservation[] {
  const base = buildHermesRepositoryFixtureInput().observations.filter((item) => !RUNTIME_IDS.has(item.capabilityId));
  const execution = runtimeSnapshot(governedInterventions);
  const proof = {
    observedAt: HERMES_RUNTIME_EXECUTION_CAPTURED_AT,
    assertedFreshness: 'fresh' as const,
    proofKind: 'exact_fixture' as const,
    proofScope: 'exact_fixture_path' as const,
    installedBackendVersion: '0.18.2',
    installedBackendCommit: '594308d4bbe95548c9fe418bb10c449099426f93',
  };
  const observation = (capabilityId: string, source: string, interfaceIdentity: string, outcome: HermesCapabilityObservation['outcome'], summary: string, facts: HermesCapabilityObservation['facts']): HermesCapabilityObservation => ({
    capabilityId, source, interface: interfaceIdentity, outcome, summary, facts, ...proof,
  });
  return [
    ...base,
    observation('command-center', 'Hermes runtime execution', '/api/sessions + /v1/runs/{run_id}', 'success', execution.runSource.summary, { runtimeExecution: execution }),
    observation('command-center', 'Hermes lifecycle reconciliation', '/v1/runs/{run_id} + /events', 'conflict', 'Two newest valid lifecycle observations disagree for one run.', { run: 'Run run-conflict', states: ['active', 'failed'] }),
    observation('agents-subagents', 'Hermes active workers', '/api/plugins/kanban/workers/active', execution.agents.state, execution.agents.summary, { count: execution.agents.count }),
    { ...observation('agents-subagents', 'Hermes worker detail', '/api/plugins/kanban/runs/{run_id}', 'failure', 'A bounded worker-detail source failed.', { count: 0 }), observedAt: '2026-07-19T18:00:00.000Z', assertedFreshness: 'stale' },
    observation('cron', 'Hermes Kanban queue', '/api/plugins/kanban/board', execution.queue.state, execution.queue.summary, { total: execution.queue.total, counts: execution.queue.counts }),
    observation('approvals', 'Hermes known-run pending input', '/v1/runs/{run_id} + /events', execution.approvals.state, execution.approvals.summary, { count: execution.approvals.count, rule: 'Hermes prepares; Jeremy commits.' }),
    observation('artifacts', 'Hermes artifact metadata', '/api/files', execution.artifacts.state, execution.artifacts.summary, { total: execution.artifacts.total, items: execution.artifacts.items }),
    observation('artifacts', 'Hermes run-artifact association', 'installed response fields', 'unavailable', 'The installed artifact response does not report run association.', { associationAvailable: false }),
    observation('files', 'Hermes artifact metadata', '/api/files', execution.artifacts.state, execution.artifacts.summary, { total: execution.artifacts.total, items: execution.artifacts.items }),
    observation('usage-insights', 'Hermes usage analytics', '/api/analytics/usage', execution.usage.state, execution.usage.summary, { inputTokens: execution.usage.inputTokens, outputTokens: execution.usage.outputTokens, estimatedCostUsd: execution.usage.estimatedCostUsd, actualCostUsd: execution.usage.actualCostUsd, sessions: execution.usage.sessions }),
    observation('usage-insights', 'Hermes per-run cost', '/v1/runs/{run_id}', 'unavailable', 'Per-run cost is not guaranteed by the installed Run status contract.', { perRunCostAvailable: false }),
  ];
}

export function buildHermesRuntimeExecutionFixtureInput(options: Options = {}): HermesControlCenterProjectionInput {
  const base = buildHermesRepositoryFixtureInput(options);
  return {
    ...base,
    installedRuntime: { ...base.installedRuntime, provenance: { kind: 'acceptance_fixture', label: 'Acceptance fixture — not live runtime', capturedAt: HERMES_RUNTIME_EXECUTION_CAPTURED_AT, fixtureId: HERMES_RUNTIME_EXECUTION_FIXTURE_ID } },
    observations: observations(options.governedInterventions),
    evidenceProvenance: { implementationRevision: options.implementationRevision ?? null, fixtureId: HERMES_RUNTIME_EXECUTION_FIXTURE_ID, fixtureCapturedAt: HERMES_RUNTIME_EXECUTION_CAPTURED_AT, artifactGeneratedAt: options.artifactGeneratedAt ?? null },
    now: HERMES_RUNTIME_EXECUTION_CAPTURED_AT,
  };
}

export function buildHermesRuntimeExecutionFixtureProjection(options: Options = {}) {
  return buildHermesControlCenterProjection(buildHermesRuntimeExecutionFixtureInput(options));
}

export function buildHermesRuntimeExecutionFixtureEnvelope(options: Options = {}): HermesRawProjectionEnvelope {
  const input = buildHermesRuntimeExecutionFixtureInput(options);
  const { provenance, ...installedRuntime } = input.installedRuntime;
  return { schemaVersion: HERMES_RAW_PROJECTION_SCHEMA_VERSION, capturedAt: HERMES_RUNTIME_EXECUTION_CAPTURED_AT, now: input.now, provenance, installedRuntime, observations: input.observations, evidenceCatalogId: HERMES_EVIDENCE_CATALOG_ID, evidenceProvenance: input.evidenceProvenance };
}
