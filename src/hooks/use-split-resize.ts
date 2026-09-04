"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

const MIN_PCT = 20;
const MAX_PCT = 80;
const DEFAULT_PCT = 50;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Manages a draggable vertical divider between two horizontal panes.
 * Returns the left pane width as a percentage, a pointer-down handler to
 * start the drag, and a double-click handler to reset to 50/50. The value is
 * persisted to localStorage under `storageKey`. The drag is measured against
 * the container element referenced by `containerRef`, and is RTL-aware.
 */
export function useSplitResize(storageKey: string, rtl = false) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftPct, setLeftPct] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_PCT;
    const stored = window.localStorage.getItem(storageKey);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) ? clamp(parsed, MIN_PCT, MAX_PCT) : DEFAULT_PCT;
  });
  const draggingRef = useRef(false);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, String(leftPct));
  }, [storageKey, leftPct]);

  useEffect(() => {
    function endResize() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    function handlePointerMove(event: PointerEvent) {
      if (!draggingRef.current || !containerRef.current) return;
      // Safety net: if the primary button is no longer held (e.g. a pointerup
      // was missed because it landed on an iframe), stop dragging.
      if (event.buttons === 0) {
        endResize();
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0) return;
      let pct = ((event.clientX - rect.left) / rect.width) * 100;
      if (rtl) pct = 100 - pct;
      setLeftPct(clamp(pct, MIN_PCT, MAX_PCT));
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endResize);
    window.addEventListener("pointercancel", endResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endResize);
      window.removeEventListener("pointercancel", endResize);
    };
  }, [rtl]);

  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // Capture the pointer on the divider so we keep receiving move/up events
    // even when the cursor passes over an <iframe> or other pane content —
    // otherwise the iframe swallows pointerup and the drag never ends.
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
    draggingRef.current = true;
    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const resetWidth = useCallback(() => setLeftPct(DEFAULT_PCT), []);

  return { containerRef, leftPct, resizing, startResize, resetWidth };
}
