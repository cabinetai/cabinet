"use client";

import { Rows2, Rows4 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconHint } from "./icon-hint";

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
    <IconHint
      label={
        value === "compact"
          ? "Comfortable rows — more spacing and a second line of card detail"
          : "Compact rows — denser cards so more fit without scrolling"
      }
      side="bottom"
    >
      <button
        type="button"
        onClick={() => onChange(other)}
        aria-label={
          value === "compact" ? "Switch to comfortable rows" : "Switch to compact rows"
        }
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="text-[10.5px] font-medium">
          {value === "compact" ? "Compact" : "Comfortable"}
        </span>
      </button>
    </IconHint>
  );
}
