"use client";

import { CalendarRange, KanbanSquare, LayoutList, type LucideIcon } from "lucide-react";
import { useLocale } from "@/i18n/use-locale";
import { FolderTabs } from "@/components/layout/folder-tabs";

export type BoardViewMode = "kanban" | "list" | "schedule";

export function ViewToggle({
  value,
  onChange,
}: {
  value: BoardViewMode;
  onChange: (v: BoardViewMode) => void;
}) {
  const { t } = useLocale();
  const OPTIONS: {
    key: BoardViewMode;
    label: string;
    icon: LucideIcon;
  }[] = [
    { key: "kanban", label: t("tasksBoard:viewKanban"), icon: KanbanSquare },
    { key: "list", label: t("tasksBoard:viewList"), icon: LayoutList },
    { key: "schedule", label: t("tasksBoard:viewSchedule"), icon: CalendarRange },
  ];
  return (
    <FolderTabs
      ariaLabel="Task views"
      active={value}
      onSelect={(id) => onChange(id as BoardViewMode)}
      tabs={OPTIONS.map((opt) => {
        const Icon = opt.icon;
        return {
          id: opt.key,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <Icon className="size-3.5" />
              {/* Icon-only once the desk is squeezed by open side panels. */}
              <span className="@max-[820px]:hidden">{opt.label}</span>
            </span>
          ),
        };
      })}
    />
  );
}
