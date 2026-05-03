export type OptaleOperationalSpineSubjectType =
  | "resource"
  | "action_type"
  | "action_queue"
  | "action_run"
  | "policy_decision"
  | "lineage_edge";

export type OptaleOperationalSpineCapability =
  | "audit_event"
  | "lineage_edge"
  | "policy_decision"
  | "eval_run"
  | "model_usage"
  | "branch_review";

export type OptaleOperationalSpineCapabilityStatus =
  | "reserved"
  | "planned"
  | "active";

export type OptaleOperationalFutureSurface =
  | "oag_object_sets"
  | "bridge_funnel"
  | "document_intelligence"
  | "model_studio"
  | "pack_distribution"
  | "ai_builder";

export interface OptaleOperationalSpineCapabilityRef {
  capability: OptaleOperationalSpineCapability;
  status: OptaleOperationalSpineCapabilityStatus;
  ref: string;
  reason: string;
}

export interface OptaleOperationalSpineBinding {
  version: 1;
  subjectType: OptaleOperationalSpineSubjectType;
  subjectId: string;
  cabinetPath: string;
  refs: Record<
    OptaleOperationalSpineCapability,
    OptaleOperationalSpineCapabilityRef
  >;
  futureSurfaces: OptaleOperationalFutureSurface[];
}

export interface OptaleOperationalSpineSummary {
  version: 1;
  generatedAt: string;
  cabinetPath: string;
  bindingCount: number;
  capabilities: Record<
    OptaleOperationalSpineCapability,
    Record<OptaleOperationalSpineCapabilityStatus, number>
  >;
  futureSurfaces: Record<
    OptaleOperationalFutureSurface,
    {
      planned: true;
      prerequisiteCapabilities: OptaleOperationalSpineCapability[];
    }
  >;
}

export const OPTALE_OPERATIONAL_SPINE_CAPABILITIES: OptaleOperationalSpineCapability[] =
  [
    "audit_event",
    "lineage_edge",
    "policy_decision",
    "eval_run",
    "model_usage",
    "branch_review",
  ];

export const OPTALE_OPERATIONAL_SPINE_FUTURE_SURFACE_REQUIREMENTS: Record<
  OptaleOperationalFutureSurface,
  OptaleOperationalSpineCapability[]
> = {
  oag_object_sets: ["audit_event", "lineage_edge", "policy_decision"],
  bridge_funnel: ["audit_event", "lineage_edge", "policy_decision"],
  document_intelligence: [
    "audit_event",
    "lineage_edge",
    "policy_decision",
    "eval_run",
  ],
  model_studio: [
    "audit_event",
    "lineage_edge",
    "policy_decision",
    "eval_run",
    "model_usage",
  ],
  pack_distribution: [
    "audit_event",
    "lineage_edge",
    "policy_decision",
    "branch_review",
  ],
  ai_builder: [
    "audit_event",
    "lineage_edge",
    "policy_decision",
    "eval_run",
    "model_usage",
    "branch_review",
  ],
};

const DEFAULT_STATUS: Record<
  OptaleOperationalSpineCapability,
  OptaleOperationalSpineCapabilityStatus
> = {
  audit_event: "reserved",
  lineage_edge: "reserved",
  policy_decision: "reserved",
  eval_run: "planned",
  model_usage: "planned",
  branch_review: "planned",
};

const CAPABILITY_REASONS: Record<OptaleOperationalSpineCapability, string> = {
  audit_event:
    "Every governed resource/action needs an audit identity before writes become broader.",
  lineage_edge:
    "Every governed resource/action needs a graph node so future runs can explain upstream and downstream impact.",
  policy_decision:
    "Every governed resource/action needs a policy subject before agents can operate through it.",
  eval_run:
    "Reserved for regression checks before agent-authored changes are merged.",
  model_usage:
    "Reserved for cost, capacity, routing, and provider policy once model calls attach to the graph.",
  branch_review:
    "Reserved for proposal, review, merge, and rollback flows before AI builder loops are enabled.",
};

const DEFAULT_FUTURE_SURFACES = Object.keys(
  OPTALE_OPERATIONAL_SPINE_FUTURE_SURFACE_REQUIREMENTS,
) as OptaleOperationalFutureSurface[];

function normalizeRefSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9:._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
}

export function buildOptaleOperationalSpineBinding(input: {
  subjectType: OptaleOperationalSpineSubjectType;
  subjectId: string;
  cabinetPath?: string;
  capabilityStatus?: Partial<
    Record<
      OptaleOperationalSpineCapability,
      OptaleOperationalSpineCapabilityStatus
    >
  >;
  futureSurfaces?: OptaleOperationalFutureSurface[];
}): OptaleOperationalSpineBinding {
  const subjectKey = normalizeRefSegment(
    `${input.subjectType}:${input.subjectId}`,
  );
  const refs = Object.fromEntries(
    OPTALE_OPERATIONAL_SPINE_CAPABILITIES.map((capability) => {
      const status = input.capabilityStatus?.[capability] || DEFAULT_STATUS[capability];
      const ref = `${capability}:${subjectKey || "unknown"}`;
      return [
        capability,
        {
          capability,
          status,
          ref,
          reason: CAPABILITY_REASONS[capability],
        },
      ];
    }),
  ) as OptaleOperationalSpineBinding["refs"];

  return {
    version: 1,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    cabinetPath: input.cabinetPath || ".",
    refs,
    futureSurfaces: input.futureSurfaces || DEFAULT_FUTURE_SURFACES,
  };
}

export function buildOptaleOperationalSpineSummary(input: {
  generatedAt: string;
  cabinetPath: string;
  bindings: OptaleOperationalSpineBinding[];
}): OptaleOperationalSpineSummary {
  const capabilities = Object.fromEntries(
    OPTALE_OPERATIONAL_SPINE_CAPABILITIES.map((capability) => [
      capability,
      { reserved: 0, planned: 0, active: 0 },
    ]),
  ) as OptaleOperationalSpineSummary["capabilities"];

  for (const binding of input.bindings) {
    for (const ref of Object.values(binding.refs)) {
      capabilities[ref.capability][ref.status] += 1;
    }
  }

  const futureSurfaces = Object.fromEntries(
    DEFAULT_FUTURE_SURFACES.map((surface) => [
      surface,
      {
        planned: true,
        prerequisiteCapabilities:
          OPTALE_OPERATIONAL_SPINE_FUTURE_SURFACE_REQUIREMENTS[surface],
      },
    ]),
  ) as OptaleOperationalSpineSummary["futureSurfaces"];

  return {
    version: 1,
    generatedAt: input.generatedAt,
    cabinetPath: input.cabinetPath,
    bindingCount: input.bindings.length,
    capabilities,
    futureSurfaces,
  };
}
