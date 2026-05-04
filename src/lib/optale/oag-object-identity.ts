import type { OptaleMemoryLane } from "@/lib/optale/capabilities";
import type { OptaleAgentScope } from "@/lib/optale/product";
import {
  inferCabinetOptaleScope,
  normalizeOptaleScope,
} from "@/lib/optale/scope-registry";
import { optaleOagSchemaRefForObjectType } from "@/lib/optale/oag-schema";

export type OptaleOagObjectType =
  | "Space"
  | "Agent"
  | "Job"
  | "Task"
  | "Run"
  | "Source"
  | "ToolServer"
  | "ToolClient"
  | "Policy"
  | "ActionType";

export type OptaleOagVisibility =
  | "private"
  | "tenant_scoped"
  | "operator_only";

export type OptaleOagTemporalMode = "current_state";

export interface OptaleOagObjectIdentity {
  canonicalId: string;
  objectType: OptaleOagObjectType;
  objectId: string;
  sourceRef: string;
  sourceSystem: string;
  cabinetPath?: string;
  scope: OptaleAgentScope;
  visibility: OptaleOagVisibility;
  memoryLane: OptaleMemoryLane;
  temporalMode: OptaleOagTemporalMode;
  ontologyVersion: "oag-v0";
  schemaRef: string;
}

export function optaleOagObjectTypeForResourceKind(
  kind: string,
): OptaleOagObjectType {
  switch (kind) {
    case "space":
      return "Space";
    case "agent":
      return "Agent";
    case "job":
      return "Job";
    case "task":
      return "Task";
    case "conversation":
      return "Run";
    case "brain_source":
      return "Source";
    case "mcp_server":
      return "ToolServer";
    case "mcp_client":
      return "ToolClient";
    case "mcp_policy":
      return "Policy";
    case "action_type":
      return "ActionType";
    default:
      return "Source";
  }
}

export function optaleOagVisibilityForScope(
  scope: OptaleAgentScope,
): OptaleOagVisibility {
  if (scope === "personal") return "private";
  if (scope === "company") return "tenant_scoped";
  return "operator_only";
}

export function optaleOagMemoryLaneForScope(
  scope: OptaleAgentScope,
): OptaleMemoryLane {
  if (scope === "system") return "operator_company_brain";
  return "partner_scoped_memory";
}

export function buildOptaleOagObjectIdentity(input: {
  resourceId: string;
  resourceKind: string;
  resourceSource: string;
  cabinetPath?: string;
  scope?: string | null;
}): OptaleOagObjectIdentity {
  const objectType = optaleOagObjectTypeForResourceKind(input.resourceKind);
  const scope =
    normalizeOptaleScope(input.scope) ||
    inferCabinetOptaleScope(input.cabinetPath);

  return {
    canonicalId: `oag:${objectType}:${input.resourceId}`,
    objectType,
    objectId: input.resourceId,
    sourceRef: input.resourceId,
    sourceSystem: input.resourceSource,
    cabinetPath: input.cabinetPath,
    scope,
    visibility: optaleOagVisibilityForScope(scope),
    memoryLane: optaleOagMemoryLaneForScope(scope),
    temporalMode: "current_state",
    ontologyVersion: "oag-v0",
    schemaRef: optaleOagSchemaRefForObjectType(objectType),
  };
}
