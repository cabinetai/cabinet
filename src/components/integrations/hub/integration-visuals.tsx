"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntegrationItem } from "@/lib/integrations/preview-catalog";

/**
 * Shared visual primitives for the Integrations Hub layouts, so all five
 * candidate designs render logos, brand surfaces, and status the same way.
 */

/** A soft, brand-tinted diagonal gradient for card backdrops. */
export function brandFace(brand: string): string {
  return `linear-gradient(150deg, ${brand}26 0%, ${brand}0d 55%, transparent 100%)`;
}

/** A saturated brand gradient for a filled icon chip. */
export function brandFill(brand: string): string {
  return `linear-gradient(155deg, ${brand} 0%, ${brand}cc 100%)`;
}

/** The brand logo image. Falls back to a monogram if the asset 404s. */
export function LogoImg({
  item,
  size = 32,
  className,
}: {
  item: IntegrationItem;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    // Brand-colored initial chip — a logo-less connector still reads as
    // intentional (app-icon style) rather than a broken gray box.
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-md font-semibold text-white",
          className,
        )}
        style={{ width: size, height: size, fontSize: size * 0.42, background: item.brand }}
      >
        {item.name.charAt(0)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.logo}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** A rounded "tile" with the logo centered on a clean card face. */
export function LogoTile({
  item,
  size = 64,
  logoSize,
  className,
}: {
  item: IntegrationItem;
  size?: number;
  logoSize?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl bg-card shadow-sm",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <LogoImg item={item} size={logoSize ?? Math.round(size * 0.5)} />
    </div>
  );
}

/** Status badge: "Connect" for implemented, "Soon" for not-yet. */
export function StatusBadge({
  implemented,
  className,
}: {
  implemented: boolean;
  className?: string;
}) {
  if (implemented) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400",
          className,
        )}
      >
        <Check className="h-2.5 w-2.5" />
        Available
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-foreground/[0.04] px-2 py-0.5 text-[10px] font-medium text-muted-foreground/80",
        className,
      )}
    >
      Soon
    </span>
  );
}

/**
 * Wrapper that applies the "coming soon" dimming uniformly. Implemented items
 * render at full strength; unimplemented ones at 50% with a subtle grayscale.
 */
export function DimWhenComingSoon({
  implemented,
  children,
  className,
}: {
  implemented: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "transition-opacity",
        !implemented && "opacity-50 grayscale-[0.25]",
        className,
      )}
    >
      {children}
    </div>
  );
}
