"use client";

import Image from "next/image";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPresetById } from "@/lib/agents/avatar-catalog";
import type { UserProfile } from "@/lib/user/profile-io";

type Size = "xs" | "sm" | "md" | "lg";
type Shape = "circle" | "square";

const SIZE_MAP: Record<Size, { box: string; icon: string; px: number }> = {
  xs: { box: "h-4 w-4", icon: "h-2.5 w-2.5", px: 16 },
  sm: { box: "h-5 w-5", icon: "h-3 w-3", px: 20 },
  md: { box: "h-7 w-7", icon: "h-4 w-4", px: 28 },
  lg: { box: "h-10 w-10", icon: "h-5 w-5", px: 40 },
};

function resolveUserAvatarUrl(profile: Pick<UserProfile, "avatar" | "avatarExt">): string | null {
  if (!profile.avatar) return null;
  const preset = getPresetById(profile.avatar);
  if (preset) return preset.file;
  if (profile.avatar === "custom" && profile.avatarExt) {
    // Cache-bust via avatarExt so a swap from jpg→png (or a re-upload of the
    // same ext) invalidates cached <Image> renders.
    return `/api/user/avatar?ext=${profile.avatarExt}&v=${profile.avatarExt}`;
  }
  return null;
}

export function UserAvatar({
  profile,
  size = "sm",
  shape = "circle",
  className,
}: {
  profile: Pick<UserProfile, "avatar" | "avatarExt" | "color" | "name" | "displayName">;
  size?: Size;
  shape?: Shape;
  className?: string;
}) {
  const dims = SIZE_MAP[size];
  const radius = shape === "circle" ? "rounded-full" : "rounded-md";
  const url = resolveUserAvatarUrl(profile);

  if (url) {
    return (
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden bg-muted",
          radius,
          dims.box,
          className
        )}
      >
        <Image
          src={url}
          alt=""
          width={dims.px}
          height={dims.px}
          className="h-full w-full object-cover"
          unoptimized
        />
      </span>
    );
  }

  const bg = profile.color || undefined;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center border border-border bg-background text-muted-foreground",
        radius,
        dims.box,
        className
      )}
      style={bg ? { backgroundColor: bg, color: "#fff", borderColor: "transparent" } : undefined}
    >
      <User className={dims.icon} />
    </span>
  );
}
