import type { CabinetVisibilityMode } from "@/types/cabinets";
import {
  buildOptaleActionRunLedger,
  readOptaleActionRunLedger,
  type OptaleActionRunEvidence,
  type OptaleActionRunLedger,
  type OptaleActionRunRecord,
} from "@/lib/optale/action-run-ledger";
import {
  buildOptalePolicyDecisionLog,
  type OptalePolicyDecisionLog,
  type OptalePolicyDecisionRecord,
} from "@/lib/optale/policy-decision-log";
import {
  buildOptaleOperationalSpineBinding,
  buildOptaleOperationalSpineSummary,
  type OptaleOperationalSpineBinding,
  type OptaleOperationalSpineSummary,
} from "@/lib/optale/operational-spine";

export type OptaleLineageNodeKind =
  | "conversation"
  | "action_type"
  | "action_run"
  | "policy_decision"
  | "agent"
  | "job";

export type OptaleLineageEdgeKind =
  | "produces_run"
  | "invokes"
  | "produces_decision"
  | "targets_agent"
  | "created_child_run"
  | "created_job";

export interface OptaleLineageNodeRef {
  kind: OptaleLineageNodeKind;
  id: string;
  label: string;
  cabinetPath?: string;
  href?: string;
}

export interface OptaleLineageEdgeEvidence {
  label: string;
  value: string | number | boolean;
}

export interface OptaleLineageEdgeRecord {
  id: string;
  kind: OptaleLineageEdgeKind;
  source: OptaleLineageNodeRef;
  target: OptaleLineageNodeRef;
  cabinetPath: string;
  createdAt: string;
  runId?: string;
  policyDecisionId?: string;
  evidence: OptaleLineageEdgeEvidence[];
  operationalSpine: OptaleOperationalSpineBinding;
}

export interface OptaleLineageEdgeTable {
  generatedAt: string;
  cabinetPath: string;
  visibilityMode: CabinetVisibilityMode;
  edges: OptaleLineageEdgeRecord[];
  counts: {
    edges: number;
    byKind: Record<OptaleLineageEdgeKind, number>;
  };
  operationalSpine: OptaleOperationalSpineSummary;
}

const LINEAGE_EDGE_KINDS: OptaleLineageEdgeKind[] = [
  "produces_run",
  "invokes",
  "produces_decision",
  "targets_agent",
  "created_child_run",
  "created_job",
];

function compactEvidence(
  evidence: Array<OptaleLineageEdgeEvidence | false | null | undefined>,
): OptaleLineageEdgeEvidence[] {
  return evidence.filter((item): item is OptaleLineageEdgeEvidence =>
    Boolean(item),
  );
}

function conversationHref(cabinetPath: string, conversationId: string): string {
  const encodedId = encodeURIComponent(conversationId);
  if (cabinetPath === ".") return `#/tasks/${encodedId}`;
  return `#/cabinet/${encodeURIComponent(cabinetPath)}/tasks/${encodedId}`;
}

function evidenceValue(
  evidence: OptaleActionRunEvidence[],
  label: string,
): string | undefined {
  const match = evidence.find((item) => item.label === label);
  if (match === undefined) return undefined;
  const value = String(match.value).trim();
  return value || undefined;
}

function lineageEdgeSpine(input: {
  id: string;
  cabinetPath: string;
}): OptaleOperationalSpineBinding {
  return buildOptaleOperationalSpineBinding({
    subjectType: "lineage_edge",
    subjectId: input.id,
    cabinetPath: input.cabinetPath,
    capabilityStatus: {
      audit_event: "active",
      lineage_edge: "active",
      policy_decision: "reserved",
    },
  });
}

function actionRunNode(run: OptaleActionRunRecord): OptaleLineageNodeRef {
  return {
    kind: "action_run",
    id: run.id,
    label: run.label,
    cabinetPath: run.cabinetPath,
    href: run.href,
  };
}

function actionTypeNode(run: OptaleActionRunRecord): OptaleLineageNodeRef {
  return {
    kind: "action_type",
    id: run.actionId,
    label: run.label,
    cabinetPath: run.cabinetPath,
  };
}

function conversationNode(input: {
  cabinetPath: string;
  conversationId: string;
  href?: string;
}): OptaleLineageNodeRef {
  return {
    kind: "conversation",
    id: `conversation:${input.cabinetPath}:${input.conversationId}`,
    label: input.conversationId,
    cabinetPath: input.cabinetPath,
    href:
      input.href || conversationHref(input.cabinetPath, input.conversationId),
  };
}

function agentNode(input: {
  cabinetPath: string;
  agentSlug: string;
}): OptaleLineageNodeRef {
  return {
    kind: "agent",
    id: `agent:${input.agentSlug}`,
    label: input.agentSlug,
    cabinetPath: input.cabinetPath,
  };
}

function jobNode(input: {
  cabinetPath: string;
  jobId: string;
}): OptaleLineageNodeRef {
  return {
    kind: "job",
    id: `job:${input.cabinetPath}:${input.jobId}`,
    label: input.jobId,
    cabinetPath: input.cabinetPath,
  };
}

function policyDecisionNode(
  decision: OptalePolicyDecisionRecord,
): OptaleLineageNodeRef {
  return {
    kind: "policy_decision",
    id: decision.id,
    label: decision.outcome.replace("_", " "),
    cabinetPath: decision.cabinetPath,
    href: decision.href,
  };
}

function edgeId(input: {
  kind: OptaleLineageEdgeKind;
  source: OptaleLineageNodeRef;
  target: OptaleLineageNodeRef;
}): string {
  return `${input.kind}:${input.source.kind}:${input.source.id}->${input.target.kind}:${input.target.id}`;
}

function buildEdge(input: {
  kind: OptaleLineageEdgeKind;
  source: OptaleLineageNodeRef;
  target: OptaleLineageNodeRef;
  cabinetPath: string;
  createdAt: string;
  runId?: string;
  policyDecisionId?: string;
  evidence?: OptaleLineageEdgeEvidence[];
}): OptaleLineageEdgeRecord {
  const id = edgeId(input);
  return {
    id,
    kind: input.kind,
    source: input.source,
    target: input.target,
    cabinetPath: input.cabinetPath,
    createdAt: input.createdAt,
    runId: input.runId,
    policyDecisionId: input.policyDecisionId,
    evidence: input.evidence || [],
    operationalSpine: lineageEdgeSpine({ id, cabinetPath: input.cabinetPath }),
  };
}

function sortLineageEdges(
  edges: OptaleLineageEdgeRecord[],
): OptaleLineageEdgeRecord[] {
  return [...edges].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime() || 0;
    const rightTime = new Date(right.createdAt).getTime() || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.id.localeCompare(right.id);
  });
}

function lineageCounts(
  edges: OptaleLineageEdgeRecord[],
): OptaleLineageEdgeTable["counts"] {
  const byKind = Object.fromEntries(
    LINEAGE_EDGE_KINDS.map((kind) => [kind, 0]),
  ) as Record<OptaleLineageEdgeKind, number>;

  for (const edge of edges) {
    byKind[edge.kind] += 1;
  }

  return {
    edges: edges.length,
    byKind,
  };
}

function runEdges(run: OptaleActionRunRecord): OptaleLineageEdgeRecord[] {
  const edges: OptaleLineageEdgeRecord[] = [];
  const runNode = actionRunNode(run);
  const createdAt = run.updatedAt || run.createdAt;

  if (run.conversationId) {
    edges.push(
      buildEdge({
        kind: "produces_run",
        source: conversationNode({
          cabinetPath: run.cabinetPath,
          conversationId: run.conversationId,
          href: run.href,
        }),
        target: runNode,
        cabinetPath: run.cabinetPath,
        createdAt: run.createdAt,
        runId: run.id,
        evidence: compactEvidence([
          { label: "Conversation", value: run.conversationId },
          { label: "Run Status", value: run.status },
        ]),
      }),
    );
  }

  edges.push(
    buildEdge({
      kind: "invokes",
      source: actionTypeNode(run),
      target: runNode,
      cabinetPath: run.cabinetPath,
      createdAt,
      runId: run.id,
      evidence: compactEvidence([
        { label: "Action", value: run.label },
        { label: "Source", value: run.source },
      ]),
    }),
  );

  if (run.agentSlug) {
    edges.push(
      buildEdge({
        kind: "targets_agent",
        source: runNode,
        target: agentNode({
          cabinetPath: run.cabinetPath,
          agentSlug: run.agentSlug,
        }),
        cabinetPath: run.cabinetPath,
        createdAt,
        runId: run.id,
        evidence: compactEvidence([
          { label: "Agent", value: run.agentSlug },
          { label: "Run Status", value: run.status },
        ]),
      }),
    );
  }

  const childRunId = evidenceValue(run.evidence, "Child Run");
  if (childRunId) {
    edges.push(
      buildEdge({
        kind: "created_child_run",
        source: runNode,
        target: conversationNode({
          cabinetPath: run.cabinetPath,
          conversationId: childRunId,
        }),
        cabinetPath: run.cabinetPath,
        createdAt,
        runId: run.id,
        evidence: compactEvidence([
          { label: "Child Run", value: childRunId },
          { label: "Run Status", value: run.status },
        ]),
      }),
    );
  }

  const jobId = evidenceValue(run.evidence, "Job");
  if (jobId) {
    edges.push(
      buildEdge({
        kind: "created_job",
        source: runNode,
        target: jobNode({ cabinetPath: run.cabinetPath, jobId }),
        cabinetPath: run.cabinetPath,
        createdAt,
        runId: run.id,
        evidence: compactEvidence([
          { label: "Job", value: jobId },
          { label: "Run Status", value: run.status },
        ]),
      }),
    );
  }

  return edges;
}

function policyDecisionEdge(input: {
  decision: OptalePolicyDecisionRecord;
  run?: OptaleActionRunRecord;
}): OptaleLineageEdgeRecord {
  const { decision, run } = input;
  return buildEdge({
    kind: "produces_decision",
    source: run
      ? actionRunNode(run)
      : {
          kind: "action_run",
          id: decision.subjectId,
          label: decision.subjectId,
          cabinetPath: decision.cabinetPath,
          href: decision.href,
        },
    target: policyDecisionNode(decision),
    cabinetPath: decision.cabinetPath,
    createdAt: decision.evaluatedAt,
    runId: decision.subjectId,
    policyDecisionId: decision.id,
    evidence: compactEvidence([
      { label: "Outcome", value: decision.outcome },
      { label: "Reason", value: decision.reasonCode },
    ]),
  });
}

export function buildOptaleLineageEdgeTable(input: {
  ledger: OptaleActionRunLedger;
  policyLog: OptalePolicyDecisionLog;
  limit?: number;
}): OptaleLineageEdgeTable {
  const runById = new Map(input.ledger.runs.map((run) => [run.id, run]));
  const projected = [
    ...input.ledger.runs.flatMap((run) => runEdges(run)),
    ...input.policyLog.decisions.map((decision) =>
      policyDecisionEdge({
        decision,
        run: runById.get(decision.subjectId),
      }),
    ),
  ];
  const sorted = sortLineageEdges(projected);
  const limited = input.limit ? sorted.slice(0, input.limit) : sorted;
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    cabinetPath: input.ledger.cabinetPath,
    visibilityMode: input.ledger.visibilityMode,
    edges: limited,
    counts: lineageCounts(limited),
    operationalSpine: buildOptaleOperationalSpineSummary({
      generatedAt,
      cabinetPath: input.ledger.cabinetPath,
      bindings: limited.map((edge) => edge.operationalSpine),
    }),
  };
}

export async function readOptaleLineageEdgeTable(
  input: {
    cabinetPath?: string;
    visibilityMode?: CabinetVisibilityMode;
    limit?: number;
  } = {},
): Promise<OptaleLineageEdgeTable> {
  const projectionLimit = Math.max(input.limit || 100, 100);
  const ledger = await readOptaleActionRunLedger({
    cabinetPath: input.cabinetPath,
    visibilityMode: input.visibilityMode,
    limit: projectionLimit,
  });
  const policyLog = buildOptalePolicyDecisionLog({
    ledger,
    limit: projectionLimit,
  });

  return buildOptaleLineageEdgeTable({
    ledger,
    policyLog,
    limit: input.limit,
  });
}

export function buildOptaleLineageEdgeTableFromCommandCenter(input: {
  commandCenter: Parameters<
    typeof buildOptaleActionRunLedger
  >[0]["commandCenter"];
  limit?: number;
}): OptaleLineageEdgeTable {
  const projectionLimit = input.limit ? Math.max(input.limit, 100) : undefined;
  const ledger = buildOptaleActionRunLedger({
    commandCenter: input.commandCenter,
    limit: projectionLimit,
  });
  const policyLog = buildOptalePolicyDecisionLog({
    ledger,
    limit: projectionLimit,
  });

  return buildOptaleLineageEdgeTable({
    ledger,
    policyLog,
    limit: input.limit,
  });
}
