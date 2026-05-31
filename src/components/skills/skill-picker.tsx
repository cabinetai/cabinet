"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SkillEntry } from "@/lib/agents/skills/types";

interface SkillPickerProps {
  cabinetPath?: string;
  selected: string[];
  onChange: (next: string[]) => void;
  /** When true, render a compact toggle row (for use inside a form/tab). */
  compact?: boolean;
}

export function SkillPicker({ cabinetPath, selected, onChange, compact }: SkillPickerProps) {
  const [entries, setEntries] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cabinetPath) params.set("cabinet", cabinetPath);
      params.set("origins", "cabinet,linked"); // exclude system + legacy from picker
      const res = await fetch(`/api/agents/skills?${params}`);
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { entries: SkillEntry[] };
      // Hide system + legacy from the picker — agents reference cabinet/linked only.
      const managed = (data.entries || []).filter(
        (entry) => entry.origin !== "system" && entry.origin !== "legacy-home",
      );
      setEntries(managed);
    } finally {
      setLoading(false);
    }
  }, [cabinetPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading skills…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No skills available in this cabinet. Add one from the Skills library.
      </p>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {entries.map((entry) => {
          const on = selected.includes(entry.key);
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => toggle(entry.key)}
              className={cn(
                "text-[11px] px-2 py-1 rounded-full border transition-colors",
                on
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/60",
              )}
              title={entry.description ?? entry.name}
            >
              {entry.name}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-72">
      <div className="flex flex-col gap-1.5">
        {entries.map((entry) => {
          const on = selected.includes(entry.key);
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => toggle(entry.key)}
              className={cn(
                "flex items-start gap-2 px-2 py-1.5 rounded-md text-left border transition-colors",
                on
                  ? "bg-accent border-accent-foreground/30"
                  : "border-transparent hover:bg-muted/40",
              )}
            >
              <div
                className={cn(
                  "size-4 mt-0.5 rounded-sm border flex items-center justify-center shrink-0",
                  on ? "bg-primary border-primary" : "border-border",
                )}
              >
                {on && <Plus className="size-3 text-primary-foreground rotate-45" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium truncate">{entry.name}</div>
                {entry.description && (
                  <div className="text-[10px] text-muted-foreground line-clamp-2">
                    {entry.description}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
