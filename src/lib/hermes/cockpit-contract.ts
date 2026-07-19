import { createHash } from "node:crypto";
import {
  COCKPIT_CARD_KINDS,
  type CockpitApprovalState,
  type CockpitCard,
  type CockpitCardKind,
  type CockpitEvidence,
  type CockpitIntakeSnapshot,
  type CockpitManualRisk,
  type CockpitPotentialMiss,
  type CockpitSourceCoverage,
  type CockpitSourceKind,
  type CockpitSourceStatus,
  type CockpitUrgency,
  type CockpitRunSummary,
} from "./cockpit-types";

const SOURCE_KINDS = new Set<CockpitSourceKind>(["gmail", "calendar", "hermes_job", "manual_risk", "hermes_run", "memory"]);
const SOURCE_STATUSES = new Set<CockpitSourceStatus>(["connected", "connected_empty", "partial", "unavailable", "error"]);
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
function texts(value: unknown, limit = 20): string[] { return array(value).map((item) => text(item)).filter(Boolean).slice(0, limit); }
function stableId(...parts: string[]): string { return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 20); }

function jsonPayload(output: string): unknown {
  const trimmed = output.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  try { return JSON.parse(candidate); } catch {}
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const objectCandidate = candidate.slice(start, end + 1);
    try { return JSON.parse(objectCandidate); } catch (error) {
      // Hermes occasionally closes the rankingRationale string with an extra
      // array delimiter before the schema's evidence field. Repair only that
      // exact impossible sequence, then require the full object to parse.
      const repaired = objectCandidate
        .replace(
          /("rankingRationale"\s*:\s*"(?:\\.|[^"\\])*")\]\s*,\s*("evidence"\s*:)/g,
          "$1,$2"
        )
        .replace(
          /"(cards|potentiallyMissed|relatedItemDates|missingFacts|contextNotes|evidence)"\s*\[/g,
          '"$1":['
        )
        .replace(
          /"(cards|potentiallyMissed|relatedItemDates|missingFacts|contextNotes|evidence)\[/g,
          '"$1":['
        );
      if (repaired === objectCandidate) throw error;
      return JSON.parse(repaired);
    }
  }
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
    relatedItemCount: Math.max(1, integer(source.relatedItemCount ?? source.related_item_count)),
    relatedItemDates: texts(source.relatedItemDates ?? source.related_item_dates, 20).map((item) => date(item)).filter((item): item is string => item !== null),
    missingFacts: texts(source.missingFacts ?? source.missing_facts, 20),
    contextNotes: texts(source.contextNotes ?? source.context_notes, 20),
    rankingRationale: text(source.rankingRationale ?? source.ranking_rationale, "This item was promoted by Hermes based on urgency, business impact, and required operator judgment."),
  };
}

function potentialMiss(value: unknown, generatedAt: string): CockpitPotentialMiss | null {
  const source = record(value);
  const title = text(source.title);
  const sourceType = text(source.sourceType ?? source.source_type) as CockpitSourceKind;
  const sourceId = text(source.sourceId ?? source.source_id);
  if (!title || !SOURCE_KINDS.has(sourceType) || !sourceId) return null;
  return {
    id: stableId("potential-miss", sourceType, sourceId),
    title,
    sourceType,
    sourceId,
    whyPotentiallyMissed: text(source.whyPotentiallyMissed ?? source.why_potentially_missed, "This item was reviewed but not promoted to a decision card."),
    reviewQuestion: text(source.reviewQuestion ?? source.review_question, "Should this have been promoted?"),
    evidence: array(source.evidence).map(evidence).filter((item): item is CockpitEvidence => item !== null).slice(0, 12),
    createdAt: date(source.createdAt ?? source.created_at) ?? generatedAt,
  };
}

export function parseCockpitIntake(output: string, runId: string, now = new Date()): CockpitIntakeSnapshot {
  const source = record(jsonPayload(output));
  const reportedAt = date(source.generatedAt ?? source.generated_at);
  const generatedAt = reportedAt && Math.abs(new Date(reportedAt).getTime() - now.getTime()) <= 15 * 60_000
    ? reportedAt
    : now.toISOString();
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
    potentiallyMissed: array(source.potentiallyMissed ?? source.potentially_missed).map((item) => potentialMiss(item, generatedAt)).filter((item): item is CockpitPotentialMiss => item !== null).slice(0, 100),
  };
}

export function buildIntakePrompt(input: {
  now: string;
  timezone: string;
  manualRisks: CockpitManualRisk[];
  jobs: Array<{ id: string; name: string; enabled: boolean; lastRunAt: string | null; lastError: string | null }>;
  recentRuns: CockpitRunSummary[];
  ownerPotentialMisses?: CockpitPotentialMiss[];
}): string {
  return `You are running the read-only Daily Business Intake for Jeremy. The local time is ${input.now} in ${input.timezone}.

Inspect only read-only sources available through Hermes: Gmail requiring Jeremy's attention, the next seven days of Calendar, Hermes job outcomes, recent Hermes run outcomes, the supplied manual risks, and relevant Supermemory context. Do not send, modify, schedule, approve, reject, or otherwise write to an external system. Surface decisions and exceptions, not raw inboxes or logs.

Freshness is mandatory. Gmail and Calendar status must come from a live read operation in THIS run. Never label either source connected by reusing prior run output, cached snippets, session history, or supplied recentRuns. If a live operation fails authentication or otherwise fails, use status error and describe the failure without exposing credentials. Use connected_empty only when a live operation succeeds and returns zero relevant records. Use unavailable only when the capability is absent. Older evidence may appear only in potentiallyMissed with an explicit stale-evidence warning.

The authenticated Google Workspace CLI is named \`gws\` and is available to Hermes through the enabled Terminal toolset. Never inspect credential files, tokens, keyrings, or OAuth client configuration. For Gmail, use only read operations under \`gws gmail users messages list/get\`, scoped to \`userId=me\`. Review enough recent unread, important, compliance, account-change, billing, inventory, and security-notice metadata/snippets to rank the inbox rather than querying only \`is:important\`. Compliance deadlines, account cancellation/closure verification, inventory alerts, and unexpected login/install notices must either become a card or appear in potentiallyMissed. Group messages about the same company/account and obligation into one card; include relatedItemCount, all related message dates, and missingFacts such as amount or due date when absent. If a source states that a fee was charged, preserve that verified fact in the card summary or contextNotes; when the fee type or amount is absent, list each absent detail in missingFacts. Group related security notices into one verification item and suppress expected setup only when evidence proves it expected.

Run each \`gws\` read directly and inspect its returned JSON. Do not pipe, redirect, interpolate, or feed \`gws\` output into Python, Node, jq, shell loops, or any other command or interpreter. If a bounded direct read is too large, issue multiple smaller direct \`gws\` reads. A read-only intake must not request a governed shell approval merely to reshape Google Workspace output.

For Calendar, use only \`gws calendar events list\` against the primary calendar from the start of today through the next seven days in ${input.timezone}, expand single events, and order by start time. For recurring events, inspect the recurring-series identity and every nearby pending occurrence. State whether RSVP scope is one occurrence or the series when the API evidence establishes it; otherwise add it to missingFacts. Include missing agenda, description, meeting link, location, or preparation context in contextNotes/missingFacts.

Never use send, modify, insert, update, delete, trash, batchModify, or any other write method. Do not put message bodies, credentials, tokens, private raw payloads, or meeting links in the output. Keep only decision summaries and stable non-secret source references.

Every open manual risk must remain a business_risk card until explicitly resolved. Search only the active operator-os Supermemory scope for the overdue tax/accounting risk. Report whether that deliberate memory exists; do not infer it from archived sessions or recentRuns. The supplied manual risk is canonical and must remain the only record of this risk. Never recommend creating, copying, duplicating, or storing a Supermemory entry for it now or later, even after more facts are confirmed. Its recommendedNextStep, missingFacts, and contextNotes must keep remediation inside the canonical manual risk.

For every promoted card, provide rankingRationale explaining briefly why it outranked other unread or time-sensitive items. Put reviewed but unpromoted candidates in potentiallyMissed so shadow-mode ranking failures remain visible.

Manual risks:
${JSON.stringify(input.manualRisks)}

Hermes jobs:
${JSON.stringify(input.jobs)}

Recent Hermes runs:
${JSON.stringify(input.recentRuns)}

Open owner-reported potentially missed items. A live source check must either promote each item to a card, keep it in potentiallyMissed with current status, or state that its source could not be checked:
${JSON.stringify(input.ownerPotentialMisses ?? [])}

Return exactly one syntactically valid JSON object and no prose before or after it. Before responding, verify that every object and array closes with the matching delimiter and that the full response parses as JSON. Use this schema:
{"generatedAt":"ISO-8601","sourceCoverage":{"gmail":{"status":"connected|connected_empty|partial|unavailable|error","message":"...","evidenceCount":0},"calendar":{"status":"...","message":"...","evidenceCount":0},"hermesJobs":{"status":"...","message":"...","evidenceCount":0},"manualRisks":{"status":"...","message":"...","evidenceCount":0},"supermemory":{"status":"...","message":"...","evidenceCount":0}},"cards":[{"kind":"needs_jeremy|business_risk|todays_mission|recent_win","title":"...","summary":"...","whyItMatters":"...","recommendedNextStep":"...","urgency":"critical|high|normal|low","sourceType":"gmail|calendar|hermes_job|manual_risk|hermes_run|memory","sourceId":"stable grouped source identity","createdAt":"ISO-8601","relatedItemCount":1,"relatedItemDates":["ISO-8601"],"missingFacts":["fact absent from source"],"contextNotes":["recurrence or grouping context"],"rankingRationale":"why this outranked other reviewed items","evidence":[{"source":"gmail|calendar|hermes_job|manual_risk|hermes_run|memory","label":"...","reference":"non-secret source reference","occurredAt":"ISO-8601 or null"}],"approval":{"state":"not_required|pending|approved|rejected","runId":null,"requestId":null}}],"potentiallyMissed":[{"title":"reviewed candidate","sourceType":"gmail|calendar|hermes_job|manual_risk|hermes_run|memory","sourceId":"stable source identity","whyPotentiallyMissed":"why it was not promoted or why evidence is stale","reviewQuestion":"what Jeremy should verify","createdAt":"ISO-8601","evidence":[]}]}`;
}
