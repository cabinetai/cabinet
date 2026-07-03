"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-is-mobile";

/**
 * Manila Arc: the elevated "sheet" that holds a view's main content. Floats on
 * the desk (rounded + soft shadow) on desktop; full-bleed on mobile. Chrome
 * (toolbars, tabs, breadcrumbs) lives OUTSIDE this, on the desk.
 */
export function ContentSheet({
  children,
  className,
  style,
  flatTop,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Square off the top corners so folder tabs connect seamlessly. */
  flatTop?: boolean;
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
              borderRadius: flatTop ? "0 0 16px 16px" : 16,
              boxShadow: "var(--sheet-shadow)",
            }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
