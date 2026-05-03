import type { OptaleCommandView } from "@/components/optale/command-workspace-types";

export function commandViewFromSlug(slug?: string): OptaleCommandView {
  if (
    slug === "runs" ||
    slug === "policy" ||
    slug === "lineage" ||
    slug === "audit"
  ) {
    return slug;
  }
  return "actions";
}

export function selectRecordById<T extends { id: string }>(
  records: readonly T[],
  selectedId?: string | null,
): T | null {
  return records.find((record) => record.id === selectedId) || records[0] || null;
}
