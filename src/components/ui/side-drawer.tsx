"use client";

import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";
import type { UseSideDrawer } from "@/hooks/use-side-drawer";

interface SideDrawerProps {
  /** Result of `useSideDrawer(...)`. */
  drawer: UseSideDrawer;
  /** Called when the mobile scrim is tapped. */
  onScrimClick: () => void;
  children: React.ReactNode;
}

/**
 * Right-docked drawer shell. Desktop animates the wrapper width
 * 0 <-> panelWidth — because the drawer is a flex sibling of the main
 * content, the tween pushes/releases the UI. The inner panel stays a fixed
 * width (no reflow jank) pinned to the inline-end and is revealed/clipped as
 * the wrapper grows/shrinks. Mobile is a full-screen overlay that slides up
 * over a scrim. The caller renders its own header/body via `children`.
 */
export function SideDrawer({ drawer, onScrimClick, children }: SideDrawerProps) {
  const { t } = useLocale();
  const {
    isMobile,
    expanded,
    resizing,
    panelWidth,
    startResize,
    resetWidth,
    onWrapperTransitionEnd,
  } = drawer;

  if (isMobile) {
    return (
      <>
        <div
          className="ai-scrim-anim fixed inset-0 z-40 bg-black/40"
          onClick={onScrimClick}
          aria-hidden="true"
        />
        <div className="ai-drawer-anim-up fixed inset-0 z-50 flex flex-col bg-background pb-[max(env(safe-area-inset-bottom),0px)]">
          {children}
        </div>
      </>
    );
  }

  return (
    <div
      className={cn(
        "relative shrink-0 self-stretch overflow-hidden",
        // Same leading-edge depth shadow as the task rail (RTL-mirrored).
        // On the wrapper, not the inner panel, so its own overflow-hidden
        // doesn't clip it. Only while expanded — no panel, no shadow.
        expanded &&
          "shadow-[-3px_0_8px_-5px_rgba(0,0,0,0.14)] rtl:shadow-[3px_0_8px_-5px_rgba(0,0,0,0.14)]",
        !resizing &&
          "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      )}
      style={{ width: expanded ? panelWidth : 0 }}
      onTransitionEnd={onWrapperTransitionEnd}
    >
      <div
        className="absolute inset-y-0 end-0 flex flex-col bg-background"
        style={{ width: panelWidth }}
      >
        {/* Resize handle — a flush 1px hairline at the inline-start edge.
            Drag to resize, double-click to reset. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("sidebar:resizeHandle")}
          title={t("sidebar:resetWidth")}
          onPointerDown={startResize}
          onDoubleClick={resetWidth}
          className="absolute inset-y-0 start-0 z-30 w-px cursor-col-resize bg-border/50 transition-colors hover:bg-primary/50"
        />
        {children}
      </div>
    </div>
  );
}
