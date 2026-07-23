import type { AcceptanceCheck, AcceptanceStatus } from "./contracts";

export interface AcceptanceStage {
  id: string;
  area: string;
  dependsOn?: string[];
}

export function dependencyStatus(
  stage: AcceptanceStage,
  checks: readonly AcceptanceCheck[],
): { status: Extract<AcceptanceStatus, "blocked" | "not_run">; summary: string } | null {
  if (!stage.dependsOn?.length) return null;
  const byId = new Map(checks.map((check) => [check.id, check]));
  const missing = stage.dependsOn.filter((id) => !byId.has(id));
  if (missing.length) {
    return {
      status: "not_run",
      summary: `Prerequisite result missing: ${missing.join(", ")}.`,
    };
  }
  const blocked = stage.dependsOn
    .map((id) => byId.get(id)!)
    .filter((check) => check.status !== "passed");
  if (!blocked.length) return null;
  return {
    status: "blocked",
    summary: `Blocked by ${blocked.map((check) => `${check.id}:${check.status}`).join(", ")}.`,
  };
}
