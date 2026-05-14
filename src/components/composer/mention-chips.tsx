"use client";

import { X, FileText, Bot, Sparkles } from "lucide-react";
import type { MentionableItem } from "@/hooks/use-composer";
import { useLocale } from "@/i18n/use-locale";

interface MentionChipsProps {
  mentionedPaths: string[];
  mentionedAgents: string[];
  mentionedSkills?: string[];
  items: MentionableItem[];
  onRemove: (type: "page" | "agent" | "skill", id: string) => void;
  /**
   * When true, render chips without the outer padded container so they can
   * share a row with other chip types (attachments, etc.).
   */
  inline?: boolean;
}

export function MentionChips({
  mentionedPaths,
  mentionedAgents,
  mentionedSkills = [],
  items,
  onRemove,
  inline = false,
}: MentionChipsProps) {
  const { t } = useLocale();
  if (
    mentionedPaths.length === 0 &&
    mentionedAgents.length === 0 &&
    mentionedSkills.length === 0
  ) {
    return null;
  }

  const findLabel = (type: "page" | "agent" | "skill", id: string) =>
    items.find((i) => i.type === type && i.id === id)?.label || id;

  const findIcon = (slug: string) =>
    items.find((i) => i.type === "agent" && i.id === slug)?.icon;

  const chips = (
    <>
      {mentionedAgents.map((slug) => (
        <span
          key={`agent-${slug}`}
          className="group inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary"
        >
          {findIcon(slug) ? (
            <span className="text-[11px]">{findIcon(slug)}</span>
          ) : (
            <Bot className="h-3 w-3" />
          )}
          {findLabel("agent", slug)}
          <button
            onClick={() => onRemove("agent", slug)}
            className="ml-0.5 inline-flex h-3.5 w-0 items-center justify-center overflow-hidden rounded-full opacity-0 transition-all duration-150 group-hover:w-3.5 group-hover:opacity-100 hover:bg-primary/20"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {mentionedSkills.map((key) => (
        <span
          key={`skill-${key}`}
          className="group inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-700 dark:text-violet-300"
          title={t("composerExtras:skillAttached")}
        >
          <Sparkles className="h-3 w-3" />
          {findLabel("skill", key)}
          <button
            onClick={() => onRemove("skill", key)}
            className="ml-0.5 inline-flex h-3.5 w-0 items-center justify-center overflow-hidden rounded-full opacity-0 transition-all duration-150 group-hover:w-3.5 group-hover:opacity-100 hover:bg-violet-500/20"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {mentionedPaths.map((path) => (
        <span
          key={`page-${path}`}
          className="group inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground"
        >
          <FileText className="h-3 w-3" />
          {findLabel("page", path)}
          <button
            onClick={() => onRemove("page", path)}
            className="ml-0.5 inline-flex h-3.5 w-0 items-center justify-center overflow-hidden rounded-full opacity-0 transition-all duration-150 group-hover:w-3.5 group-hover:opacity-100 hover:bg-foreground/10"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
    </>
  );

  if (inline) return chips;
  return <div className="flex flex-wrap gap-2 px-4 pb-2">{chips}</div>;
}
