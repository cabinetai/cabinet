import { sanitizeHermesText } from './control-center-sanitizer';
import { safePathIdentity } from './developer-repository';

export type HermesRuntimeSourceState = 'success' | 'connected_empty' | 'unavailable' | 'failure' | 'unknown';
export type HermesExecutionState = 'active' | 'queued' | 'waiting' | 'blocked' | 'paused' | 'retrying' | 'failed' | 'completed' | 'conflicting' | 'unknown';
export type HermesWaitingReason = 'approval' | 'clarification' | 'authentication' | 'secret' | 'file' | 'decision' | 'unknown';

export type HermesExecutionRun = {
  id: string;
  agent: string | null;
  state: HermesExecutionState;
  currentStep: string | null;
  currentTool: string | null;
  startedAt: string | null;
  lastTransitionAt: string | null;
  waitingReason: HermesWaitingReason | null;
  retryCount: number | null;
  parentRunId: string | null;
  childRunCount: number;
  artifactCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
  summary: string | null;
  source: string;
  interface: string;
  intervention?: {
    category: 'terminate_kanban_run';
    targetRunId: string;
  };
};

export type HermesRuntimeExecutionSnapshot = {
  observedAt: string;
  runs: HermesExecutionRun[];
  agents: { state: HermesRuntimeSourceState; count: number; summary: string };
  runSource: { state: HermesRuntimeSourceState; summary: string };
  queue: { state: HermesRuntimeSourceState; total: number; counts: Record<string, number>; summary: string };
  approvals: { state: HermesRuntimeSourceState; count: number; summary: string };
  artifacts: { state: HermesRuntimeSourceState; total: number; items: Array<{ name: string; kind: string; size: number | null; observedAt: string | null }>; summary: string };
  usage: { state: HermesRuntimeSourceState; inputTokens: number | null; outputTokens: number | null; estimatedCostUsd: number | null; actualCostUsd: number | null; sessions: number | null; summary: string };
};

export function runtimeExecutionEmptyMessage(snapshot: HermesRuntimeExecutionSnapshot, staleEvidence = false): string {
  const states = [snapshot.agents.state, snapshot.runSource.state, snapshot.queue.state, snapshot.approvals.state, snapshot.artifacts.state, snapshot.usage.state];
  if (staleEvidence) return 'Runtime execution evidence is stale. Active-run state may have changed.';
  if (states.every((state) => state === 'unavailable')) return 'Runtime execution sources are unavailable. Active-run state is unknown.';
  if (states.some((state) => state === 'failure')) return 'A runtime execution source failed. Active-run state may be incomplete.';
  if (states.every((state) => state === 'success' || state === 'connected_empty')) return 'Runtime execution sources responded with no current records.';
  return 'Runtime execution state is unknown because current source evidence is incomplete.';
}

type RuntimeInputs = {
  sessions: unknown;
  workers: unknown;
  board: unknown;
  files: unknown;
  usage: unknown;
  knownRuns?: unknown;
  includeWorkerRuns?: boolean;
};

const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const FUTURE_SKEW_MS = 30_000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function finite(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function count(value: unknown): number | null {
  const number = finite(value);
  return number === null ? null : Math.max(0, Math.round(number));
}
function timestamp(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  const number = finite(value);
  if (number === null) return null;
  const date = new Date(number > 10_000_000_000 ? number : number * 1_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function safeRuntimeText(value: unknown, maxLength = 120): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(ANSI, '')
    .replace(CONTROL, ' ')
    .replace(/\btoken\s*[:=]\s*[^\s,;]+/gi, '[redacted credential]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
    .replace(/\b[A-Z]:\\Users\\[^\\\s]+/gi, 'C:\\Users\\[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? sanitizeHermesText(normalized, maxLength) : null;
}

function safeIdentity(prefix: string, value: unknown): string | null {
  const safe = safeRuntimeText(value, 80);
  if (!safe) return null;
  const suffix = safe.replace(/[^a-z0-9_-]/gi, '').slice(-12);
  return suffix ? prefix + ' ' + suffix : prefix;
}

function failureSummary(raw: unknown, fallback: string): string {
  const source = record(raw);
  return safeRuntimeText(source.error ?? source.detail ?? source.message, 200) ?? fallback;
}
function unavailable(raw: unknown): boolean { return record(raw).unavailable === true; }
function failed(raw: unknown): boolean { return record(raw).failure === true; }

function normalizeWaitingReason(value: unknown): HermesWaitingReason | null {
  const normalized = safeRuntimeText(value, 48)?.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (!normalized) return null;
  if (normalized.includes('approval')) return 'approval';
  if (normalized.includes('clarif')) return 'clarification';
  if (normalized.includes('auth')) return 'authentication';
  if (normalized.includes('secret')) return 'secret';
  if (normalized.includes('file')) return 'file';
  if (normalized.includes('decision') || normalized.includes('input')) return 'decision';
  return 'unknown';
}

function lifecycle(value: unknown, isActive = false): HermesExecutionState {
  if (isActive) return 'active';
  const normalized = safeRuntimeText(value, 48)?.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_') ?? '';
  if (['running', 'active', 'in_progress', 'streaming'].includes(normalized)) return 'active';
  if (['queued', 'pending', 'ready', 'todo', 'scheduled', 'triage'].includes(normalized)) return 'queued';
  if (normalized.startsWith('waiting') || normalized.includes('approval') || normalized.includes('clarification')) return 'waiting';
  if (['blocked', 'needs_input'].includes(normalized)) return 'blocked';
  if (['paused', 'stopping'].includes(normalized)) return 'paused';
  if (['retrying', 'retry', 'backoff'].includes(normalized)) return 'retrying';
  if (['failed', 'error', 'errored', 'timed_out'].includes(normalized)) return 'failed';
  if (['completed', 'complete', 'done', 'success', 'finished'].includes(normalized)) return 'completed';
  return normalized === 'conflicting' ? 'conflicting' : 'unknown';
}

function safeResult(value: unknown, state: HermesExecutionState): string | null {
  if (state === 'failed') return safeRuntimeText(value, 200) ? 'Run failed. A bounded failure summary is available.' : 'Run failed.';
  if (state === 'completed') return safeRuntimeText(value, 200) ? 'Run completed with a result.' : 'Run completed.';
  return null;
}

export function normalizeKnownRunRows(raw: unknown, referenceAt: string): HermesExecutionRun[] {
  if (unavailable(raw) || failed(raw)) return [];
  const rows = Array.isArray(raw) ? raw : array(record(raw).runs);
  const reference = Date.parse(referenceAt);
  const grouped = new Map<string, Array<{ row: Record<string, unknown>; observedAt: string; state: HermesExecutionState }>>();
  for (const item of rows) {
    const row = record(item);
    const id = safeIdentity('Run', row.run_id ?? row.id);
    const observedAt = timestamp(row.observed_at ?? row.updated_at ?? row.last_transition_at);
    if (!id || !observedAt || !Number.isFinite(reference) || Date.parse(observedAt) > reference + FUTURE_SKEW_MS) continue;
    const state = lifecycle(row.status ?? row.state);
    grouped.set(id, [...(grouped.get(id) ?? []), { row, observedAt, state }]);
  }
  const result: HermesExecutionRun[] = [];
  for (const [id, values] of grouped) {
    const latestEpoch = Math.max(...values.map((item) => Date.parse(item.observedAt)));
    const latest = values.filter((item) => Date.parse(item.observedAt) === latestEpoch)
      .sort((left, right) => left.state.localeCompare(right.state));
    const selected = latest[0]!;
    const row = selected.row;
    const state: HermesExecutionState = new Set(latest.map((item) => item.state)).size > 1 ? 'conflicting' : selected.state;
    const usage = record(row.usage);
    const startedAt = timestamp(row.created_at ?? row.started_at);
    const endedAt = timestamp(row.ended_at);
    const waiting = normalizeWaitingReason(row.waiting_reason ?? row.pending_reason ?? record(row.pending_decision).type ?? row.last_event);
    result.push({
      id,
      agent: safeIdentity('Agent', row.agent_id ?? row.worker_id),
      state,
      currentStep: safeRuntimeText(row.current_step ?? row.step, 80),
      currentTool: safeRuntimeText(row.current_tool ?? row.tool, 80),
      startedAt,
      lastTransitionAt: selected.observedAt,
      waitingReason: state === 'waiting' || state === 'blocked' ? waiting ?? 'unknown' : null,
      retryCount: count(row.retry_count),
      parentRunId: safeIdentity('Run', row.parent_run_id ?? row.parent_session_id),
      childRunCount: count(row.child_run_count) ?? 0,
      artifactCount: count(row.artifact_count) ?? 0,
      inputTokens: count(usage.input_tokens ?? row.input_tokens),
      outputTokens: count(usage.output_tokens ?? row.output_tokens),
      totalTokens: count(usage.total_tokens ?? row.total_tokens),
      costUsd: finite(row.cost_usd ?? row.estimated_cost_usd),
      durationMs: count(row.duration_ms) ?? (startedAt && endedAt ? Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)) : null),
      summary: state === 'conflicting' ? 'Sources reported conflicting lifecycle states at the newest valid observation time.' : safeResult(row.error ?? row.output ?? row.result, state),
      source: safeRuntimeText(row.source, 80) ?? 'Hermes Run status',
      interface: safeRuntimeText(row.interface, 120) ?? '/v1/runs/{run_id}',
    });
  }
  return result.sort((left, right) => (right.lastTransitionAt ?? '').localeCompare(left.lastTransitionAt ?? '') || left.id.localeCompare(right.id));
}

function normalizeSessionRows(raw: unknown): HermesExecutionRun[] {
  if (unavailable(raw) || failed(raw)) return [];
  return array(record(raw).sessions).flatMap((item) => {
    const row = record(item);
    const id = safeIdentity('Session', row.id);
    if (!id) return [];
    const endedAt = timestamp(row.ended_at);
    const endReason = safeRuntimeText(row.end_reason, 48);
    const state = row.is_active === true ? 'active' : endedAt ? lifecycle(endReason ?? 'completed') : 'unknown';
    const startedAt = timestamp(row.started_at);
    const input = count(row.input_tokens);
    const output = count(row.output_tokens);
    return [{
      id, agent: safeIdentity('Profile', row.profile_name ?? row.profile), state,
      currentStep: null, currentTool: null, startedAt,
      lastTransitionAt: timestamp(row.last_active ?? row.ended_at), waitingReason: null,
      retryCount: null, parentRunId: safeIdentity('Session', row.parent_session_id),
      childRunCount: 0, artifactCount: 0, inputTokens: input, outputTokens: output,
      totalTokens: input !== null && output !== null ? input + output : null,
      costUsd: finite(row.actual_cost_usd ?? row.estimated_cost_usd),
      durationMs: startedAt && endedAt ? Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)) : null,
      summary: safeResult(row.end_reason, state),
      source: 'Hermes sessions', interface: '/api/sessions?limit=100&order=recent',
    } satisfies HermesExecutionRun];
  });
}

export function normalizeActiveWorkerRows(raw: unknown, observedAt: string): HermesExecutionRun[] {
  if (unavailable(raw) || failed(raw)) return [];
  const reference = Date.parse(observedAt);
  const byRun = new Map<string, HermesExecutionRun>();
  for (const item of array(record(raw).workers)) {
    const row = record(item);
    const rawRunId = typeof row.run_id === 'number' && Number.isInteger(row.run_id)
      ? String(row.run_id)
      : typeof row.run_id === 'string' && /^\d+$/.test(row.run_id.trim())
        ? row.run_id.trim()
        : null;
    if (!rawRunId) continue;
    const lastTransitionAt = timestamp(row.last_heartbeat_at ?? row.checked_at ?? row.updated_at ?? observedAt);
    if (!lastTransitionAt || !Number.isFinite(reference) || Date.parse(lastTransitionAt) > reference + FUTURE_SKEW_MS) continue;
    const startedAt = timestamp(row.started_at);
    const id = `Run ${rawRunId}`;
    const candidate: HermesExecutionRun = {
      id,
      agent: safeIdentity('Profile', row.profile ?? row.profile_name),
      state: 'active',
      currentStep: safeRuntimeText(row.step_key, 80),
      currentTool: safeRuntimeText(row.current_tool, 80),
      startedAt,
      lastTransitionAt,
      waitingReason: null,
      retryCount: null,
      parentRunId: null,
      childRunCount: 0,
      artifactCount: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      costUsd: null,
      durationMs: startedAt ? Math.max(0, reference - Date.parse(startedAt)) : null,
      summary: null,
      source: 'Hermes active workers',
      interface: '/api/plugins/kanban/workers/active',
      intervention: { category: 'terminate_kanban_run', targetRunId: rawRunId },
    };
    const existing = byRun.get(id);
    if (!existing || (candidate.lastTransitionAt ?? '') > (existing.lastTransitionAt ?? '')) byRun.set(id, candidate);
  }
  return [...byRun.values()].sort((left, right) => (right.lastTransitionAt ?? '').localeCompare(left.lastTransitionAt ?? '') || left.id.localeCompare(right.id));
}

function addRelationships(runs: HermesExecutionRun[]): HermesExecutionRun[] {
  const children = new Map<string, number>();
  for (const run of runs) if (run.parentRunId) children.set(run.parentRunId, (children.get(run.parentRunId) ?? 0) + 1);
  return runs.map((run) => ({ ...run, childRunCount: Math.max(run.childRunCount, children.get(run.id) ?? 0) }));
}

function queueSnapshot(raw: unknown): HermesRuntimeExecutionSnapshot['queue'] {
  if (unavailable(raw)) return { state: 'unavailable', total: 0, counts: {}, summary: failureSummary(raw, 'Hermes queue source is unavailable.') };
  if (failed(raw)) return { state: 'failure', total: 0, counts: {}, summary: failureSummary(raw, 'Hermes queue source failed.') };
  const counts: Record<string, number> = {};
  for (const column of array(record(raw).columns)) {
    const source = record(column);
    const name = safeRuntimeText(source.name, 40)?.toLowerCase();
    if (name) counts[name] = array(source.tasks).length;
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return { state: total ? 'success' : 'connected_empty', total, counts, summary: total ? 'Hermes reported ' + total + ' queued or board tasks.' : 'Hermes queue responded with no tasks.' };
}

function artifactSnapshot(raw: unknown): HermesRuntimeExecutionSnapshot['artifacts'] {
  if (unavailable(raw)) return { state: 'unavailable', total: 0, items: [], summary: failureSummary(raw, 'Hermes artifact source is unavailable.') };
  if (failed(raw)) return { state: 'failure', total: 0, items: [], summary: failureSummary(raw, 'Hermes artifact source failed.') };
  const items = array(record(raw).entries).filter((item) => record(item).is_directory !== true).slice(0, 100).flatMap((item) => {
    const source = record(item);
    const name = safePathIdentity(source.name ?? source.path);
    return name ? [{ name, kind: safeRuntimeText(source.mime_type, 60) ?? 'file', size: count(source.size), observedAt: timestamp(source.mtime) }] : [];
  });
  return { state: items.length ? 'success' : 'connected_empty', total: items.length, items, summary: items.length ? 'Hermes reported ' + items.length + ' safe artifact metadata records.' : 'Hermes artifact source responded with no files.' };
}

function usageSnapshot(raw: unknown): HermesRuntimeExecutionSnapshot['usage'] {
  if (unavailable(raw)) return { state: 'unavailable', inputTokens: null, outputTokens: null, estimatedCostUsd: null, actualCostUsd: null, sessions: null, summary: failureSummary(raw, 'Hermes usage source is unavailable.') };
  if (failed(raw)) return { state: 'failure', inputTokens: null, outputTokens: null, estimatedCostUsd: null, actualCostUsd: null, sessions: null, summary: failureSummary(raw, 'Hermes usage source failed.') };
  const totals = record(record(raw).totals);
  const values = { inputTokens: count(totals.total_input), outputTokens: count(totals.total_output), estimatedCostUsd: finite(totals.total_estimated_cost), actualCostUsd: finite(totals.total_actual_cost), sessions: count(totals.total_sessions) };
  const hasAny = Object.values(values).some((value) => value !== null);
  return { state: hasAny ? 'success' : 'connected_empty', ...values, summary: hasAny ? 'Hermes reported aggregate token and cost usage.' : 'Hermes usage source responded without aggregate usage.' };
}

export function normalizeRuntimeExecution(inputs: RuntimeInputs, observedAt: string): HermesRuntimeExecutionSnapshot {
  const directRuns = normalizeKnownRunRows(inputs.knownRuns ?? { unavailable: true }, observedAt);
  const sessions = normalizeSessionRows(inputs.sessions);
  const workers = inputs.includeWorkerRuns === false ? [] : normalizeActiveWorkerRows(inputs.workers, observedAt);
  const combined = new Map<string, HermesExecutionRun>();
  for (const run of [...directRuns, ...sessions, ...workers]) combined.set(run.id, run);
  const runs = addRelationships([...combined.values()].sort((left, right) => (right.lastTransitionAt ?? '').localeCompare(left.lastTransitionAt ?? '') || left.id.localeCompare(right.id)));
  const workerCount = array(record(inputs.workers).workers).length;
  const waitingCount = runs.filter((run) => run.waitingReason !== null).length;
  const knownUnavailable = inputs.knownRuns === undefined || unavailable(inputs.knownRuns);
  const runsFailed = failed(inputs.knownRuns) || failed(inputs.sessions);
  const runsUnavailable = knownUnavailable && unavailable(inputs.sessions);
  return {
    observedAt,
    runs,
    agents: unavailable(inputs.workers)
      ? { state: 'unavailable', count: 0, summary: failureSummary(inputs.workers, 'Hermes active-agent source is unavailable.') }
      : failed(inputs.workers)
        ? { state: 'failure', count: 0, summary: failureSummary(inputs.workers, 'Hermes active-agent source failed.') }
        : { state: workerCount ? 'success' : 'connected_empty', count: workerCount, summary: workerCount ? 'Hermes reported ' + workerCount + ' active agents.' : 'Hermes active-agent source responded with no workers.' },
    runSource: runsFailed
      ? { state: 'failure', summary: failureSummary(failed(inputs.knownRuns) ? inputs.knownRuns : inputs.sessions, 'Hermes execution source failed.') }
      : runsUnavailable
        ? { state: 'unavailable', summary: 'Hermes execution sources are unavailable.' }
        : { state: runs.length ? 'success' : 'connected_empty', summary: runs.length ? 'Hermes reported ' + runs.length + ' bounded execution records.' : 'Hermes execution sources responded with no records.' },
    queue: queueSnapshot(inputs.board),
    approvals: knownUnavailable
      ? { state: 'unavailable', count: 0, summary: 'The installed runtime has no global pending-input enumeration interface.' }
      : { state: waitingCount ? 'success' : 'connected_empty', count: waitingCount, summary: waitingCount ? 'Hermes reported ' + waitingCount + ' runs waiting for human input.' : 'Known Hermes runs contain no pending human input.' },
    artifacts: artifactSnapshot(inputs.files),
    usage: usageSnapshot(inputs.usage),
  };
}

export function emptyRuntimeExecution(observedAt: string, summary = 'Hermes runtime execution source is unavailable.'): HermesRuntimeExecutionSnapshot {
  const missing = { unavailable: true, error: summary };
  return normalizeRuntimeExecution({ sessions: missing, workers: missing, board: missing, files: missing, usage: missing, knownRuns: missing }, observedAt);
}
