"use client";

import { FileText, Bot, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MentionableItem } from "@/hooks/use-composer";

interface MentionDropdownProps {
  items: MentionableItem[];
  activeIndex: number;
  onSelect: (item: MentionableItem) => void;
  maxItems?: number;
  /**
   * Where to anchor the dropdown relative to the textarea.
   * Defaults to "above" — composers near the bottom of the screen flow up.
   * Use "below" when the composer sits at the top of the page so the
   * suggestions don't get clipped by the chrome above.
   */
  placement?: "above" | "below";
}

export function MentionDropdown({
  items,
  activeIndex,
  onSelect,
  maxItems = 8,
  placement = "above",
}: MentionDropdownProps) {
  const agents = items.filter((i) => i.type === "agent");
  const skills = items.filter((i) => i.type === "skill");
  const pages = items.filter((i) => i.type === "page");

  const visibleAgents = agents.slice(0, maxItems);
  let remaining = maxItems - visibleAgents.length;
  const visibleSkills = skills.slice(0, Math.max(remaining, 0));
  remaining -= visibleSkills.length;
  const visiblePages = pages.slice(0, Math.max(remaining, 0));

  const visibleItems = [...visibleAgents, ...visibleSkills, ...visiblePages];
  if (visibleItems.length === 0) return null;

  let runningIndex = 0;
  const renderItem = (
    item: MentionableItem,
    icon: React.ReactNode,
    keyPrefix: string,
  ) => {
    const idx = runningIndex++;
    return (
      <button
        key={`${keyPrefix}-${idx}-${item.id}`}
        onClick={() => onSelect(item)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px]",
          idx === activeIndex
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        {icon}
        <span className="shrink-0 font-medium">{item.label}</span>
        <span className="ml-auto min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
          {item.sublabel}
        </span>
      </button>
    );
  };

  return (
    <div
      className={cn(
        "absolute inset-x-0 z-20 max-h-[280px] overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg",
        placement === "below" ? "top-full mt-2" : "bottom-full mb-2",
      )}
    >
      {visibleAgents.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Agents
          </div>
          {visibleAgents.map((item) =>
            renderItem(
              item,
              item.icon ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[13px]">
                  {item.icon}
                </span>
              ) : (
                <Bot className="h-3.5 w-3.5 shrink-0" />
              ),
              "agent",
            ),
          )}
        </>
      )}
      {visibleSkills.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Skills
          </div>
          {visibleSkills.map((item) =>
            renderItem(
              item,
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-500/70" />,
              "skill",
            ),
          )}
        </>
      )}
      {visiblePages.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Pages
          </div>
          {visiblePages.map((item) =>
            renderItem(
              item,
              <FileText className="h-3.5 w-3.5 shrink-0" />,
              "page",
            ),
          )}
        </>
      )}
    </div>
  );
}
