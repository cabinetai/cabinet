"use client";

import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

interface PaletteProps {
  palette: { name: string; value: string | null }[];
  current: string | null | undefined;
  onSelect: (value: string | null) => void;
  title: string;
  swatchType: "text" | "background";
}

export function ColorPalette({ palette, current, onSelect, title, swatchType }: PaletteProps) {
  return (
    <div className="p-2 min-w-[180px]">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pb-1.5">
        {title}
      </div>
      <div className="flex flex-col">
        {palette.map((entry) => {
          const active = (current ?? null) === entry.value;
          return (
            <button
              key={entry.name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(entry.value);
              }}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-accent/60 transition-colors text-left"
              )}
            >
              <span
                className="w-5 h-5 rounded border border-border flex items-center justify-center text-[11px] font-semibold shrink-0"
                style={
                  entry.value == null
                    ? undefined
                    : swatchType === "text"
                      ? { color: entry.value }
                      : { backgroundColor: entry.value }
                }
              >
                {entry.value == null ? (
                  <X className="w-3 h-3 text-muted-foreground" />
                ) : swatchType === "text" ? (
                  "A"
                ) : (
                  ""
                )}
              </span>
              <span className="flex-1">{entry.name}</span>
              {active && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
