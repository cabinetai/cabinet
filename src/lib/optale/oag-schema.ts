import type { OptaleOagObjectType } from "@/lib/optale/oag-object-identity";

export type OptaleOagFieldKind =
  | "boolean"
  | "datetime"
  | "enum"
  | "id"
  | "number"
  | "path"
  | "reference"
  | "string";

export type OptaleOagFieldSource =
  | "derived"
  | "fact"
  | "identity"
  | "runtime";

export type OptaleOagRelationshipMaterializer =
  | "lineage"
  | "operational_spine"
  | "resource_fact"
  | "runtime";

export type OptaleOagActionApproval =
  | "none"
  | "prompt"
  | "confirmation"
  | "human_review";

export interface OptaleOagFieldSchema {
  name: string;
  label: string;
  kind: OptaleOagFieldKind;
  required: boolean;
  source: OptaleOagFieldSource;
  description: string;
  enumValues?: string[];
  references?: OptaleOagObjectType[];
}

export interface OptaleOagRelationshipSchema {
  name: string;
  label: string;
  direction: "inbound" | "outbound";
  cardinality: "one" | "many";
  targetTypes: OptaleOagObjectType[];
  materializedBy: OptaleOagRelationshipMaterializer;
  description: string;
}

export interface OptaleOagActionContract {
  action: string;
  label: string;
  targetObjectTypes: OptaleOagObjectType[];
  inputRefs: string[];
  resultObjectTypes: OptaleOagObjectType[];
  approval: OptaleOagActionApproval;
  description: string;
}

export interface OptaleOagObjectTypeSchema {
  ontologyVersion: "oag-v0";
  schemaRef: string;
  objectType: OptaleOagObjectType;
  label: string;
  description: string;
  category: "action" | "execution" | "governance" | "knowledge" | "work";
  primaryKey: string;
  displayField: string;
  sourceSystems: string[];
  fields: OptaleOagFieldSchema[];
  relationships: OptaleOagRelationshipSchema[];
  actions: string[];
}

export interface OptaleOagObjectSchemaProjection {
  ontologyVersion: "oag-v0";
  schemaRef: string;
  objectType: OptaleOagObjectType;
  label: string;
  description: string;
  category: OptaleOagObjectTypeSchema["category"];
  primaryKey: string;
  displayField: string;
  fieldCount: number;
  relationshipCount: number;
  actionCount: number;
  sourceSystems: string[];
}

const IDENTITY_FIELDS: OptaleOagFieldSchema[] = [
  {
    name: "canonicalId",
    label: "Canonical ID",
    kind: "id",
    required: true,
    source: "identity",
    description: "Stable OAG identifier used across Command, agents, lineage, and policy.",
  },
  {
    name: "objectId",
    label: "Object ID",
    kind: "id",
    required: true,
    source: "identity",
    description: "Source object identifier before OAG canonicalization.",
  },
  {
    name: "sourceSystem",
    label: "Source System",
    kind: "enum",
    required: true,
    source: "identity",
    description: "System that produced the object projection.",
    enumValues: ["cabinet", "agent-harness", "brain", "mcp", "command-center"],
  },
  {
    name: "scope",
    label: "Scope",
    kind: "enum",
    required: true,
    source: "identity",
    description: "Capability and memory scope for the object.",
    enumValues: ["personal", "company", "system"],
  },
  {
    name: "visibility",
    label: "Visibility",
    kind: "enum",
    required: true,
    source: "identity",
    description: "Read boundary used by operator and partner builds.",
    enumValues: ["private", "tenant_scoped", "operator_only"],
  },
  {
    name: "memoryLane",
    label: "Memory Lane",
    kind: "enum",
    required: true,
    source: "identity",
    description: "Memory lane that may receive derived object context.",
    enumValues: ["operator_company_brain", "partner_scoped_memory"],
  },
];

function field(
  name: string,
  label: string,
  kind: OptaleOagFieldKind,
  source: OptaleOagFieldSource,
  description: string,
  options: Partial<Pick<OptaleOagFieldSchema, "enumValues" | "references" | "required">> = {},
): OptaleOagFieldSchema {
  return {
    name,
    label,
    kind,
    source,
    description,
    required: options.required ?? false,
    enumValues: options.enumValues,
    references: options.references,
  };
}

function relationship(
  name: string,
  label: string,
  targetTypes: OptaleOagObjectType[],
  materializedBy: OptaleOagRelationshipMaterializer,
  description: string,
  options: Partial<Pick<OptaleOagRelationshipSchema, "cardinality" | "direction">> = {},
): OptaleOagRelationshipSchema {
  return {
    name,
    label,
    targetTypes,
    materializedBy,
    description,
    direction: options.direction ?? "outbound",
    cardinality: options.cardinality ?? "many",
  };
}

function schema(input: Omit<OptaleOagObjectTypeSchema, "ontologyVersion" | "schemaRef">): OptaleOagObjectTypeSchema {
  return {
    ontologyVersion: "oag-v0",
    schemaRef: optaleOagSchemaRefForObjectType(input.objectType),
    ...input,
    fields: [...IDENTITY_FIELDS, ...input.fields],
  };
}

export function optaleOagSchemaRefForObjectType(
  objectType: OptaleOagObjectType,
): string {
  return `oag.schema.${objectType}.v0`;
}

export const OPTALE_OAG_ACTION_CONTRACTS: Record<
  string,
  OptaleOagActionContract
> = {
  launch_conversation: {
    action: "launch_conversation",
    label: "Launch Conversation",
    targetObjectTypes: ["Space", "Agent"],
    inputRefs: ["agentSlug", "userMessage", "cabinetPath"],
    resultObjectTypes: ["Run"],
    approval: "prompt",
    description: "Start a governed agent run from a space or target agent.",
  },
  create_task: {
    action: "create_task",
    label: "Create Task",
    targetObjectTypes: ["Space", "Agent"],
    inputRefs: ["toAgent", "title", "description", "cabinetPath"],
    resultObjectTypes: ["Task"],
    approval: "prompt",
    description: "Create a delegated task bound to a target agent and space.",
  },
  update_task: {
    action: "update_task",
    label: "Update Task",
    targetObjectTypes: ["Task"],
    inputRefs: ["agent", "taskId", "status", "cabinetPath"],
    resultObjectTypes: ["Task"],
    approval: "confirmation",
    description: "Move a task through its lifecycle with explicit status intent.",
  },
  set_agent_active: {
    action: "set_agent_active",
    label: "Set Agent Active",
    targetObjectTypes: ["Agent"],
    inputRefs: ["agentSlug", "active", "cabinetPath"],
    resultObjectTypes: ["Agent"],
    approval: "confirmation",
    description: "Enable or pause an agent persona.",
  },
  run_job: {
    action: "run_job",
    label: "Run Job",
    targetObjectTypes: ["Job"],
    inputRefs: ["jobId", "cabinetPath"],
    resultObjectTypes: ["Run"],
    approval: "confirmation",
    description: "Run a scheduled job immediately and record lineage.",
  },
  toggle_job: {
    action: "toggle_job",
    label: "Toggle Job",
    targetObjectTypes: ["Job"],
    inputRefs: ["jobId", "cabinetPath"],
    resultObjectTypes: ["Job"],
    approval: "confirmation",
    description: "Enable or pause a scheduled job.",
  },
  stop_conversation: {
    action: "stop_conversation",
    label: "Stop Conversation",
    targetObjectTypes: ["Run"],
    inputRefs: ["conversationId", "cabinetPath"],
    resultObjectTypes: ["Run"],
    approval: "confirmation",
    description: "Stop a running agent conversation.",
  },
  review_actions: {
    action: "review_actions",
    label: "Review Actions",
    targetObjectTypes: ["Run"],
    inputRefs: ["conversationId", "approve", "reject", "cabinetPath"],
    resultObjectTypes: ["Run", "ActionType"],
    approval: "human_review",
    description: "Approve or reject pending agent-proposed actions.",
  },
  LAUNCH_TASK: {
    action: "LAUNCH_TASK",
    label: "Launch Task",
    targetObjectTypes: ["Agent"],
    inputRefs: ["agent", "title", "prompt"],
    resultObjectTypes: ["Task", "Run"],
    approval: "human_review",
    description: "Agent proposal for a child task assigned to another agent.",
  },
  SCHEDULE_JOB: {
    action: "SCHEDULE_JOB",
    label: "Schedule Job",
    targetObjectTypes: ["Agent"],
    inputRefs: ["agent", "name", "schedule", "prompt"],
    resultObjectTypes: ["Job"],
    approval: "human_review",
    description: "Agent proposal for a recurring job.",
  },
  SCHEDULE_TASK: {
    action: "SCHEDULE_TASK",
    label: "Schedule Task",
    targetObjectTypes: ["Agent"],
    inputRefs: ["agent", "when", "title", "prompt"],
    resultObjectTypes: ["Task"],
    approval: "human_review",
    description: "Agent proposal for a one-shot future task.",
  },
};

export const OPTALE_OAG_OBJECT_SCHEMAS: Record<
  OptaleOagObjectType,
  OptaleOagObjectTypeSchema
> = {
  Space: schema({
    objectType: "Space",
    label: "Space",
    description: "A Cabinet workspace boundary with scope, memory, and capability policy.",
    category: "work",
    primaryKey: "canonicalId",
    displayField: "label",
    sourceSystems: ["cabinet"],
    fields: [
      field("path", "Path", "path", "fact", "Cabinet path for this space.", {
        required: true,
      }),
      field("depth", "Depth", "number", "fact", "Depth in the Cabinet tree."),
    ],
    relationships: [
      relationship(
        "contains_objects",
        "Contains Objects",
        ["Agent", "Job", "Task", "Run", "Source", "ToolClient", "Policy", "ActionType"],
        "operational_spine",
        "Objects scoped to the same Cabinet path.",
      ),
    ],
    actions: ["launch_conversation", "create_task", "review_actions"],
  }),
  Agent: schema({
    objectType: "Agent",
    label: "Agent",
    description: "A governed agent persona that can receive tasks, run jobs, and propose actions.",
    category: "execution",
    primaryKey: "canonicalId",
    displayField: "label",
    sourceSystems: ["agent-harness"],
    fields: [
      field("slug", "Slug", "string", "fact", "Stable agent slug.", {
        required: true,
      }),
      field("active", "Active", "boolean", "runtime", "Whether the persona is enabled."),
      field("jobCount", "Jobs", "number", "fact", "Projected job count."),
      field("taskCount", "Tasks", "number", "fact", "Projected task count."),
    ],
    relationships: [
      relationship("owns_jobs", "Owns Jobs", ["Job"], "resource_fact", "Jobs owned by this agent."),
      relationship("assigned_tasks", "Assigned Tasks", ["Task"], "resource_fact", "Tasks delegated to this agent."),
      relationship("produces_runs", "Produces Runs", ["Run"], "lineage", "Runs executed by this agent."),
    ],
    actions: [
      "create_task",
      "set_agent_active",
      "LAUNCH_TASK",
      "SCHEDULE_JOB",
      "SCHEDULE_TASK",
    ],
  }),
  Job: schema({
    objectType: "Job",
    label: "Job",
    description: "A scheduled agent job with owner, cadence, and execution state.",
    category: "execution",
    primaryKey: "canonicalId",
    displayField: "label",
    sourceSystems: ["agent-harness"],
    fields: [
      field("schedule", "Schedule", "string", "fact", "Human-readable schedule or cron."),
      field("owner", "Owner", "reference", "fact", "Owning agent.", {
        references: ["Agent"],
      }),
      field("enabled", "Enabled", "boolean", "runtime", "Whether the job is enabled."),
    ],
    relationships: [
      relationship("owned_by", "Owned By", ["Agent"], "resource_fact", "Agent that owns the job.", {
        cardinality: "one",
      }),
      relationship("produces_runs", "Produces Runs", ["Run"], "lineage", "Runs created by this job."),
    ],
    actions: ["run_job", "toggle_job"],
  }),
  Task: schema({
    objectType: "Task",
    label: "Task",
    description: "A delegated unit of agent work with status, priority, and optional linked run.",
    category: "work",
    primaryKey: "canonicalId",
    displayField: "label",
    sourceSystems: ["agent-harness"],
    fields: [
      field("toAgent", "To Agent", "reference", "fact", "Assigned agent.", {
        references: ["Agent"],
        required: true,
      }),
      field("fromAgent", "From Agent", "string", "fact", "Submitting actor or agent."),
      field("priority", "Priority", "number", "fact", "Task priority."),
      field("status", "Status", "enum", "runtime", "Task lifecycle status.", {
        enumValues: ["pending", "in_progress", "completed", "failed"],
      }),
    ],
    relationships: [
      relationship("assigned_to", "Assigned To", ["Agent"], "resource_fact", "Target agent for this task.", {
        cardinality: "one",
      }),
      relationship("linked_run", "Linked Run", ["Run"], "resource_fact", "Conversation/run connected to this task.", {
        cardinality: "one",
      }),
    ],
    actions: ["update_task"],
  }),
  Run: schema({
    objectType: "Run",
    label: "Run",
    description: "An agent conversation or action execution with status, artifacts, and lineage.",
    category: "execution",
    primaryKey: "canonicalId",
    displayField: "label",
    sourceSystems: ["agent-harness", "command-center"],
    fields: [
      field("agentSlug", "Agent", "reference", "fact", "Agent that executed the run.", {
        references: ["Agent"],
      }),
      field("trigger", "Trigger", "enum", "fact", "Run trigger source."),
      field("startedAt", "Started", "datetime", "fact", "Run start time."),
      field("status", "Status", "enum", "runtime", "Run lifecycle status."),
    ],
    relationships: [
      relationship("executed_by", "Executed By", ["Agent"], "resource_fact", "Agent that executed this run.", {
        cardinality: "one",
      }),
      relationship("invokes_action", "Invokes Action", ["ActionType"], "lineage", "Command action represented by this run."),
      relationship("uses_source", "Uses Source", ["Source"], "lineage", "Sources cited or used by this run."),
      relationship("checked_by_policy", "Checked By Policy", ["Policy"], "lineage", "Policy decisions attached to this run."),
    ],
    actions: ["stop_conversation", "review_actions"],
  }),
  Source: schema({
    objectType: "Source",
    label: "Source",
    description: "A knowledge, memory, document, or graph source available to Command.",
    category: "knowledge",
    primaryKey: "canonicalId",
    displayField: "label",
    sourceSystems: ["brain"],
    fields: [
      field("kind", "Kind", "enum", "fact", "Source kind."),
      field("scopes", "Scopes", "string", "fact", "Readable scopes."),
      field("mcpServer", "MCP Server", "reference", "fact", "Tool server backing this source.", {
        references: ["ToolServer"],
      }),
    ],
    relationships: [
      relationship("served_by", "Served By", ["ToolServer"], "resource_fact", "Tool server that serves the source.", {
        cardinality: "one",
      }),
      relationship("used_by_runs", "Used By Runs", ["Run"], "lineage", "Runs that used this source.", {
        direction: "inbound",
      }),
    ],
    actions: ["launch_conversation"],
  }),
  ToolServer: schema({
    objectType: "ToolServer",
    label: "Tool Server",
    description: "A governed MCP/tool server exposed through Command.",
    category: "governance",
    primaryKey: "canonicalId",
    displayField: "label",
    sourceSystems: ["mcp"],
    fields: [
      field("scopes", "Scopes", "string", "fact", "Server capability scopes."),
      field("status", "Status", "enum", "runtime", "Server configuration status."),
    ],
    relationships: [
      relationship("has_clients", "Has Clients", ["ToolClient"], "runtime", "Clients configured for this server."),
      relationship("serves_sources", "Serves Sources", ["Source"], "resource_fact", "Sources exposed through this server."),
    ],
    actions: [],
  }),
  ToolClient: schema({
    objectType: "ToolClient",
    label: "Tool Client",
    description: "A scoped tool client with permissions, budgets, and remote action policy.",
    category: "governance",
    primaryKey: "canonicalId",
    displayField: "label",
    sourceSystems: ["mcp"],
    fields: [
      field("permissions", "Permissions", "string", "fact", "Allowed client permissions."),
      field("lockCabinet", "Lock Cabinet", "boolean", "fact", "Whether the client is locked to a cabinet."),
      field("remoteActionsEnabled", "Remote Actions", "boolean", "fact", "Whether remote actions are enabled."),
    ],
    relationships: [
      relationship("governed_by", "Governed By", ["Policy"], "resource_fact", "Policy governing this client.", {
        cardinality: "one",
      }),
      relationship("uses_server", "Uses Server", ["ToolServer"], "runtime", "Server used by this client.", {
        cardinality: "one",
      }),
    ],
    actions: [],
  }),
  Policy: schema({
    objectType: "Policy",
    label: "Policy",
    description: "A policy surface that gates MCP, command, and remote-action behavior.",
    category: "governance",
    primaryKey: "canonicalId",
    displayField: "label",
    sourceSystems: ["mcp", "command-center"],
    fields: [
      field("defaultDecision", "Default", "enum", "fact", "Default allow/deny decision."),
      field("enforcementMode", "Mode", "enum", "runtime", "Policy enforcement mode."),
      field("source", "Source", "string", "fact", "Policy source."),
    ],
    relationships: [
      relationship("governs_clients", "Governs Clients", ["ToolClient"], "resource_fact", "Tool clients governed by this policy."),
      relationship("governs_actions", "Governs Actions", ["ActionType"], "lineage", "Actions evaluated by this policy."),
    ],
    actions: ["review_actions"],
  }),
  ActionType: schema({
    objectType: "ActionType",
    label: "Action Type",
    description: "A governed command or agent-proposed action contract.",
    category: "action",
    primaryKey: "canonicalId",
    displayField: "label",
    sourceSystems: ["command-center", "agent-harness"],
    fields: [
      field("action", "Action", "string", "fact", "Executable or proposal action name.", {
        required: true,
      }),
      field("risk", "Risk", "enum", "runtime", "Action risk class."),
      field("inputs", "Inputs", "number", "fact", "Number of declared inputs."),
      field("approval", "Approval", "enum", "runtime", "Approval policy for this action."),
    ],
    relationships: [
      relationship("targets_objects", "Targets Objects", ["Space", "Agent", "Job", "Task", "Run"], "runtime", "Object types accepted by this action."),
      relationship("invoked_by_runs", "Invoked By Runs", ["Run"], "lineage", "Runs that invoked this action.", {
        direction: "inbound",
      }),
      relationship("produces_objects", "Produces Objects", ["Task", "Job", "Run"], "lineage", "Object types produced by this action."),
      relationship("checked_by_policy", "Checked By Policy", ["Policy"], "lineage", "Policy checks applied to this action."),
    ],
    actions: ["launch_conversation", "create_task", "review_actions"],
  }),
};

export function optaleOagObjectSchemaForType(
  objectType: OptaleOagObjectType,
): OptaleOagObjectTypeSchema {
  return OPTALE_OAG_OBJECT_SCHEMAS[objectType];
}

export function optaleOagObjectSchemaProjectionForType(
  objectType: OptaleOagObjectType,
): OptaleOagObjectSchemaProjection {
  const objectSchema = optaleOagObjectSchemaForType(objectType);
  return {
    ontologyVersion: objectSchema.ontologyVersion,
    schemaRef: objectSchema.schemaRef,
    objectType: objectSchema.objectType,
    label: objectSchema.label,
    description: objectSchema.description,
    category: objectSchema.category,
    primaryKey: objectSchema.primaryKey,
    displayField: objectSchema.displayField,
    fieldCount: objectSchema.fields.length,
    relationshipCount: objectSchema.relationships.length,
    actionCount: objectSchema.actions.length,
    sourceSystems: objectSchema.sourceSystems,
  };
}

export function optaleOagActionContractForAction(
  action: string,
): OptaleOagActionContract | undefined {
  return OPTALE_OAG_ACTION_CONTRACTS[action];
}

export function optaleOagActionContractsForObjectType(
  objectType: OptaleOagObjectType,
): OptaleOagActionContract[] {
  return Object.values(OPTALE_OAG_ACTION_CONTRACTS).filter((contract) =>
    contract.targetObjectTypes.includes(objectType),
  );
}
