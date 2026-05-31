"use client";

import type { CSSProperties } from "react";

/* ── Star burst explosion particles ── */
const BURST_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * Eight ✦ particles bursting from the center along the eight cardinal/diagonal
 * angles. Used in the status bar's GitHub-stars chip and in the feedback popup
 * to celebrate community signals — keep the two callsites visually consistent.
 *
 * Drop inside a `relative` container; the burst absolute-positions itself.
 * The keyframe `cabinet-star-burst` lives in `src/app/globals.css`.
 */
export function StarExplosion() {
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden="true">
      {BURST_ANGLES.map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const dist = i % 2 === 0 ? 18 : 14;
        const tx = Math.round(Math.cos(rad) * dist);
        const ty = Math.round(Math.sin(rad) * dist);
        return (
          <span
            key={angle}
            className="absolute left-1/2 top-1/2 text-[7px] leading-none text-amber-400"
            style={{
              "--sb-x": `${tx}px`,
              "--sb-y": `${ty}px`,
              animation: "cabinet-star-burst 0.65s ease-out forwards",
              animationDelay: `${i * 25}ms`,
            } as CSSProperties}
          >
            ✦
          </span>
        );
      })}
    </span>
  );
}

/** Compact star-count formatter — matches the status-bar convention. */
export function formatGithubStars(stars: number): string {
  if (stars >= 10_000) return `${(stars / 1000).toFixed(1)}k`;
  return new Intl.NumberFormat("en-US").format(stars);
}
