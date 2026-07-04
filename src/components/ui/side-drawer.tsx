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

  // The closed panel slides out toward the near (inline-end) window edge. The
  // panel only renders while open/animating, so reading dir at render is safe.
  const isRtl =
    typeof document !== "undefined" &&
    document.documentElement.dir === "rtl";
  const hiddenTransform = isRtl
    ? "translateX(calc(-100% - 14px))"
    : "translateX(calc(100% + 14px))";

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
    // The wrapper animates its width to push the main content; it carries no
    // overflow clip so the floating sheet's shadow isn't cut off.
    <div
      className={cn(
        "relative shrink-0 self-stretch",
        !resizing &&
          "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      )}
      style={{ width: expanded ? panelWidth : 0 }}
      onTransitionEnd={onWrapperTransitionEnd}
    >
      {/* Manila Arc: a floating sheet pinned to the inline-end. Inset from the
          desk on every side (top from the shell's gutter, start + bottom here)
          so the manila breathes around it, rounded + lifted with the same
          --sheet-shadow as the content sheet. Sized 10px narrower than the
          wrapper so a start gutter sits between it and the content sheet; it
          slides in on open (transform, so its fixed width never reflows). */}
      <div
        className={cn(
          "absolute top-0 bottom-[10px] end-0 flex flex-col overflow-hidden rounded-[var(--sheet-radius)] bg-background",
          !resizing &&
            "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        )}
        style={{
          width: panelWidth - 10,
          boxShadow: "var(--sheet-shadow)",
          transform: expanded ? "translateX(0)" : hiddenTransform,
        }}
      >
        {/* Resize handle — an invisible grab strip at the sheet's inline-start
            inner edge (kept inside the rounded, clipped panel). A soft primary
            rail appears on hover. Drag to resize, double-click to reset. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("sidebar:resizeHandle")}
          title={t("sidebar:resetWidth")}
          onPointerDown={startResize}
          onDoubleClick={resetWidth}
          className="absolute inset-y-0 start-0 z-30 w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40"
        />
        {children}
      </div>
    </div>
  );
}
