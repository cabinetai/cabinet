"use client";

import { useEffect, useState } from "react";
import type { SkillEntry } from "@/lib/agents/skills/types";
import type { MentionableItem } from "@/hooks/use-composer";

interface UseSkillMentionItemsOptions {
  /** Cabinet scope to fetch skills for. Pass null/undefined for root-only. */
  cabinetPath?: string | null;
  /** When false, defer the fetch — useful for closed dialogs that mount eagerly. */
  enabled?: boolean;
}

export function useSkillMentionItems({
  cabinetPath,
  enabled = true,
}: UseSkillMentionItemsOptions = {}): MentionableItem[] {
  const [items, setItems] = useState<MentionableItem[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (cabinetPath) params.set("cabinet", cabinetPath);
    params.set("origins", "cabinet,linked");
    fetch(`/api/agents/skills?${params}`)
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then((data: { entries?: SkillEntry[] }) => {
        if (cancelled) return;
        const managed = (data.entries ?? []).filter(
          (e) => e.origin !== "system" && e.origin !== "legacy-home",
        );
        setItems(
          managed.map((entry) => ({
            type: "skill" as const,
            id: entry.key,
            label: entry.name,
            sublabel: entry.description ?? `skill: ${entry.key}`,
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, cabinetPath]);

  return items;
}
