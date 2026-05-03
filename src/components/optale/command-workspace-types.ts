import type {
  OptaleActionCategory,
  OptaleActionKind,
} from "@/lib/optale/action-registry";

export type OptaleCommandView =
  | "actions"
  | "runs"
  | "policy"
  | "lineage"
  | "audit";

export type OptaleCommandActionFilter =
  | "all"
  | OptaleActionKind
  | OptaleActionCategory;
