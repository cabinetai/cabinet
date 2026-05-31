"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AgentAvatar,
  type AgentAvatarInput,
} from "@/components/agents/agent-avatar";
import { cn } from "@/lib/utils";

export interface AgentPickerOption extends AgentAvatarInput {
  /** Display name used in the menu row + trigger label. */
  name: string;
  /** Optional subtitle shown below the name in the menu. */
  role?: string;
  /** Optional cabinet name suffix shown in the role line. */
  cabinetName?: string;
  /** True if this agent is inherited from a parent cabinet — affects role text. */
  inherited?: boolean;
}

export interface AgentPickerProps {
  agents: AgentPickerOption[];
  selectedSlug: string | null | undefined;
  onSelect?: (slug: string) => void;
  /** When true, the trigger renders flat with no menu (used for locked composers). */
  disabled?: boolean;
  /** Tooltip text shown on hover when disabled. */
  disabledReason?: string;
  /** Optional className for the trigger button. */
  className?: string;
}

/**
 * Compact agent picker chip for inline composer use. Mirrors the visual size
 * of `WhenChip` and `TaskRuntimePicker`. When `disabled` is set, the chip is
 * non-interactive and shows the tooltip text on hover.
 */
export function AgentPicker({
  agents,
  selectedSlug,
  onSelect,
  disabled,
  disabledReason,
  className,
}: AgentPickerProps) {
  const selected =
    agents.find((agent) => agent.slug === selectedSlug) ?? null;

  const triggerLabel =
    selected?.displayName ?? selected?.name ?? "Pick an agent";

  const triggerInner = (
    <>
      {selected ? (
        <AgentAvatar agent={selected} shape="circle" size="xs" />
      ) : null}
      <span className="max-w-[8rem] truncate">{triggerLabel}</span>
      {!disabled ? (
        <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" />
      ) : null}
    </>
  );

  const triggerClass = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors",
    disabled
      ? "border-border/60 bg-muted/40 text-muted-foreground cursor-not-allowed"
      : "border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
    className
  );

  if (disabled) {
    const trigger = (
      <span className={triggerClass} aria-disabled>
        {triggerInner}
      </span>
    );
    if (!disabledReason) return trigger;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={triggerClass}
        title={selected ? `Selected: ${triggerLabel}` : "Pick an agent"}
      >
        {triggerInner}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[320px] min-w-[220px] overflow-y-auto p-1"
      >
        {agents.length === 0 ? (
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
            No agents available
          </div>
        ) : (
          agents.map((agent) => {
            const isSelected = agent.slug === selectedSlug;
            const sub = agent.role
              ? agent.inherited && agent.cabinetName
                ? `${agent.role} · ${agent.cabinetName}`
                : agent.role
              : "";
            return (
              <DropdownMenuItem
                key={agent.slug}
                onClick={() => onSelect?.(agent.slug)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]",
                  isSelected && "bg-accent text-accent-foreground"
                )}
              >
                <AgentAvatar agent={agent} shape="circle" size="sm" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[12px] font-medium text-foreground">
                    {agent.displayName ?? agent.name}
                  </span>
                  {sub ? (
                    <span className="truncate text-[10px] text-muted-foreground">
                      {sub}
                    </span>
                  ) : null}
                </span>
                {isSelected ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    active
                  </span>
                ) : null}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
