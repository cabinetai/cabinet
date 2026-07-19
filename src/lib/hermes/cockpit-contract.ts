import { createHash } from "node:crypto";
import {
  COCKPIT_CARD_KINDS,
  type CockpitApprovalState,
  type CockpitCard,
  type CockpitCardKind,
  type CockpitEvidence,
  type CockpitIntakeSnapshot,
  type CockpitManualRisk,
  type CockpitSourceCoverage,
  type CockpitSourceKind,
  type CockpitSourceStatus,
  type CockpitUrgency,
  type CockpitRunSummary,
} from "./cockpit-types";

const SOURCE_KINDS = new Set<CockpitSourceKind>(["gmail", "calendar", "hermes_job", "manual_risk", "hermes_run", "memory"]);
const SOURCE_STATUSES = new Set<CockpitSourceStatus>(["connected", "partial", "unavailable", "error"]);
const URGENCIES = new Set<CockpitUrgency>(["critical", "high", "normal", "low"]);
const APPROVALS = new Set<CockpitApprovalState>(["not_required", "pending", "approved", "rejected"]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown, fallback = ""): string { return typeof value === "string" && value.trim() ? value.trim().slice(0, 2_000) : fallback; }
function date(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function integer(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0; }
function stableId(...parts: string[]): string { return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 20); }

function jsonPayload(output: string): unknown {
  const trimmed = output.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  try { return JSON.parse(candidate); } catch {}
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
  throw new Error("Hermes intake output did not contain a JSON object.");
}

function coverageItem(value: unknown, fallbackMessage: string): CockpitSourceCoverage["gmail"] {
  const source = record(value);
  const candidate = text(source.status) as CockpitSourceStatus;
  return {
    status: SOURCE_STATUSES.has(candidate) ? candidate : "unavailable",
    message: text(source.message, fallbackMessage),
    evidenceCount: integer(source.evidenceCount ?? source.evidence_count),
  };
}

function evidence(value: unknown): CockpitEvidence | null {
  const source = record(value);
  const sourceType = text(source.source) as CockpitSourceKind;
  const label = text(source.label);
  const reference = text(source.reference);
  if (!SOURCE_KINDS.has(sourceType) || !label || !reference) return null;
  return { source: sourceType, label, reference, occurredAt: date(source.occurredAt ?? source.occurred_at) };
}

function card(value: unknown, generatedAt: string): CockpitCard | null {
  const source = record(value);
  const kind = text(source.kind) as CockpitCardKind;
  const title = text(source.title);
  const sourceType = text(source.sourceType ?? source.source_type) as CockpitSourceKind;
  const sourceId = text(source.sourceId ?? source.source_id);
  if (!COCKPIT_CARD_KINDS.includes(kind) || !title || !SOURCE_KINDS.has(sourceType) || !sourceId) return null;
  const approvalSource = record(source.approval);
  const approvalState = text(approvalSource.state, "not_required") as CockpitApprovalState;
  const urgency = text(source.urgency, "normal") as CockpitUrgency;
  return {
    id: stableId(kind, sourceType, sourceId),
    kind,
    title,
    summary: text(source.summary, title),
    whyItMatters: text(source.whyItMatters ?? source.why_it_matters, "Review the attached evidence before deciding."),
    recommendedNextStep: text(source.recommendedNextStep ?? source.recommended_next_step, "Review and choose the next action."),
    urgency: URGENCIES.has(urgency) ? urgency : "normal",
    sourceType,
    sourceId,
    evidence: array(source.evidence).map(evidence).filter((item): item is CockpitEvidence => item !== null).slice(0, 12),
    approval: {
      state: APPROVALS.has(approvalState) ? approvalState : "not_required",
      runId: text(approvalSource.runId ?? approvalSource.run_id) || null,
      requestId: text(approvalSource.requestId ?? approvalSource.request_id) || null,
    },
    createdAt: date(source.createdAt ?? source.created_at) ?? generatedAt,
    snoozedUntil: null,
    comments: [],
  };
}

export function parseCockpitIntake(output: string, runId: string, now = new Date()): CockpitIntakeSnapshot {
  const source = record(jsonPayload(output));
  const generatedAt = date(source.generatedAt ?? source.generated_at) ?? now.toISOString();
  const coverage = record(source.sourceCoverage ?? source.source_coverage);
  return {
    schemaVersion: 1,
    runId,
    generatedAt,
    sourceCoverage: {
      gmail: coverageItem(coverage.gmail, "Gmail was not inspected by this run."),
      calendar: coverageItem(coverage.calendar, "Calendar was not inspected by this run."),
      hermesJobs: coverageItem(coverage.hermesJobs ?? coverage.hermes_jobs, "No Hermes job evidence was inspected."),
      manualRisks: coverageItem(coverage.manualRisks ?? coverage.manual_risks, "No manual risks were supplied."),
      supermemory: coverageItem(coverage.supermemory, "Supermemory evidence was not inspected."),
    },
    cards: array(source.cards).map((item) => card(item, generatedAt)).filter((item): item is CockpitCard => item !== null).slice(0, 100),
  };
}

export function buildIntakePrompt(input: {
  now: string;
  timezone: string;
  manualRisks: CockpitManualRisk[];
  jobs: Array<{ id: string; name: string; enabled: boolean; lastRunAt: string | null; lastError: string | null }>;
  recentRuns: CockpitRunSummary[];
}): string {
  return `You are running the read-only Daily Business Intake for Jeremy. The local time is ${input.now} in ${input.timezone}.

Inspect only read-only sources available through Hermes: important Gmail requiring Jeremy's attention, today's and tomorrow's calendar, Hermes job outcomes, recent Hermes run outcomes, the supplied manual risks, and relevant Supermemory context. Do not send, modify, schedule, approve, reject, or otherwise write to an external system. If Gmail or Calendar is unavailable, record that source as unavailable instead of inventing data. Surface decisions and exceptions, not raw inboxes or logs.

The authenticated Google Workspace CLI is named \`gws\` and is available to Hermes through the enabled Terminal toolset. For Gmail, use only read operations under \`gws gmail users messages list/get\`, scoped to \`userId=me\`, important recent messages, and metadata needed to decide whether Jeremy must act. For Calendar, use only \`gws calendar events list\` against the primary calendar from the start of today through the end of tomorrow in ${input.timezone}, with single events ordered by start time. Never use send, modify, insert, update, delete, trash, batchModify, or any other write method. Do not put message bodies, credentials, tokens, or private raw payloads in the output. Keep only decision summaries and stable non-secret source references.

Manual risks:
${JSON.stringify(input.manualRisks)}

Hermes jobs:
${JSON.stringify(input.jobs)}

Recent Hermes runs:
${JSON.stringify(input.recentRuns)}

Return exactly one JSON object and no prose. Use this schema:
{"generatedAt":"ISO-8601","sourceCoverage":{"gmail":{"status":"connected|partial|unavailable|error","message":"...","evidenceCount":0},"calendar":{"status":"...","message":"...","evidenceCount":0},"hermesJobs":{"status":"...","message":"...","evidenceCount":0},"manualRisks":{"status":"...","message":"...","evidenceCount":0},"supermemory":{"status":"...","message":"...","evidenceCount":0}},"cards":[{"kind":"needs_jeremy|business_risk|todays_mission|recent_win","title":"...","summary":"...","whyItMatters":"...","recommendedNextStep":"...","urgency":"critical|high|normal|low","sourceType":"gmail|calendar|hermes_job|manual_risk|hermes_run|memory","sourceId":"stable source identity","createdAt":"ISO-8601","evidence":[{"source":"gmail|calendar|hermes_job|manual_risk|hermes_run|memory","label":"...","reference":"non-secret source reference","occurredAt":"ISO-8601 or null"}],"approval":{"state":"not_required|pending|approved|rejected","runId":null,"requestId":null}}]}`;
}
