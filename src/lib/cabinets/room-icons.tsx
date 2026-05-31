import { createElement } from "react";
import { cn } from "@/lib/utils";
import { AGENT_PALETTE } from "@/lib/themes";
import {
  Home,
  Briefcase,
  BookOpen,
  FlaskConical,
  Users,
  Sparkles,
  Palette,
  Rocket,
  Building2,
  Coffee,
  Heart,
  GraduationCap,
  Folder,
  type LucideIcon,
} from "lucide-react";

/**
 * Curated icon set for rooms. Stored in `.cabinet` as `room.icon` (the key);
 * resolved here to a Lucide component. Keys are stable strings — renaming a key
 * would orphan existing manifests, so only add, never rename.
 */
export const ROOM_ICONS: Record<string, LucideIcon> = {
  home: Home,
  briefcase: Briefcase,
  study: BookOpen,
  lab: FlaskConical,
  family: Users,
  sparkles: Sparkles,
  studio: Palette,
  rocket: Rocket,
  building: Building2,
  coffee: Coffee,
  heart: Heart,
  school: GraduationCap,
  folder: Folder,
};

export const ROOM_ICON_KEYS: string[] = Object.keys(ROOM_ICONS);

/** Resolve a stored icon key to a component, falling back when unset/unknown. */
export function getRoomIcon(
  key: string | null | undefined,
  fallback: LucideIcon = Folder
): LucideIcon {
  if (key && ROOM_ICONS[key]) return ROOM_ICONS[key];
  return fallback;
}

/**
 * Renders a room's icon from its stored key. Resolves through `getRoomIcon`
 * via `createElement` (not a capitalized local in JSX) so callers don't trip
 * the "component created during render" lint when resolving icons dynamically.
 */
export function RoomGlyph({
  iconKey,
  isRoot,
  className,
}: {
  iconKey?: string | null;
  isRoot?: boolean;
  className?: string;
}) {
  return createElement(getRoomIcon(iconKey, isRoot ? Home : Folder), {
    className,
  });
}

/** Stable color index for a room, hashed from a stable key (its path). */
function roomColorIndex(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AGENT_PALETTE.length;
}

/** Selectable accent colors for rooms (the glyph color; bg is a tint of it). */
export const ROOM_COLORS: string[] = AGENT_PALETTE.map((c) => c.text);

/** "rgb(r, g, b)" → "rgba(r, g, b, a)" so we can tint a background from the glyph color. */
function tint(rgb: string, alpha: number): string {
  const inner = rgb.slice(rgb.indexOf("(") + 1, rgb.indexOf(")"));
  return `rgba(${inner}, ${alpha})`;
}

/**
 * A room's visual identity: a colored rounded square holding either the room's
 * chosen icon or, by default, its initial letter. The color is auto-derived
 * from the room's path so every room is visually distinct without setup.
 */
export function RoomAvatar({
  name,
  iconKey,
  color,
  colorKey,
  className,
}: {
  name: string;
  iconKey?: string | null;
  /** Explicit accent color (CSS rgb string). Falls back to an auto color. */
  color?: string | null;
  colorKey: string;
  className?: string;
}) {
  const glyphColor =
    color || AGENT_PALETTE[roomColorIndex(colorKey || name)].text;
  const Icon = iconKey && ROOM_ICONS[iconKey] ? ROOM_ICONS[iconKey] : null;
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md",
        className
      )}
      style={{ backgroundColor: tint(glyphColor, 0.16), color: glyphColor }}
    >
      {Icon ? (
        <Icon className="size-3.5" />
      ) : (
        <span className="text-[11px] font-semibold leading-none">{initial}</span>
      )}
    </span>
  );
}
