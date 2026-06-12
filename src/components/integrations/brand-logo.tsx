"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveBrand,
  isExtremeHex,
} from "@/lib/integrations/brand-detect";

/**
 * A small logo tile that sniffs a brand out of `parts` (a name, key, command,
 * url, …) and renders its mark — the Integrations Hub look, but resolved from
 * free text rather than a fixed catalogue. Shared by the MCP server list and
 * the Skills library.
 *
 * No brand matched → a neutral tile showing either `fallbackIcon` (e.g. a plug
 * for MCP servers) or, by default, a monogram of the first text fragment.
 */
export function BrandLogo({
  parts,
  size = 28,
  fallbackIcon: FallbackIcon,
  className,
}: {
  parts: Array<string | undefined | null>;
  size?: number;
  fallbackIcon?: LucideIcon;
  className?: string;
}) {
  const brand = resolveBrand(parts);
  const inner = Math.round(size * 0.58);

  if (!brand) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground/70",
          className,
        )}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {FallbackIcon ? (
          <FallbackIcon style={{ width: inner, height: inner }} />
        ) : (
          <span
            className="font-semibold leading-none text-foreground/70"
            style={{ fontSize: Math.round(size * 0.42) }}
          >
            {monogram(parts)}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-card border border-border text-foreground",
        className,
      )}
      style={{ width: size, height: size }}
      title={brand.title}
    >
      {brand.path ? (
        <svg
          role="img"
          aria-label={brand.title}
          viewBox="0 0 24 24"
          style={{
            width: inner,
            height: inner,
            // Near-black/near-white marks would vanish in one theme — let them
            // inherit the foreground colour; everything else keeps its brand hue.
            fill: isExtremeHex(brand.hex) ? "currentColor" : `#${brand.hex}`,
          }}
        >
          <path d={brand.path} />
        </svg>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.src}
          alt={brand.title}
          width={inner}
          height={inner}
          className="object-contain"
          style={{ width: inner, height: inner }}
        />
      )}
    </span>
  );
}

function monogram(parts: Array<string | undefined | null>): string {
  const first = parts.find((p) => p && p.trim());
  return first ? first.trim().charAt(0).toUpperCase() : "?";
}
