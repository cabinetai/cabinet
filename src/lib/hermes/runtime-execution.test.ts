import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildHermesRuntimeExecutionFixtureProjection, HERMES_RUNTIME_EXECUTION_CAPTURED_AT } from './control-center-runtime-fixture';
import { normalizeActiveWorkerRows, normalizeKnownRunRows, normalizeRuntimeExecution, safeRuntimeText } from './runtime-execution';

const at = HERMES_RUNTIME_EXECUTION_CAPTURED_AT;

test('active worker rows expose one bounded run-specific intervention without worker secrets', () => {
  const rows = normalizeActiveWorkerRows({ workers: [
    { run_id: 17, task_id: 23, profile: 'operator-os', claim_lock: 'secret-claim', worker_pid: 999, task_title: 'customer@example.test', started_at: at, last_heartbeat_at: at },
    { run_id: '17', profile: 'operator-os', last_heartbeat_at: at },
    { run_id: 'not-numeric', profile: 'operator-os', last_heartbeat_at: at },
  ] }, at);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]?.intervention, { category: 'terminate_kanban_run', targetRunId: '17' });
  assert.equal(rows[0]?.source, 'Hermes active workers');
  assert.doesNotMatch(JSON.stringify(rows), /secret-claim|worker_pid|customer@example/);
});

test('normalizes active, queued, blocked, retrying, failed, and completed lifecycle states', () => {
  const runs = normalizeKnownRunRows([
    { run_id: 'a', status: 'running', updated_at: at },
    { run_id: 'q', status: 'queued', updated_at: at },
    { run_id: 'b', status: 'blocked', updated_at: at },
    { run_id: 'r', status: 'retrying', retry_count: 2, updated_at: at },
    { run_id: 'f', status: 'failed', error: 'private failure', updated_at: at },
    { run_id: 'c', status: 'completed', output: 'private result', updated_at: at },
  ], at);
  assert.deepEqual(runs.map((run) => run.state).sort(), ['active', 'blocked', 'completed', 'failed', 'queued', 'retrying']);
  assert.equal(runs.find((run) => run.state === 'failed')?.summary, 'Run failed. A bounded failure summary is available.');
});

test('normalizes every supported waiting reason without exposing pending payloads', () => {
  const reasons = ['approval', 'clarification', 'authentication', 'secret', 'file', 'decision', 'other'];
  const runs = normalizeKnownRunRows(reasons.map((reason) => ({
    run_id: reason, status: 'waiting', waiting_reason: reason, updated_at: at,
    prompt: 'Authorization: Bearer secret', tool_input: { api_key: 'secret' },
  })), at);
  assert.deepEqual(runs.map((run) => run.waitingReason).sort(), ['approval', 'authentication', 'clarification', 'decision', 'file', 'secret', 'unknown']);
  assert.doesNotMatch(JSON.stringify(runs), /Bearer secret|api_key|tool_input|prompt/);
});

test('derives parent and child counts from explicit relationships', () => {
  const snapshot = normalizeRuntimeExecution({
    sessions: { sessions: [] }, workers: { workers: [] }, board: { columns: [] }, files: { entries: [] }, usage: { totals: {} },
    knownRuns: { runs: [
      { run_id: 'parent', status: 'running', updated_at: at },
      { run_id: 'child', status: 'queued', parent_run_id: 'parent', updated_at: at },
    ] },
  }, at);
  assert.equal(snapshot.runs.find((run) => run.id.endsWith('parent'))?.childRunCount, 1);
  assert.match(snapshot.runs.find((run) => run.id.endsWith('child'))?.parentRunId ?? '', /parent/);
});

test('deduplicates by run identity, selects newest valid state, and flags newest ties as conflict', () => {
  const runs = normalizeKnownRunRows([
    { run_id: 'newest', status: 'queued', updated_at: '2026-07-19T22:10:00.000Z' },
    { run_id: 'newest', status: 'running', updated_at: at },
    { run_id: 'conflict', status: 'running', updated_at: at },
    { run_id: 'conflict', status: 'failed', updated_at: at },
    { run_id: 'future', status: 'failed', updated_at: '2026-07-20T10:00:00.000Z' },
  ], at);
  assert.equal(runs.filter((run) => run.id.endsWith('newest')).length, 1);
  assert.equal(runs.find((run) => run.id.endsWith('newest'))?.state, 'active');
  assert.equal(runs.find((run) => run.id.endsWith('conflict'))?.state, 'conflicting');
  assert.equal(runs.some((run) => run.id.endsWith('future')), false);
});

test('keeps connected-empty, unavailable, and bounded failure source states distinct', () => {
  const empty = normalizeRuntimeExecution({ sessions: { sessions: [] }, workers: { workers: [] }, board: { columns: [] }, files: { entries: [] }, usage: { totals: {} }, knownRuns: { runs: [] } }, at);
  assert.equal(empty.runSource.state, 'connected_empty');
  assert.equal(empty.queue.state, 'connected_empty');
  const missing = normalizeRuntimeExecution({ sessions: { unavailable: true }, workers: { unavailable: true }, board: { unavailable: true }, files: { unavailable: true }, usage: { unavailable: true }, knownRuns: { unavailable: true } }, at);
  assert.equal(missing.runSource.state, 'unavailable');
  assert.equal(missing.queue.state, 'unavailable');
  const failure = normalizeRuntimeExecution({ sessions: { failure: true, error: 'Authorization: Bearer secret ' + 'x'.repeat(500) }, workers: { workers: [] }, board: { failure: true, error: 'token=secret' }, files: { entries: [] }, usage: { totals: {} }, knownRuns: { runs: [] } }, at);
  assert.equal(failure.runSource.state, 'failure');
  assert.equal(failure.queue.state, 'failure');
  assert.doesNotMatch(JSON.stringify(failure), /Bearer secret|token=secret/);
});

test('does not infer clean, waiting, cost, tool, or completion from absent fields', () => {
  const run = normalizeKnownRunRows([{ run_id: 'unknown', updated_at: at }], at)[0]!;
  assert.equal(run.state, 'unknown');
  assert.equal(run.waitingReason, null);
  assert.equal(run.currentTool, null);
  assert.equal(run.costUsd, null);
  assert.equal(run.summary, null);
});

test('bounds strings, removes control characters, and redacts credentials and local identity', () => {
  const unsafe = '\u001b[31m/Users/private-owner/.credentials Authorization: Bearer abc api_key=xyz https://example.test/?token=secret\u0000' + 'z'.repeat(1000);
  const safe = safeRuntimeText(unsafe, 160)!;
  assert.ok(safe.length <= 160);
  assert.doesNotMatch(safe, /private-owner|Bearer abc|api_key=xyz|token=secret|\u001b|\u0000/);
});

test('fixture passes through production projection without current-live or live-proven credit', () => {
  const snapshot = buildHermesRuntimeExecutionFixtureProjection({ implementationRevision: '4'.repeat(40), artifactGeneratedAt: at });
  assert.equal(snapshot.capabilities.length, 48);
  assert.equal(new Set(snapshot.capabilities.map((item) => item.id)).size, 48);
  for (const id of ['command-center', 'agents-subagents', 'cron', 'artifacts', 'usage-insights']) {
    const capability = snapshot.capabilities.find((item) => item.id === id)!;
    assert.equal(capability.credit.liveVisibility, false);
    assert.equal(capability.credit.liveProven, false);
    assert.equal(capability.pathProof.proven, true);
  }
  const approvals = snapshot.capabilities.find((item) => item.id === 'approvals')!;
  assert.equal(approvals.credit.liveVisibility, false);
  assert.equal(approvals.pathProof.proven, true);
  assert.equal(approvals.evidence.some((item) => item.proofKind === 'exact_fixture' && item.proofScope === 'exact_fixture_path'), true);
  assert.equal(snapshot.runtimeExecution.runs.some((run) => run.state === 'conflicting'), true);
  assert.equal(snapshot.runtimeExecution.queue.state, 'connected_empty');
});

test('fixture and UI contain no runtime mutation controls or secret-bearing data', () => {
  const snapshot = buildHermesRuntimeExecutionFixtureProjection({ implementationRevision: '4'.repeat(40), artifactGeneratedAt: at });
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /fixture-secret|private-owner|customer@example|Authorization:|api_key/);
  const ui = fs.readFileSync('src/components/hermes/hermes-control-center.tsx', 'utf8');
  assert.doesNotMatch(ui, /hermes-run-(approve|reject|cancel|retry|resume|pause|terminate)/);
  assert.match(ui, /Hermes prepares; Jeremy commits\./);
});

test('accepted Phase 3A machine evidence preserves its frozen runtime facts', () => {
  const evidencePath = 'docs/evidence/hermes-runtime-execution/acceptance-fixture-projection.json';
  const machine = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as ReturnType<typeof buildHermesRuntimeExecutionFixtureProjection>;
  const rebuilt = buildHermesRuntimeExecutionFixtureProjection({
    implementationRevision: machine.evidenceProvenance.implementationRevision,
    artifactGeneratedAt: machine.evidenceProvenance.artifactGeneratedAt,
  });
  assert.deepEqual(machine.runtimeExecution, JSON.parse(JSON.stringify(rebuilt.runtimeExecution)));
  assert.deepEqual(machine.provenance, rebuilt.provenance);
  assert.equal(machine.capabilities.length, 48);
});
