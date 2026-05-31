"use client";

import { Home, Users, ListChecks, Sparkles, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { useLocale } from "@/i18n/use-locale";

type TabId = "home" | "agents" | "tasks" | "ai" | "menu";

interface TabSpec {
  id: TabId;
  icon: typeof Home;
}

const TABS: TabSpec[] = [
  { id: "home", icon: Home },
  { id: "agents", icon: Users },
  { id: "tasks", icon: ListChecks },
  { id: "ai", icon: Sparkles },
  { id: "menu", icon: Menu },
];

export function MobileBottomNav() {
  const { t } = useLocale();
  const section = useAppStore((s) => s.section);
  const setSection = useAppStore((s) => s.setSection);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const taskPanelOpen = useAppStore((s) => s.taskPanelOpen);
  const openTaskPanelCompose = useAppStore((s) => s.openTaskPanelCompose);
  const closeTaskPanel = useAppStore((s) => s.closeTaskPanel);

  const activeTab: TabId = taskPanelOpen
    ? "ai"
    : section.type === "agents" || section.type === "agent"
      ? "agents"
      : section.type === "tasks" || section.type === "task"
        ? "tasks"
        : section.type === "home"
          ? "home"
          : "home";

  const onSelect = (id: TabId) => {
    if (id === "ai") {
      if (taskPanelOpen) {
        closeTaskPanel();
      } else {
        openTaskPanelCompose();
      }
      return;
    }
    // Always close the task drawer when navigating away
    if (taskPanelOpen) closeTaskPanel();
    if (id === "menu") {
      setSidebarCollapsed(false);
      return;
    }
    if (id === "home") {
      setSection({ type: "home" });
      return;
    }
    if (id === "agents") {
      setSection({ type: "agents", cabinetPath: ROOT_CABINET_PATH });
      return;
    }
    if (id === "tasks") {
      setSection({ type: "tasks", cabinetPath: ROOT_CABINET_PATH });
      return;
    }
  };

  return (
    <nav
      aria-label={t("chrome:nav.primaryAriaLabel")}
      className={cn(
        "md:hidden fixed bottom-0 inset-x-0 z-30",
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "border-t border-border",
        "pb-[max(env(safe-area-inset-bottom),0.25rem)]"
      )}
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const label = t(`chrome:nav.${tab.id}`);
          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "w-full min-h-[56px] flex flex-col items-center justify-center gap-0.5",
                  "text-[10px] font-medium tracking-wide",
                  "transition-colors cursor-pointer",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isActive && "text-primary"
                  )}
                />
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
