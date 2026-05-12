"use client";

import type { ComponentType, SVGProps } from "react";
import { useLocale } from "@/i18n/use-locale";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

interface DirIconProps extends SVGProps<SVGSVGElement> {
  /** Icon to render in LTR mode. */
  ltr: IconComponent;
  /** Icon to render in RTL mode (typically the LTR icon's mirror twin). */
  rtl: IconComponent;
  className?: string;
}

/**
 * Renders one of two lucide-react icons based on the active locale's direction.
 * Use this for icons whose meaning genuinely flips in RTL (e.g., ChevronRight
 * for "expand" becomes ChevronLeft in RTL). For purely-decorative arrows on
 * "next" buttons that share the button's reading direction, prefer Tailwind's
 * `rtl:rotate-180` modifier instead — it's lighter and doesn't require this
 * helper.
 */
export function DirIcon({ ltr: Ltr, rtl: Rtl, ...props }: DirIconProps) {
  const { dir } = useLocale();
  const Icon = dir === "rtl" ? Rtl : Ltr;
  return <Icon {...props} />;
}
