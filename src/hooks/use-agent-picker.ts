"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ALWAYS_CHECKED,
  type SuggestedAgent,
  type LibraryTemplate,
} from "@/components/agents/agent-picker";

interface UseAgentPickerOptions {
  maxAgents?: number;
  preCheck?: string[];
}

export function useAgentPicker(options?: UseAgentPickerOptions) {
  const maxAgents = options?.maxAgents;
  const preCheck = options?.preCheck;
  const [agents, setAgents] = useState<SuggestedAgent[]>([]);
  const [templates, setTemplates] = useState<LibraryTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/agents/library");
        if (!res.ok) throw new Error("Failed to fetch agent library");
        const data = await res.json();
        const fetched = (data.templates || []) as LibraryTemplate[];

        if (cancelled) return;

        setTemplates(fetched);

        const preChecked = new Set([
          ...ALWAYS_CHECKED,
          ...(preCheck || []),
        ]);

        setAgents(
          fetched.map((t) => ({
            slug: t.slug,
            name: t.name,
            emoji: t.emoji,
            role: t.role,
            checked: preChecked.has(t.slug),
          }))
        );
      } catch {
        // Fallback
        setAgents([
          { slug: "ceo", name: "CEO Agent", emoji: "🎯", role: "Strategic planning", checked: true },
          { slug: "editor", name: "Editor", emoji: "📝", role: "KB content & docs", checked: true },
        ]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [preCheck]);

  const toggleAgent = useCallback(
    (slug: string) => {
      if (ALWAYS_CHECKED.has(slug)) return;

      setAgents((prev) => {
        const target = prev.find((a) => a.slug === slug);
        if (!target) return prev;

        if (
          !target.checked &&
          maxAgents != null &&
          prev.filter((a) => a.checked).length >= maxAgents
        ) {
          return prev;
        }

        return prev.map((a) =>
          a.slug === slug ? { ...a, checked: !a.checked } : a
        );
      });
    },
    [maxAgents]
  );

  const selectedSlugs = agents.filter((a) => a.checked).map((a) => a.slug);

  return { agents, templates, loading, toggleAgent, selectedSlugs };
}
