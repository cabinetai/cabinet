"use client";

import { ChevronDown, FolderTree, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CABINET_VISIBILITY_OPTIONS } from "@/lib/cabinets/visibility";
import type { CabinetVisibilityMode } from "@/types/cabinets";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

interface DepthDropdownProps {
  mode: CabinetVisibilityMode;
  onChange: (mode: CabinetVisibilityMode) => void;
  /** Compact variant for the sidebar cabinet rail. */
  compact?: boolean;
  className?: string;
}

export function DepthDropdown({
  mode,
  onChange,
  compact,
  className,
}: DepthDropdownProps) {
  const { t } = useLocale();
  const current =
    CABINET_VISIBILITY_OPTIONS.find((o) => o.value === mode) ??
    CABINET_VISIBILITY_OPTIONS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center gap-1 rounded font-medium text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground data-[popup-open]:bg-muted/60 data-[popup-open]:text-foreground",
          compact ? "px-1 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[11px]",
          className
        )}
        title={`Cabinet scope: ${current.label}. Click to change.`}
        aria-label={`Cabinet scope: ${current.label}. Click to change.`}
      >
        {!compact && <FolderTree className="size-3.5" />}
        <span className="sr-only">Cabinet scope: </span>
        <span className="tabular-nums">{current.shortLabel}</span>
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[260px]"
        collisionAvoidance={{ side: "none" }}
      >
        <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Cabinet scope
        </div>
        {CABINET_VISIBILITY_OPTIONS.map((opt) => {
          const active = opt.value === mode;
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className="flex items-start justify-between gap-3 py-1.5"
            >
              <span className="flex items-start gap-2">
                <span className="inline-flex w-6 shrink-0 justify-center pt-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {opt.shortLabel}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[12.5px] leading-tight">{opt.label}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground/80">
                    {opt.description}
                  </span>
                </span>
              </span>
              {active && <Check className="mt-1 size-3.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
