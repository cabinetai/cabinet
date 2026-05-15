"use client";

import { CalendarRange, KanbanSquare, LayoutList, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

export type BoardViewMode = "kanban" | "list" | "schedule";

export function ViewToggle({
  value,
  onChange,
}: {
  value: BoardViewMode;
  onChange: (v: BoardViewMode) => void;
}) {
  const { t } = useLocale();
  const OPTIONS: { key: BoardViewMode; label: string; icon: LucideIcon }[] = [
    { key: "kanban", label: t("tasksBoard:viewKanban"), icon: KanbanSquare },
    { key: "list", label: t("tasksBoard:viewList"), icon: LayoutList },
    { key: "schedule", label: t("tasksBoard:viewSchedule"), icon: CalendarRange },
  ];
  return (
    <div className="flex h-7 items-center rounded-lg border border-border/60 p-0.5">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
