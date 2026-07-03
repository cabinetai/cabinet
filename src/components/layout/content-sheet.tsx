"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-is-mobile";

/**
 * Manila Arc: the elevated "sheet" that holds a view's main content. Floats on
 * the desk (rounded + soft shadow) on desktop, inset on all four sides so the
 * manila gutter breathes around every corner (#089); full-bleed on mobile.
 * Chrome (toolbars, tabs, breadcrumbs) lives OUTSIDE this, on the desk. The
 * radius is tokenized as --sheet-radius so it tracks the theme scale (#100).
 */
export function ContentSheet({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const isMobile = useIsMobile();
  return (
    <div
      className={cn(
        "flex-1 flex flex-col overflow-hidden bg-background min-h-0",
        className
      )}
      style={{
        ...(isMobile
          ? {}
          : {
              borderRadius: "var(--sheet-radius)",
              boxShadow: "var(--sheet-shadow)",
              // The desk supplies top + inline-end padding (app-shell); add the
              // inline-start + bottom gutter here so the sheet floats on all
              // four sides and every rounded corner is visible (#089).
              marginInlineStart: 10,
              marginBottom: 10,
            }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
