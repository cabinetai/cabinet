"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";

export interface UseSideDrawerOptions {
  /** Drives the open/close animation. */
  isOpen: boolean;
  /** localStorage key for the persisted desktop width. */
  storageKey: string;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
}

export interface UseSideDrawer {
  isMobile: boolean;
  /**
   * Whether the drawer should render at all. Mobile is a fixed overlay
   * (nothing to push) so it unmounts immediately; desktop stays mounted
   * while the close (width -> 0) tween plays out.
   */
  shouldRender: boolean;
  /** Desktop: width target reached (drives the 0 <-> width transition). */
  expanded: boolean;
  /** True while the user drags the resize handle (disables the tween). */
  resizing: boolean;
  panelWidth: number;
  defaultWidth: number;
  setPanelWidth: (value: number) => void;
  /** Reset to the default width (handle double-click). */
  resetWidth: () => void;
  /** Pointer-down on the resize handle. */
  startResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  /** Wire to the desktop wrapper's onTransitionEnd to defer unmount. */
  onWrapperTransitionEnd: (event: React.TransitionEvent) => void;
}

/**
 * The bespoke side-drawer mechanics extracted from the old AIPanel: a
 * width-tween that pushes the main content (the drawer is a flex sibling),
 * deferred unmount so the close animation can play, a draggable + RTL-aware
 * resize handle, and width persistence. Mobile is handled by the consumer
 * as a fixed overlay.
 */
export function useSideDrawer({
  isOpen,
  storageKey,
  minWidth = 380,
  maxWidth = 760,
  defaultWidth = 480,
}: UseSideDrawerOptions): UseSideDrawer {
  const isMobile = useIsMobile();

  const clamp = useCallback(
    (value: number) => Math.min(maxWidth, Math.max(minWidth, value)),
    [minWidth, maxWidth]
  );

  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return defaultWidth;
    const stored = window.localStorage.getItem(storageKey);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed)
      ? Math.min(maxWidth, Math.max(minWidth, parsed))
      : defaultWidth;
  });

  const resizeStateRef = useRef<{
    startX: number;
    startWidth: number;
    rtl: boolean;
  } | null>(null);

  // Push/release: keep the panel mounted through the close so its width
  // can animate back to 0. `present` gates mount; `expanded` drives the
  // 0 <-> width tween.
  const [present, setPresent] = useState(isOpen);
  const [expanded, setExpanded] = useState(false);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (isOpen) setPresent(true);
  }, [isOpen]);

  useEffect(() => {
    if (!present) return;
    if (isOpen) {
      // Expand on the next frame so the 0 -> width transition runs
      // instead of the element mounting already at full width.
      const raf = requestAnimationFrame(() => setExpanded(true));
      return () => cancelAnimationFrame(raf);
    }
    setExpanded(false);
  }, [present, isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, String(panelWidth));
  }, [storageKey, panelWidth]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = resizeStateRef.current;
      if (!drag) return;
      // Panel is docked to the inline-end; dragging its inline-start edge
      // toward the page center widens it. RTL flips the screen-space sign.
      const delta = drag.startX - event.clientX;
      const next = drag.startWidth + (drag.rtl ? -delta : delta);
      setPanelWidth(clamp(next));
    }
    function handlePointerUp() {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [clamp]);

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      setResizing(true);
      resizeStateRef.current = {
        startX: event.clientX,
        startWidth: panelWidth,
        rtl:
          typeof document !== "undefined" &&
          document.documentElement.dir === "rtl",
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [panelWidth]
  );

  const resetWidth = useCallback(
    () => setPanelWidth(defaultWidth),
    [defaultWidth]
  );

  const onWrapperTransitionEnd = useCallback(
    (event: React.TransitionEvent) => {
      if (
        event.target === event.currentTarget &&
        event.propertyName === "width" &&
        !isOpen
      ) {
        setPresent(false);
      }
    },
    [isOpen]
  );

  return {
    isMobile,
    shouldRender: isMobile ? isOpen : present,
    expanded,
    resizing,
    panelWidth,
    defaultWidth,
    setPanelWidth,
    resetWidth,
    startResize,
    onWrapperTransitionEnd,
  };
}
