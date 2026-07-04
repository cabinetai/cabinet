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
  /**
   * Per-option grey subtext override. Lets a host (e.g. the task board)
   * phrase the scope in terms of what the page actually shows
   * ("…the current cabinet's tasks") instead of the generic copy. Any
   * mode left out falls back to the default i18n description.
   */
  descriptions?: Partial<Record<CabinetVisibilityMode, string>>;
}

export function DepthDropdown({
  mode,
  onChange,
  compact,
  className,
  descriptions,
}: DepthDropdownProps) {
  const { t } = useLocale();
  // Map each visibility value to translation keys; shortLabel falls back to
  // the English source so number-like ones (+1, +2) stay readable.
  const optionMeta: Record<
    CabinetVisibilityMode,
    { labelKey: string; shortLabel: string; descKey: string }
  > = {
    own: {
      labelKey: "cabinetsExtras:depthOwnLabel",
      shortLabel: t("cabinetsExtras:depthOwnShort"),
      descKey: "cabinetsExtras:depthOwnDesc",
    },
    "children-1": {
      labelKey: "cabinetsExtras:depthChildren1Label",
      shortLabel: "+1",
      descKey: "cabinetsExtras:depthChildren1Desc",
    },
    "children-2": {
      labelKey: "cabinetsExtras:depthChildren2Label",
      shortLabel: "+2",
      descKey: "cabinetsExtras:depthChildren2Desc",
    },
    all: {
      labelKey: "cabinetsExtras:depthAllLabel",
      shortLabel: t("cabinetsExtras:depthAllShort"),
      descKey: "cabinetsExtras:depthAllDesc",
    },
  };
  const current =
    CABINET_VISIBILITY_OPTIONS.find((o) => o.value === mode) ??
    CABINET_VISIBILITY_OPTIONS[0];
  const currentMeta = optionMeta[current.value];
  const currentLabel = t(currentMeta.labelKey);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center gap-1 rounded font-medium text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground data-[popup-open]:bg-accent data-[popup-open]:text-foreground",
          compact ? "px-1 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[11px]",
          className
        )}
        title={t("cabinetsExtras:scopeTooltip", { label: currentLabel })}
        aria-label={t("cabinetsExtras:scopeTooltip", { label: currentLabel })}
      >
        {!compact && <FolderTree className="size-3.5" />}
        <span className="sr-only">{t("cabinetsExtras:cabinetScope")} </span>
        <span className="tabular-nums">{currentMeta.shortLabel}</span>
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[260px]"
        collisionAvoidance={{ side: "none" }}
      >
        <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          {t("cabinetsExtras:depthDropdownHeader")}
        </div>
        {CABINET_VISIBILITY_OPTIONS.map((opt) => {
          const active = opt.value === mode;
          const meta = optionMeta[opt.value];
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className="flex items-start justify-between gap-3 py-1.5"
            >
              <span className="flex items-start gap-2">
                <span className="inline-flex w-6 shrink-0 justify-center pt-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {meta.shortLabel}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[12.5px] leading-tight">{t(meta.labelKey)}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground/80">
                    {descriptions?.[opt.value] ?? t(meta.descKey)}
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
