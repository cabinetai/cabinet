"use client";

import { createElement } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { resolveAgentIcon } from "@/lib/agents/icon-catalog";
import { resolveAvatarUrl } from "@/lib/agents/avatar-catalog";
import { getAgentColor, tintFromHex } from "@/lib/agents/cron-compute";

export interface AgentAvatarInput {
  slug: string;
  cabinetPath?: string;
  displayName?: string;
  iconKey?: string | null;
  color?: string | null;
  avatar?: string | null;
  avatarExt?: string | null;
}

export type AgentAvatarSize = "xs" | "sm" | "md" | "lg";
export type AgentAvatarShape = "square" | "circle";

const SIZE_MAP: Record<AgentAvatarSize, { box: string; icon: string; px: number }> = {
  xs: { box: "h-4 w-4",  icon: "h-2.5 w-2.5", px: 16 },
  sm: { box: "h-5 w-5",  icon: "h-3 w-3",     px: 20 },
  md: { box: "h-7 w-7",  icon: "h-4 w-4",     px: 28 },
  lg: { box: "h-10 w-10", icon: "h-5 w-5",    px: 40 },
};

export function AgentAvatar({
  agent,
  size = "sm",
  shape = "square",
  className,
}: {
  agent: AgentAvatarInput;
  size?: AgentAvatarSize;
  shape?: AgentAvatarShape;
  className?: string;
}) {
  const dims = SIZE_MAP[size];
  const radius = shape === "circle" ? "rounded-full" : "rounded-md";
  const avatarUrl = resolveAvatarUrl({
    slug: agent.slug,
    cabinetPath: agent.cabinetPath,
    avatar: agent.avatar ?? undefined,
    avatarExt: agent.avatarExt ?? undefined,
  });
  const palette = agent.color ? tintFromHex(agent.color) : getAgentColor(agent.slug);

  if (avatarUrl) {
    return (
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden",
          radius,
          dims.box,
          className
        )}
        style={{ backgroundColor: palette.bg }}
      >
        <Image
          src={avatarUrl}
          alt=""
          width={dims.px}
          height={dims.px}
          className="h-full w-full object-cover"
          unoptimized
        />
      </span>
    );
  }

  const iconComponent = resolveAgentIcon(agent.slug, agent.iconKey ?? null);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        radius,
        dims.box,
        className
      )}
      style={{ backgroundColor: palette.bg, color: palette.text }}
    >
      {createElement(iconComponent, { className: dims.icon })}
    </span>
  );
}

/** Whether this agent has a resolvable avatar image (preset or custom upload). */
export function hasAgentAvatarImage(agent: AgentAvatarInput): boolean {
  return (
    resolveAvatarUrl({
      slug: agent.slug,
      cabinetPath: agent.cabinetPath,
      avatar: agent.avatar ?? undefined,
      avatarExt: agent.avatarExt ?? undefined,
    }) !== null
  );
}

export function getAgentDisplayName(
  agent: { name?: string; displayName?: string }
): string {
  return agent.displayName?.trim() || agent.name || "";
}
