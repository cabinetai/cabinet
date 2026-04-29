"use client";

import { Rows2, Rows4 } from "lucide-react";
import { cn } from "@/lib/utils";

export type BoardDensity = "comfortable" | "compact";

export function DensityToggle({
  value,
  onChange,
}: {
  value: BoardDensity;
  onChange: (v: BoardDensity) => void;
}) {
  const other: BoardDensity = value === "compact" ? "comfortable" : "compact";
  // Icon shows the TARGET state (what clicking will switch to)
  const Icon = value === "compact" ? Rows2 : Rows4;
  return (
    <button
      type="button"
      onClick={() => onChange(other)}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border border-border/60 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      title={value === "compact" ? "Switch to comfortable rows" : "Switch to compact rows"}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="text-[10.5px] font-medium">
        {value === "compact" ? "Compact" : "Comfortable"}
      </span>
    </button>
  );
}
