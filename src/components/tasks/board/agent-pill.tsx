"use client";

import { cn } from "@/lib/utils";
import { getAgentColor, tintFromHex } from "@/lib/agents/cron-compute";
import { resolveAgentIcon } from "@/lib/agents/icon-catalog";
import { AgentAvatar, hasAgentAvatarImage } from "@/components/agents/agent-avatar";
import type { CabinetAgentSummary } from "@/types/cabinets";

type AgentRef = Pick<
  CabinetAgentSummary,
  "slug" | "displayName" | "name" | "iconKey" | "color" | "avatar" | "avatarExt" | "cabinetPath"
>;

function resolveTint(agent: AgentRef | undefined, fallbackSlug: string) {
  if (agent?.color) return tintFromHex(agent.color);
  return getAgentColor(agent?.slug ?? fallbackSlug);
}

export function AgentPill({
  agent,
  slug,
  size = "md",
  className,
}: {
  agent: AgentRef | undefined;
  slug: string;
  size?: "md" | "sm";
  className?: string;
}) {
  const label = agent?.displayName ?? agent?.name ?? slug;
  const hasImage = !!agent && hasAgentAvatarImage(agent);
  const tint = resolveTint(agent, slug);

  if (hasImage && agent) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full font-medium",
          size === "md" ? "py-0.5 ps-0.5 pe-2 text-[11px]" : "py-0.5 ps-0.5 pe-1.5 text-[10px]",
          className
        )}
        style={{ backgroundColor: tint.bg, color: tint.text, opacity: 0.75 }}
      >
        <AgentAvatar agent={agent} shape="circle" size="xs" />
        {label}
      </span>
    );
  }

  const Icon = resolveAgentIcon(agent?.slug ?? slug, agent?.iconKey ?? null);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "md" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]",
        className
      )}
      style={{ backgroundColor: tint.bg, color: tint.text, opacity: 0.75 }}
    >
      <Icon className={size === "md" ? "size-3" : "size-2.5"} />
      {label}
    </span>
  );
}
