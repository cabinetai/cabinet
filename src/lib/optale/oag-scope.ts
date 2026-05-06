import {
  resolveOptaleBrainContext,
  type OptaleBrainContext,
} from "@/lib/optale/brain-context";

export interface OptaleOagScope {
  workspaceId: string;
  ontologyId: string;
}

function envName(base: string, profile: string): string {
  return `${base}_${profile.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

function envFirst(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function slugValue(value: string | undefined, fallback: string): string {
  const slug = (value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

export function resolveOptaleOagScope(
  context: Pick<
    OptaleBrainContext,
    | "companyId"
    | "entityNamespace"
    | "entityProfile"
    | "ownerId"
    | "personId"
    | "subjectType"
  >,
): OptaleOagScope {
  const owner = slugValue(
    context.companyId || context.personId || context.ownerId,
    context.entityProfile,
  );
  return {
    workspaceId:
      envFirst([
        envName("OPTALE_OAG_WORKSPACE_ID", context.entityProfile),
        envName("OAG_WORKSPACE_ID", context.entityProfile),
        "OPTALE_OAG_WORKSPACE_ID",
        "OAG_WORKSPACE_ID",
      ]) || context.entityNamespace,
    ontologyId:
      envFirst([
        envName("OPTALE_OAG_ONTOLOGY_ID", context.entityProfile),
        envName("OPTALE_ONTOLOGY_ID", context.entityProfile),
        envName("OAG_ONTOLOGY_ID", context.entityProfile),
        "OPTALE_OAG_ONTOLOGY_ID",
        "OPTALE_ONTOLOGY_ID",
        "OAG_ONTOLOGY_ID",
      ]) || `${owner}-${context.subjectType}-ontology-canary`,
  };
}

export async function resolveOptaleOagScopeForCabinet(
  cabinetPath?: string | null,
): Promise<OptaleOagScope> {
  return resolveOptaleOagScope(await resolveOptaleBrainContext(cabinetPath));
}
