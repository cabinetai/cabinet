"use client";

import { useState, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { Switch } from "@/components/ui/switch";
import { startCase } from "@/components/cabinets/cabinet-utils";
import { useLocale } from "@/i18n/use-locale";
import type { AgentListItem } from "@/types/agents";

/**
 * One row in the "Meet the team" list — same visual rhythm as the Routines
 * rows. Click the row to open the agent. The Switch toggles `agent.active`
 * (the master) without leaving the page.
 */
export function AgentRow({
  agent,
  onOpen,
  onToggleActive,
}: {
  agent: AgentListItem;
  onOpen: (slug: string) => void;
  onToggleActive: (agent: AgentListItem) => void | Promise<void>;
}) {
  const { t } = useLocale();
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    if (toggling) return;
    setToggling(true);
    try {
      await onToggleActive(agent);
    } finally {
      setToggling(false);
    }
  }

  function handleRowActivate() {
    onOpen(agent.slug);
  }

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(agent.slug);
    }
  }

  const isActive = agent.active;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowActivate}
      onKeyDown={handleKey}
      className="group relative flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
    >
      <AgentAvatar
        agent={agent}
        shape="circle"
        size="sm"
        className={cn(!isActive && "saturate-50 opacity-60")}
      />
      <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
        <span
          className={cn(
            "truncate text-[12.5px] font-semibold",
            isActive ? "text-foreground" : "text-muted-foreground/70"
          )}
        >
          {agent.name}
        </span>
        {agent.role ? (
          <span
            className={cn(
              "truncate text-[11.5px]",
              isActive ? "text-muted-foreground" : "text-muted-foreground/60"
            )}
          >
            · {agent.role}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {agent.department ? (
          <span
            className={cn(
              "hidden whitespace-nowrap rounded-full bg-muted/40 px-2 py-0.5 text-[10px] sm:inline-flex",
              isActive ? "text-muted-foreground" : "text-muted-foreground/60"
            )}
          >
            {startCase(agent.department)}
          </span>
        ) : null}
        {agent.scope === "global" ? (
          <span
            className="hidden whitespace-nowrap rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300 sm:inline-flex"
            title={t("agents:workspace.sharedAcrossCabinets")}
          >
            Global
          </span>
        ) : null}
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Switch
            checked={isActive}
            onCheckedChange={() => void handleToggle()}
            disabled={toggling}
            aria-label={isActive ? `Stop ${agent.name}` : `Start ${agent.name}`}
          />
        </div>
        {toggling ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" />
        ) : null}
      </div>
    </div>
  );
}
