import type { OptaleResourceRecord } from "@/lib/optale/resource-registry";
import type { OptaleActionDefinition } from "@/lib/optale/action-registry";
import type { OptaleActionRunRecord } from "@/lib/optale/action-run-ledger";
import type { OptaleAuditEventRecord } from "@/lib/optale/audit-event-log";
import type { OptaleLineageEdgeRecord } from "@/lib/optale/lineage-edge-table";
import type { OptalePolicyDecisionRecord } from "@/lib/optale/policy-decision-log";
import {
  optaleOagObjectSchemaForType,
  type OptaleOagRelationshipMaterializer,
} from "@/lib/optale/oag-schema";

type EvidenceItem = {
  label: string;
  value: string | number | boolean;
};

export interface OagObjectExplorerFeeds {
  runs: OptaleActionRunRecord[];
  policyDecisions: OptalePolicyDecisionRecord[];
  lineageEdges: OptaleLineageEdgeRecord[];
  auditEvents: OptaleAuditEventRecord[];
}

export interface OagObjectRelatedRecords {
  matchKeys: string[];
  runs: OptaleActionRunRecord[];
  policyDecisions: OptalePolicyDecisionRecord[];
  lineageEdges: OptaleLineageEdgeRecord[];
  auditEvents: OptaleAuditEventRecord[];
}

export interface OagObjectReferenceTarget {
  resourceId: string;
  label: string;
  kind: OptaleResourceRecord["kind"];
  canonicalId?: string;
}

export type OagObjectReferenceIndex = Record<string, OagObjectReferenceTarget>;

export interface OagObjectRelationshipInstance {
  id: string;
  name: string;
  label: string;
  direction: "inbound" | "outbound";
  target: OagObjectReferenceTarget;
  materializedBy: OptaleOagRelationshipMaterializer;
  evidence: EvidenceItem[];
}

export interface OagObjectCommandPrompt {
  field: string;
  label: string;
  placeholder: string;
}

export interface OagObjectCommandDraft {
  executable: boolean;
  buttonLabel: string;
  disabledReason?: string;
  payload?: Record<string, unknown>;
  prompt?: OagObjectCommandPrompt;
  confirmation?: string;
}

function stringValue(value: string | number | boolean | undefined): string {
  if (value === undefined) return "";
  return String(value).trim();
}

function tokenLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function addKey(keys: Set<string>, value: string | number | boolean | undefined) {
  const normalized = stringValue(value);
  if (normalized) keys.add(normalized);
}

function factValue(
  resource: OptaleResourceRecord,
  label: string,
): string | undefined {
  const match = resource.facts.find((fact) => fact.label === label);
  return match ? stringValue(match.value) : undefined;
}

function actionValue(action: OptaleActionDefinition): string {
  return String(action.action);
}

function actionMatchesAny(
  action: OptaleActionDefinition,
  names: Set<string>,
): boolean {
  return names.has(action.id) || names.has(actionValue(action));
}

function conversationIdForResource(resource: OptaleResourceRecord): string | undefined {
  if (resource.kind !== "conversation" || !resource.id.startsWith("conversation:")) {
    return undefined;
  }
  const separator = resource.id.lastIndexOf(":");
  if (separator < 0) return undefined;
  return resource.id.slice(separator + 1) || undefined;
}

function jobIdForResource(resource: OptaleResourceRecord): string | undefined {
  if (resource.kind !== "job" || !resource.id.startsWith("job:")) {
    return undefined;
  }
  const raw = resource.id.slice("job:".length);
  if (!raw) return undefined;
  const scopedSeparator = raw.lastIndexOf("::job::");
  return scopedSeparator >= 0 ? raw.slice(scopedSeparator + "::job::".length) : raw;
}

function taskIdForResource(resource: OptaleResourceRecord): string | undefined {
  if (resource.kind !== "task" || !resource.id.startsWith("task:")) {
    return undefined;
  }
  const separator = resource.id.lastIndexOf(":");
  if (separator < 0) return undefined;
  return resource.id.slice(separator + 1) || undefined;
}

function agentSlugForResource(resource: OptaleResourceRecord): string | undefined {
  return factValue(resource, "Slug") || factValue(resource, "To");
}

function unavailableReason(action: OptaleActionDefinition): string | undefined {
  const availability = action.facts.find(
    (fact) => fact.label === "Availability",
  )?.value;
  if (availability) return String(availability);
  if (action.kind !== "command") {
    return "Agent proposals are created by agents and reviewed by humans.";
  }
  if (action.status !== "available") return action.status;
  return undefined;
}

export function buildOagObjectCommandDraft(
  resource: OptaleResourceRecord,
  action: OptaleActionDefinition,
): OagObjectCommandDraft {
  const disabledReason = unavailableReason(action);
  if (disabledReason) {
    return {
      executable: false,
      buttonLabel: "Unavailable",
      disabledReason,
    };
  }

  const basePayload = {
    action: actionValue(action),
    cabinetPath: resource.cabinetPath || ".",
  };
  const agentSlug = agentSlugForResource(resource);
  const conversationId = conversationIdForResource(resource);
  const jobId = jobIdForResource(resource);
  const taskId = taskIdForResource(resource);

  switch (actionValue(action)) {
    case "launch_conversation":
      return {
        executable: true,
        buttonLabel: "Launch",
        payload: {
          ...basePayload,
          agentSlug: resource.kind === "agent" ? agentSlug : undefined,
        },
        prompt: {
          field: "userMessage",
          label: "Message",
          placeholder: resource.kind === "agent"
            ? `Ask ${resource.label} to...`
            : "Start a governed agent run...",
        },
      };
    case "create_task":
      if (!agentSlug) {
        return {
          executable: false,
          buttonLabel: "Needs target",
          disabledReason: "Select an agent or task object to prefill the target agent.",
        };
      }
      return {
        executable: true,
        buttonLabel: "Create",
        payload: {
          ...basePayload,
          toAgent: agentSlug,
          description: `Created from OAG object ${resource.label} (${resource.id}).`,
        },
        prompt: {
          field: "title",
          label: "Task title",
          placeholder: `Task for ${agentSlug}`,
        },
      };
    case "set_agent_active":
      if (!agentSlug || resource.kind !== "agent") {
        return {
          executable: false,
          buttonLabel: "Needs agent",
          disabledReason: "Select an agent object to change activity.",
        };
      }
      return {
        executable: true,
        buttonLabel: resource.status === "active" ? "Pause" : "Activate",
        payload: {
          ...basePayload,
          agentSlug,
          active: resource.status !== "active",
        },
        confirmation: `${resource.status === "active" ? "Pause" : "Activate"} ${resource.label}?`,
      };
    case "run_job":
      if (!jobId) {
        return {
          executable: false,
          buttonLabel: "Needs job",
          disabledReason: "Select a job object to run it.",
        };
      }
      return {
        executable: true,
        buttonLabel: "Run",
        payload: { ...basePayload, jobId },
        confirmation: `Run ${resource.label} now?`,
      };
    case "toggle_job":
      if (!jobId) {
        return {
          executable: false,
          buttonLabel: "Needs job",
          disabledReason: "Select a job object to toggle it.",
        };
      }
      return {
        executable: true,
        buttonLabel: resource.status === "enabled" ? "Pause" : "Enable",
        payload: { ...basePayload, jobId },
        confirmation: `${resource.status === "enabled" ? "Pause" : "Enable"} ${resource.label}?`,
      };
    case "stop_conversation":
      if (!conversationId) {
        return {
          executable: false,
          buttonLabel: "Needs run",
          disabledReason: "Select a run object to stop it.",
        };
      }
      return {
        executable: true,
        buttonLabel: "Stop",
        payload: { ...basePayload, conversationId },
        confirmation: `Stop ${resource.label}?`,
      };
    case "review_actions":
      if (!conversationId) {
        return {
          executable: false,
          buttonLabel: "Open run",
          disabledReason: "Select a run with pending actions to review approvals.",
        };
      }
      return {
        executable: false,
        buttonLabel: "Review",
        disabledReason: "Open the run approval panel to choose approve or reject.",
      };
    case "update_task":
      if (!agentSlug || !taskId) {
        return {
          executable: false,
          buttonLabel: "Needs task",
          disabledReason: "Select a task object to update it.",
        };
      }
      return {
        executable: false,
        buttonLabel: "Needs status",
        disabledReason: "Task status updates need an explicit target status.",
      };
    default:
      return {
        executable: false,
        buttonLabel: "Unavailable",
        disabledReason: "This action is not wired from object inspection yet.",
      };
  }
}

export function selectOagObjectActions(
  resource: OptaleResourceRecord,
  actions: OptaleActionDefinition[],
): OptaleActionDefinition[] {
  const names = new Set<string>();
  const objectType = resource.oag?.objectType;
  if (objectType) {
    for (const action of optaleOagObjectSchemaForType(objectType).actions) {
      names.add(action);
      names.add(`command:${action}`);
      names.add(`agent-proposal:${action}`);
    }
  }

  const explicitAction = factValue(resource, "Action");
  if (explicitAction) {
    names.add(explicitAction);
    names.add(`command:${explicitAction}`);
    names.add(`agent-proposal:${explicitAction}`);
  }

  if (resource.kind === "space") {
    names.add("launch_conversation");
    names.add("create_task");
    names.add("review_actions");
  }
  if (resource.kind === "agent") {
    names.add("create_task");
    names.add("set_agent_active");
    names.add("LAUNCH_TASK");
    names.add("SCHEDULE_JOB");
    names.add("SCHEDULE_TASK");
  }
  if (resource.kind === "job") {
    names.add("run_job");
    names.add("toggle_job");
  }
  if (resource.kind === "task") {
    names.add("update_task");
  }
  if (resource.kind === "conversation") {
    names.add("stop_conversation");
    names.add("review_actions");
  }
  if (resource.kind === "action_type") {
    names.add(resource.id);
  }

  return actions.filter(
    (action) =>
      actionMatchesAny(action, names) ||
      (objectType !== undefined &&
        action.oagContract?.targetObjectTypes.includes(objectType)),
  );
}

function parseConversationResourceId(
  resourceId: string,
): { cabinetPath: string; conversationId: string } | null {
  if (!resourceId.startsWith("conversation:")) return null;
  const rest = resourceId.slice("conversation:".length);
  const separator = rest.lastIndexOf(":");
  if (separator < 0) return null;
  const cabinetPath = rest.slice(0, separator);
  const conversationId = rest.slice(separator + 1);
  if (!cabinetPath || !conversationId) return null;
  return { cabinetPath, conversationId };
}

function addConversationKeys(
  keys: Set<string>,
  cabinetPath: string | undefined,
  conversationId: string | undefined,
) {
  if (!conversationId) return;
  addKey(keys, conversationId);
  if (cabinetPath) addKey(keys, `conversation:${cabinetPath}:${conversationId}`);
}

export function buildOagObjectMatchKeys(
  resource: OptaleResourceRecord,
): string[] {
  const keys = new Set<string>();
  addKey(keys, resource.id);
  addKey(keys, resource.operationalSpine?.subjectId);

  if (resource.kind === "space") {
    addKey(keys, resource.cabinetPath);
  }

  if (resource.kind === "conversation") {
    const parsed = parseConversationResourceId(resource.id);
    addConversationKeys(
      keys,
      parsed?.cabinetPath || resource.cabinetPath,
      parsed?.conversationId,
    );
  }

  if (resource.kind === "task") {
    addConversationKeys(
      keys,
      resource.cabinetPath,
      factValue(resource, "Conversation"),
    );
  }

  if (resource.kind === "agent") {
    const slug = factValue(resource, "Slug");
    addKey(keys, slug);
    if (slug) addKey(keys, `agent:${slug}`);
  }

  if (resource.kind === "job") {
    const jobId = resource.id.startsWith("job:")
      ? resource.id.slice("job:".length)
      : resource.id;
    addKey(keys, jobId);
    if (resource.cabinetPath) addKey(keys, `job:${resource.cabinetPath}:${jobId}`);
  }

  if (resource.kind === "action_type") {
    const action = factValue(resource, "Action");
    addKey(keys, action);
    if (action) {
      addKey(keys, `command:${action}`);
      addKey(keys, `agent-proposal:${action}`);
      addKey(keys, `action-type:${action}`);
    }
  }

  if (resource.kind === "brain_source" && resource.id.startsWith("brain-source:")) {
    const sourceId = resource.id.slice("brain-source:".length);
    addKey(keys, sourceId);
    addKey(keys, `source:${sourceId}`);
    const mcp = factValue(resource, "MCP");
    addKey(keys, mcp);
  }

  return [...keys];
}

function hasAnyKey(keys: Set<string>, values: Array<string | undefined>) {
  return values.some((value) => value !== undefined && keys.has(value));
}

function evidenceHasKey(evidence: EvidenceItem[], keys: Set<string>): boolean {
  return evidence.some((item) => keys.has(stringValue(item.value)));
}

function referenceTargetForResource(
  resource: OptaleResourceRecord,
): OagObjectReferenceTarget {
  return {
    resourceId: resource.id,
    label: resource.label,
    kind: resource.kind,
    canonicalId: resource.oag?.canonicalId,
  };
}

function addReferenceTarget(
  index: OagObjectReferenceIndex,
  key: string | number | boolean | undefined,
  target: OagObjectReferenceTarget | undefined,
) {
  const normalized = stringValue(key);
  if (!normalized || target === undefined || index[normalized]) return;
  index[normalized] = target;
}

export function resolveOagObjectReference(
  index: OagObjectReferenceIndex,
  candidates: Array<string | number | boolean | undefined>,
): OagObjectReferenceTarget | undefined {
  for (const candidate of candidates) {
    const normalized = stringValue(candidate);
    if (normalized && index[normalized]) return index[normalized];
  }
  return undefined;
}

export function buildOagObjectReferenceIndex(
  resources: OptaleResourceRecord[],
  feeds: Partial<OagObjectExplorerFeeds> = {},
): OagObjectReferenceIndex {
  const index: OagObjectReferenceIndex = {};

  for (const resource of resources) {
    const target = referenceTargetForResource(resource);
    addReferenceTarget(index, resource.id, target);
    addReferenceTarget(index, resource.operationalSpine?.subjectId, target);
    addReferenceTarget(index, resource.oag?.canonicalId, target);
    addReferenceTarget(index, resource.oag?.objectId, target);
    addReferenceTarget(index, resource.oag?.sourceRef, target);
    if (resource.kind === "brain_source" && resource.id.startsWith("brain-source:")) {
      const sourceId = resource.id.slice("brain-source:".length);
      addReferenceTarget(index, sourceId, target);
      addReferenceTarget(index, `source:${sourceId}`, target);
    }
    for (const key of buildOagObjectMatchKeys(resource)) {
      addReferenceTarget(index, key, target);
    }
  }

  for (const run of feeds.runs || []) {
    const runObject = resolveOagObjectReference(index, [
      run.conversationId
        ? `conversation:${run.cabinetPath}:${run.conversationId}`
        : undefined,
      run.conversationId,
    ]);
    addReferenceTarget(index, run.id, runObject);
    addReferenceTarget(index, `action_run:${run.id}`, runObject);
  }

  for (const decision of feeds.policyDecisions || []) {
    const decisionObject = resolveOagObjectReference(index, [
      decision.subjectId,
      decision.actionId,
      decision.conversationId
        ? `conversation:${decision.cabinetPath}:${decision.conversationId}`
        : undefined,
    ]);
    addReferenceTarget(index, decision.id, decisionObject);
    addReferenceTarget(index, `policy_decision:${decision.id}`, decisionObject);
  }

  return index;
}

function sameValue(
  left: string | undefined,
  right: string | number | boolean | undefined,
): boolean {
  if (!left) return false;
  return left.toLowerCase() === stringValue(right).toLowerCase();
}

function sameCabinet(
  left: string | undefined,
  right: string | undefined,
): boolean {
  return (left || ".") === (right || ".");
}

function relationshipId(input: {
  resourceId: string;
  name: string;
  direction: "inbound" | "outbound";
  targetId: string;
}): string {
  return [
    "relationship",
    input.resourceId,
    input.name,
    input.direction,
    input.targetId,
  ].join(":");
}

function addRelationshipInstance(
  instances: OagObjectRelationshipInstance[],
  seen: Set<string>,
  input: Omit<OagObjectRelationshipInstance, "id"> & {
    resourceId: string;
  },
) {
  if (input.target.resourceId === input.resourceId) return;
  const id = relationshipId({
    resourceId: input.resourceId,
    name: input.name,
    direction: input.direction,
    targetId: input.target.resourceId,
  });
  if (seen.has(id)) return;
  seen.add(id);
  instances.push({
    id,
    name: input.name,
    label: input.label,
    direction: input.direction,
    target: input.target,
    materializedBy: input.materializedBy,
    evidence: input.evidence,
  });
}

function targetForResource(
  resource: OptaleResourceRecord,
): OagObjectReferenceTarget {
  return {
    resourceId: resource.id,
    label: resource.label,
    kind: resource.kind,
    canonicalId: resource.oag?.canonicalId,
  };
}

function findPolicyResource(
  resources: OptaleResourceRecord[],
  cabinetPath: string | undefined,
): OptaleResourceRecord | undefined {
  return resources.find(
    (resource) =>
      resource.kind === "mcp_policy" &&
      sameCabinet(resource.cabinetPath, cabinetPath),
  );
}

function resolveResourceTarget(
  index: OagObjectReferenceIndex,
  candidates: Array<string | number | boolean | undefined>,
): OagObjectReferenceTarget | undefined {
  return resolveOagObjectReference(index, candidates);
}

function relationshipLabel(name: string): string {
  return tokenLabel(name);
}

function evidenceValues(evidence: EvidenceItem[], label: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const item of evidence) {
    if (item.label !== label) continue;
    const value = stringValue(item.value);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function evidenceItemsForLabels(
  evidence: EvidenceItem[],
  labels: string[],
  limit = 6,
): EvidenceItem[] {
  const labelSet = new Set(labels);
  return evidence.filter((item) => labelSet.has(item.label)).slice(0, limit);
}

function addRunSourceTarget(
  targets: Map<string, OagObjectReferenceTarget>,
  target: OagObjectReferenceTarget | undefined,
) {
  if (!target || target.kind !== "brain_source") return;
  targets.set(target.resourceId, target);
}

function runSourceTargets(
  run: OptaleActionRunRecord,
  resources: OptaleResourceRecord[],
  index: OagObjectReferenceIndex,
): OagObjectReferenceTarget[] {
  const targets = new Map<string, OagObjectReferenceTarget>();
  const sourceValues = [
    ...evidenceValues(run.evidence, "Source"),
    ...evidenceValues(run.evidence, "Tool Source"),
  ];

  for (const value of sourceValues) {
    const sourceId = value.replace(/^brain-source:/, "");
    addRunSourceTarget(
      targets,
      resolveResourceTarget(index, [
        value,
        sourceId,
        `brain-source:${sourceId}`,
        `source:${sourceId}`,
      ]),
    );
  }

  for (const value of evidenceValues(run.evidence, "MCP Server")) {
    const serverId = value.replace(/^mcp-server:/, "");
    for (const candidate of resources) {
      if (
        candidate.kind === "brain_source" &&
        sameValue(serverId, factValue(candidate, "MCP"))
      ) {
        addRunSourceTarget(targets, targetForResource(candidate));
      }
    }
  }

  for (const value of evidenceValues(run.evidence, "MCP Source")) {
    const serverId = value.replace(/^mcp-server:/, "");
    for (const candidate of resources) {
      if (
        candidate.kind === "brain_source" &&
        sameValue(serverId, factValue(candidate, "MCP"))
      ) {
        addRunSourceTarget(targets, targetForResource(candidate));
      }
    }
  }

  if (
    targets.size === 0 &&
    evidenceValues(run.evidence, "Source Path").length > 0
  ) {
    addRunSourceTarget(
      targets,
      resolveResourceTarget(index, ["brain-source:vault", "vault", "source:vault"]),
    );
  }

  return [...targets.values()];
}

function runSourceRelationshipEvidence(run: OptaleActionRunRecord): EvidenceItem[] {
  return [
    { label: "Action Run", value: run.id },
    ...evidenceItemsForLabels(run.evidence, [
      "Source",
      "Source Path Count",
      "Source Path",
      "MCP Server",
      "MCP Source",
      "MCP Source Path Count",
      "MCP Source Path",
      "MCP Source Title",
      "MCP Source Type",
      "Tool Source",
    ]),
  ];
}

export function selectOagObjectRelationshipInstances(
  resource: OptaleResourceRecord,
  resources: OptaleResourceRecord[],
  feeds: Partial<OagObjectExplorerFeeds> = {},
): OagObjectRelationshipInstance[] {
  const instances: OagObjectRelationshipInstance[] = [];
  const seen = new Set<string>();
  const index = buildOagObjectReferenceIndex(resources, feeds);
  const add = (
    name: string,
    target: OagObjectReferenceTarget | undefined,
    materializedBy: OptaleOagRelationshipMaterializer,
    evidence: EvidenceItem[],
    direction: "inbound" | "outbound" = "outbound",
  ) =>
    target &&
    addRelationshipInstance(instances, seen, {
      resourceId: resource.id,
      name,
      label: relationshipLabel(name),
      direction,
      target,
      materializedBy,
      evidence,
    });

  const agentSlug = factValue(resource, "Slug");
  const actionName = factValue(resource, "Action");
  const sourceMcp = factValue(resource, "MCP");

  if (resource.kind === "agent" && agentSlug) {
    for (const candidate of resources) {
      if (candidate.kind === "job" && sameValue(agentSlug, factValue(candidate, "Owner"))) {
        add("owns_jobs", targetForResource(candidate), "resource_fact", [
          { label: "Owner", value: agentSlug },
        ]);
      }
      if (candidate.kind === "task" && sameValue(agentSlug, factValue(candidate, "To"))) {
        add("assigned_tasks", targetForResource(candidate), "resource_fact", [
          { label: "To", value: agentSlug },
        ]);
      }
      if (
        candidate.kind === "conversation" &&
        sameValue(agentSlug, factValue(candidate, "Agent"))
      ) {
        add("produces_runs", targetForResource(candidate), "resource_fact", [
          { label: "Agent", value: agentSlug },
        ]);
      }
    }
    for (const run of feeds.runs || []) {
      if (!sameValue(agentSlug, run.agentSlug)) continue;
      add(
        "produces_runs",
        resolveResourceTarget(index, [
          run.conversationId
            ? `conversation:${run.cabinetPath}:${run.conversationId}`
            : undefined,
          run.conversationId,
          run.id,
        ]),
        "lineage",
        [{ label: "Action Run", value: run.id }],
      );
    }
  }

  if (resource.kind === "job") {
    const owner = factValue(resource, "Owner");
    add(
      "owned_by",
      resolveResourceTarget(index, [owner, owner ? `agent:${owner}` : undefined]),
      "resource_fact",
      owner ? [{ label: "Owner", value: owner }] : [],
    );
  }

  if (resource.kind === "task") {
    const toAgent = factValue(resource, "To");
    const conversationId = factValue(resource, "Conversation");
    add(
      "assigned_to",
      resolveResourceTarget(index, [
        toAgent,
        toAgent ? `agent:${toAgent}` : undefined,
      ]),
      "resource_fact",
      toAgent ? [{ label: "To", value: toAgent }] : [],
    );
    add(
      "linked_run",
      resolveResourceTarget(index, [
        conversationId
          ? `conversation:${resource.cabinetPath || "."}:${conversationId}`
          : undefined,
        conversationId,
      ]),
      "resource_fact",
      conversationId ? [{ label: "Conversation", value: conversationId }] : [],
    );
  }

  if (resource.kind === "conversation") {
    const parsed = parseConversationResourceId(resource.id);
    const conversationId = parsed?.conversationId;
    const matchingRuns = (feeds.runs || []).filter(
      (candidate) =>
        sameValue(conversationId, candidate.conversationId) &&
        sameCabinet(resource.cabinetPath, candidate.cabinetPath),
    );
    const run =
      matchingRuns.find((candidate) => candidate.source === "conversation") ||
      matchingRuns[0];
    const agent = factValue(resource, "Agent") || run?.agentSlug;
    const policy = findPolicyResource(resources, resource.cabinetPath);
    const decisions = (feeds.policyDecisions || []).filter((decision) =>
      sameValue(conversationId, decision.conversationId),
    );

    add(
      "executed_by",
      resolveResourceTarget(index, [
        agent,
        agent ? `agent:${agent}` : undefined,
      ]),
      "resource_fact",
      agent ? [{ label: "Agent", value: agent }] : [],
    );
    add(
      "invokes_action",
      resolveResourceTarget(index, [run?.actionId, run?.action]),
      "lineage",
      run ? [{ label: "Action Run", value: run.id }] : [],
    );
    for (const sourceRun of matchingRuns) {
      for (const target of runSourceTargets(sourceRun, resources, index)) {
        add(
          "uses_source",
          target,
          "lineage",
          runSourceRelationshipEvidence(sourceRun),
        );
      }
    }
    if (policy && decisions.length > 0) {
      add("checked_by_policy", targetForResource(policy), "lineage", [
        { label: "Policy Decisions", value: decisions.length },
      ]);
    }
  }

  if (resource.kind === "brain_source" && sourceMcp) {
    add(
      "served_by",
      resolveResourceTarget(index, [
        `mcp-server:${sourceMcp}`,
        sourceMcp.replace(/^mcp-server:/, ""),
        sourceMcp,
      ]),
      "resource_fact",
      [{ label: "MCP", value: sourceMcp }],
    );
  }

  if (resource.kind === "brain_source") {
    for (const run of feeds.runs || []) {
      const usesThisSource = runSourceTargets(run, resources, index).some(
        (target) => target.resourceId === resource.id,
      );
      if (!usesThisSource) continue;
      add(
        "used_by_runs",
        resolveResourceTarget(index, [
          run.conversationId
            ? `conversation:${run.cabinetPath}:${run.conversationId}`
            : undefined,
          run.conversationId,
          run.id,
        ]),
        "lineage",
        runSourceRelationshipEvidence(run),
        "inbound",
      );
    }
  }

  if (resource.kind === "mcp_server") {
    for (const candidate of resources) {
      if (
        candidate.kind === "brain_source" &&
        sameValue(resource.id.replace(/^mcp-server:/, ""), factValue(candidate, "MCP"))
      ) {
        add("serves_sources", targetForResource(candidate), "resource_fact", [
          { label: "MCP", value: resource.id },
        ]);
      }
    }
  }

  if (resource.kind === "mcp_client") {
    const policy = findPolicyResource(resources, resource.cabinetPath);
    add(
      "governed_by",
      policy ? targetForResource(policy) : undefined,
      "resource_fact",
      [{ label: "Cabinet", value: resource.cabinetPath || "." }],
    );
  }

  if (resource.kind === "mcp_policy") {
    for (const candidate of resources) {
      if (
        candidate.kind === "mcp_client" &&
        sameCabinet(candidate.cabinetPath, resource.cabinetPath)
      ) {
        add("governs_clients", targetForResource(candidate), "resource_fact", [
          { label: "Cabinet", value: resource.cabinetPath || "." },
        ]);
      }
    }
  }

  if (resource.kind === "action_type" && actionName) {
    for (const run of feeds.runs || []) {
      if (
        !sameValue(resource.id, run.actionId) &&
        !sameValue(actionName, run.action)
      ) {
        continue;
      }
      add(
        "invoked_by_runs",
        resolveResourceTarget(index, [
          run.conversationId
            ? `conversation:${run.cabinetPath}:${run.conversationId}`
            : undefined,
          run.conversationId,
          run.id,
        ]),
        "lineage",
        [{ label: "Action Run", value: run.id }],
        "inbound",
      );
    }
  }

  return instances.sort((left, right) => {
    if (left.name !== right.name) return left.name.localeCompare(right.name);
    return left.target.label.localeCompare(right.target.label);
  });
}

function matchesScopedCabinet(
  resource: OptaleResourceRecord,
  cabinetPath: string,
): boolean {
  return resource.kind === "space" && resource.cabinetPath === cabinetPath;
}

function runMatchesObject(
  resource: OptaleResourceRecord,
  run: OptaleActionRunRecord,
  keys: Set<string>,
): boolean {
  if (matchesScopedCabinet(resource, run.cabinetPath)) return true;
  return (
    hasAnyKey(keys, [
      run.id,
      run.actionId,
      String(run.action),
      run.conversationId,
      run.agentSlug,
      run.agentSlug ? `agent:${run.agentSlug}` : undefined,
    ]) || evidenceHasKey(run.evidence, keys)
  );
}

function policyDecisionMatchesObject(input: {
  resource: OptaleResourceRecord;
  decision: OptalePolicyDecisionRecord;
  keys: Set<string>;
  runIds: Set<string>;
}): boolean {
  const { resource, decision, keys, runIds } = input;
  if (matchesScopedCabinet(resource, decision.cabinetPath)) return true;
  if (runIds.has(decision.subjectId)) return true;
  return (
    hasAnyKey(keys, [
      decision.id,
      decision.subjectId,
      decision.actionId,
      String(decision.action),
      decision.conversationId,
      decision.actor,
      decision.actor ? `agent:${decision.actor}` : undefined,
    ]) || evidenceHasKey(decision.evidence, keys)
  );
}

function lineageEdgeMatchesObject(input: {
  resource: OptaleResourceRecord;
  edge: OptaleLineageEdgeRecord;
  keys: Set<string>;
  runIds: Set<string>;
  policyDecisionIds: Set<string>;
}): boolean {
  const { resource, edge, keys, runIds, policyDecisionIds } = input;
  if (matchesScopedCabinet(resource, edge.cabinetPath)) return true;
  if (edge.runId && runIds.has(edge.runId)) return true;
  if (edge.policyDecisionId && policyDecisionIds.has(edge.policyDecisionId)) {
    return true;
  }
  return (
    hasAnyKey(keys, [
      edge.id,
      edge.runId,
      edge.policyDecisionId,
      edge.source.id,
      edge.target.id,
    ]) || evidenceHasKey(edge.evidence, keys)
  );
}

function auditEventMatchesObject(input: {
  resource: OptaleResourceRecord;
  event: OptaleAuditEventRecord;
  keys: Set<string>;
  runIds: Set<string>;
  policyDecisionIds: Set<string>;
  lineageEdgeIds: Set<string>;
}): boolean {
  const { resource, event, keys, runIds, policyDecisionIds, lineageEdgeIds } =
    input;
  if (matchesScopedCabinet(resource, event.cabinetPath)) return true;
  if (event.subjectType === "action_run" && runIds.has(event.subjectId)) {
    return true;
  }
  if (
    event.subjectType === "policy_decision" &&
    policyDecisionIds.has(event.subjectId)
  ) {
    return true;
  }
  if (event.subjectType === "lineage_edge" && lineageEdgeIds.has(event.subjectId)) {
    return true;
  }
  return (
    hasAnyKey(keys, [
      event.id,
      event.subjectId,
      event.conversationId,
      event.action,
      event.actor,
      event.actor ? `agent:${event.actor}` : undefined,
    ]) || evidenceHasKey(event.evidence, keys)
  );
}

export function selectRelatedOagRecords(
  resource: OptaleResourceRecord,
  feeds: OagObjectExplorerFeeds,
): OagObjectRelatedRecords {
  const keys = new Set(buildOagObjectMatchKeys(resource));
  const runs = feeds.runs.filter((run) => runMatchesObject(resource, run, keys));
  const runIds = new Set(runs.map((run) => run.id));
  const policyDecisions = feeds.policyDecisions.filter((decision) =>
    policyDecisionMatchesObject({ resource, decision, keys, runIds }),
  );
  const policyDecisionIds = new Set(
    policyDecisions.map((decision) => decision.id),
  );
  const lineageEdges = feeds.lineageEdges.filter((edge) =>
    lineageEdgeMatchesObject({
      resource,
      edge,
      keys,
      runIds,
      policyDecisionIds,
    }),
  );
  const lineageEdgeIds = new Set(lineageEdges.map((edge) => edge.id));
  const auditEvents = feeds.auditEvents.filter((event) =>
    auditEventMatchesObject({
      resource,
      event,
      keys,
      runIds,
      policyDecisionIds,
      lineageEdgeIds,
    }),
  );

  return {
    matchKeys: [...keys],
    runs,
    policyDecisions,
    lineageEdges,
    auditEvents,
  };
}
