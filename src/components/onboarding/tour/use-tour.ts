"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// useLayoutEffect logs a no-op warning during SSR; alias to useEffect on the
// server so the auto-open path stays sync-before-paint on the client without
// console noise.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const TOUR_DONE_STORAGE_KEY = "cabinet.tour-done";
const SHOW_TOUR_EVENT = "cabinet:show-tour";

export function shouldAutoOpenTour(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TOUR_DONE_STORAGE_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markTourDone() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOUR_DONE_STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

export function requestShowTour() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHOW_TOUR_EVENT));
}

export function useTour(
  autoOpenOnMount: boolean,
  opts?: { autoOpenDelayMs?: number },
) {
  const [open, setOpen] = useState(false);
  const didAutoOpenRef = useRef(false);
  const delay = opts?.autoOpenDelayMs ?? 0;

  // Reacting to an externally-controlled ready signal (wizard done), so
  // setting state here is the right thing. The ref guards against
  // re-triggering if the consumer toggles the input back and forth.
  // useLayoutEffect (not useEffect) so the open flip lands before the
  // browser paints — otherwise the user sees one frame of the bare app
  // between wizard unmount and tour mount, which breaks the onboarding
  // flow.
  useIsoLayoutEffect(() => {
    if (didAutoOpenRef.current) return;
    if (!autoOpenOnMount) return;
    if (!shouldAutoOpenTour()) {
      didAutoOpenRef.current = true;
      return;
    }
    didAutoOpenRef.current = true;
    if (delay <= 0) {
      setOpen(true);
      return;
    }
    const t = window.setTimeout(() => setOpen(true), delay);
    return () => window.clearTimeout(t);
  }, [autoOpenOnMount, delay]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(SHOW_TOUR_EVENT, handler);
    return () => window.removeEventListener(SHOW_TOUR_EVENT, handler);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    markTourDone();
  }, []);

  const show = useCallback(() => setOpen(true), []);

  return { open, close, show };
}
