"use client";

const STORAGE_KEY = "cabinet-calendar-hours";

export interface VisibleHours {
  start: number;
  end: number;
}

export const DEFAULT_VISIBLE_HOURS: VisibleHours = { start: 5, end: 23 };
export const MIN_HOUR = 0;
export const MAX_HOUR = 24;

function clampHours(value: VisibleHours): VisibleHours {
  const start = Math.max(MIN_HOUR, Math.min(MAX_HOUR - 1, Math.floor(value.start)));
  let end = Math.max(MIN_HOUR + 1, Math.min(MAX_HOUR, Math.floor(value.end)));
  if (end <= start) end = Math.min(MAX_HOUR, start + 1);
  return { start, end };
}

export function loadVisibleHours(): VisibleHours {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_HOURS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_HOURS;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.start !== "number" || typeof parsed?.end !== "number") {
      return DEFAULT_VISIBLE_HOURS;
    }
    return clampHours(parsed);
  } catch {
    return DEFAULT_VISIBLE_HOURS;
  }
}

export function saveVisibleHours(value: VisibleHours): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clampHours(value)));
  } catch {
    // ignore quota / privacy mode
  }
}
