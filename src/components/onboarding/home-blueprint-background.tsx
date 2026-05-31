"use client";

import { useMemo } from "react";
import { useLocale } from "@/i18n/use-locale";

interface HomeBlueprintBackgroundProps {
  accent: string;
  accentSoft: string;
  paper: string;
}

interface Wall {
  d: string;
  len: number;
  delay: number;
}

interface Room {
  id: string;
  cx: number;
  cy: number;
  appearAt: number;
  cabinets: Cabinet[];
}

interface Cabinet {
  x: number;
  y: number;
  w: number;
  h: number;
  shelves: number;
  appearAt: number;
  kind?: "desk" | "shelf" | "sofa" | "plant" | "rug";
}

const VB_W = 1000;
const VB_H = 620;

// 3×3 grid wrapping a central patio courtyard (340-660, 180-440).
// The onboarding popup sits in the patio; surrounding rooms feel like a house.
const WALLS: Wall[] = [
  // Outer walls (drawn first, clockwise from top-left)
  { d: "M 60 60 L 940 60", len: 880, delay: 0 },
  { d: "M 940 60 L 940 560", len: 500, delay: 0.22 },
  { d: "M 940 560 L 60 560", len: 880, delay: 0.44 },
  { d: "M 60 560 L 60 60", len: 500, delay: 0.66 },

  // Top horizontal divider y=180 — door gap STUDY→PATIO at x=460-540
  { d: "M 60 180 L 320 180", len: 260, delay: 1.0 },
  { d: "M 360 180 L 460 180", len: 100, delay: 1.08 },
  { d: "M 540 180 L 640 180", len: 100, delay: 1.16 },
  { d: "M 680 180 L 940 180", len: 260, delay: 1.24 },

  // Bottom horizontal divider y=440 — door gap DINING→PATIO at x=460-540
  { d: "M 60 440 L 320 440", len: 260, delay: 1.32 },
  { d: "M 360 440 L 460 440", len: 100, delay: 1.4 },
  { d: "M 540 440 L 640 440", len: 100, delay: 1.48 },
  { d: "M 680 440 L 940 440", len: 260, delay: 1.56 },

  // Left vertical divider x=340 — door gap LIBRARY→PATIO at y=280-320
  { d: "M 340 60 L 340 180", len: 120, delay: 1.62 },
  { d: "M 340 180 L 340 280", len: 100, delay: 1.7 },
  { d: "M 340 320 L 340 440", len: 120, delay: 1.78 },
  { d: "M 340 440 L 340 560", len: 120, delay: 1.86 },

  // Right vertical divider x=660 — door gap KITCHEN→PATIO at y=280-320
  { d: "M 660 60 L 660 180", len: 120, delay: 1.66 },
  { d: "M 660 180 L 660 280", len: 100, delay: 1.74 },
  { d: "M 660 320 L 660 440", len: 120, delay: 1.82 },
  { d: "M 660 440 L 660 560", len: 120, delay: 1.9 },
];

// Door arcs — four into the patio + corner-room transitions
const DOORS = [
  // Patio entrances from each adjacent room
  { d: "M 460 180 A 40 40 0 0 1 500 220", delay: 1.12 },  // STUDY → PATIO (top)
  { d: "M 460 440 A 40 40 0 0 0 500 400", delay: 1.44 },  // DINING → PATIO (bottom)
  { d: "M 340 280 A 40 40 0 0 1 380 320", delay: 1.74 },  // LIBRARY → PATIO (left)
  { d: "M 660 280 A 40 40 0 0 0 620 320", delay: 1.78 },  // KITCHEN → PATIO (right)
  // Side-room passes
  { d: "M 320 180 A 40 40 0 0 1 360 220", delay: 1.04 },  // OFFICE → LIBRARY
  { d: "M 640 180 A 40 40 0 0 0 680 220", delay: 1.2 },   // LAB → KITCHEN
  { d: "M 320 440 A 40 40 0 0 0 360 400", delay: 1.36 },  // FAMILY → LIBRARY
  { d: "M 640 440 A 40 40 0 0 1 680 400", delay: 1.52 },  // STUDIO → KITCHEN
];

// 8 rooms wrapping the central patio (340-660, 180-440).
// Furniture placed against outer walls so it never crowds the popup.
const ROOMS: Room[] = [
  // Top row
  {
    id: "office",
    cx: 200,
    cy: 105,
    appearAt: 2.3,
    cabinets: [
      { x: 80, y: 130, w: 160, h: 30, shelves: 3, appearAt: 2.7, kind: "desk" },
      { x: 270, y: 80, w: 50, h: 80, shelves: 4, appearAt: 2.82, kind: "shelf" },
    ],
  },
  {
    id: "study",
    cx: 500,
    cy: 105,
    appearAt: 2.38,
    cabinets: [
      { x: 360, y: 130, w: 90, h: 30, shelves: 0, appearAt: 2.78, kind: "desk" },
      { x: 550, y: 130, w: 90, h: 30, shelves: 0, appearAt: 2.85, kind: "desk" },
    ],
  },
  {
    id: "lab",
    cx: 800,
    cy: 105,
    appearAt: 2.46,
    cabinets: [
      { x: 680, y: 80, w: 50, h: 80, shelves: 4, appearAt: 2.9, kind: "shelf" },
      { x: 750, y: 130, w: 170, h: 30, shelves: 5, appearAt: 2.98, kind: "desk" },
    ],
  },
  // Middle row (flanking the patio)
  {
    id: "library",
    cx: 200,
    cy: 235,
    appearAt: 2.54,
    cabinets: [
      { x: 80, y: 200, w: 50, h: 220, shelves: 6, appearAt: 3.0, kind: "shelf" },
      { x: 160, y: 360, w: 160, h: 60, shelves: 0, appearAt: 3.12, kind: "sofa" },
    ],
  },
  {
    id: "kitchen",
    cx: 800,
    cy: 275,
    appearAt: 2.62,
    cabinets: [
      { x: 870, y: 200, w: 50, h: 220, shelves: 6, appearAt: 3.05, kind: "shelf" },
      { x: 680, y: 200, w: 170, h: 30, shelves: 0, appearAt: 3.18, kind: "desk" },
      { x: 700, y: 320, w: 50, h: 60, shelves: 0, appearAt: 3.26, kind: "plant" },
    ],
  },
  // Bottom row
  {
    id: "family",
    cx: 200,
    cy: 500,
    appearAt: 2.7,
    cabinets: [
      { x: 80, y: 470, w: 220, h: 60, shelves: 0, appearAt: 3.2, kind: "sofa" },
    ],
  },
  {
    id: "dining",
    cx: 500,
    cy: 500,
    appearAt: 2.78,
    cabinets: [
      { x: 380, y: 460, w: 240, h: 70, shelves: 0, appearAt: 3.28, kind: "rug" },
    ],
  },
  {
    id: "studio",
    cx: 800,
    cy: 500,
    appearAt: 2.86,
    cabinets: [
      { x: 680, y: 470, w: 130, h: 60, shelves: 3, appearAt: 3.32, kind: "desk" },
      { x: 840, y: 470, w: 60, h: 70, shelves: 0, appearAt: 3.4, kind: "plant" },
    ],
  },
];

// Agents — small filled circles that drift inside each room's interior. Two per
// room, placed away from furniture. Wander variants + durations are staggered
// so they don't all move in lockstep.
interface Agent {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
  wander: "a" | "b" | "c";
  duration: number; // seconds
  delay: number;    // seconds
}

const AGENTS: Agent[] = [
  // OFFICE (x 20-320, y 20-175)
  { cx: 160, cy: 60,  r: 4.5, opacity: 0.5,  wander: "a", duration: 7,  delay: 3.5 },
  { cx: 240, cy: 50,  r: 4,   opacity: 0.42, wander: "b", duration: 9,  delay: 3.9 },
  // STUDY (x 350-650)
  { cx: 430, cy: 55,  r: 4.5, opacity: 0.5,  wander: "b", duration: 8,  delay: 3.6 },
  { cx: 580, cy: 60,  r: 4,   opacity: 0.42, wander: "c", duration: 10, delay: 4.0 },
  // LAB
  { cx: 750, cy: 55,  r: 4.5, opacity: 0.5,  wander: "c", duration: 7.5, delay: 3.7 },
  { cx: 900, cy: 60,  r: 4,   opacity: 0.42, wander: "a", duration: 9.5, delay: 4.1 },
  // LIBRARY (x 20-320, y 200-420) — avoid the shelf at x 80-130
  { cx: 230, cy: 240, r: 4.5, opacity: 0.5,  wander: "a", duration: 8.5, delay: 3.8 },
  { cx: 250, cy: 330, r: 4,   opacity: 0.42, wander: "c", duration: 10.5, delay: 4.2 },
  // KITCHEN (x 680-940) — avoid shelf at x 870-920
  { cx: 740, cy: 270, r: 4.5, opacity: 0.5,  wander: "b", duration: 8,  delay: 3.9 },
  { cx: 820, cy: 360, r: 4,   opacity: 0.42, wander: "a", duration: 10, delay: 4.3 },
  // FAMILY (x 20-320, y 455-610)
  { cx: 180, cy: 460, r: 4.5, opacity: 0.5,  wander: "c", duration: 7.5, delay: 4.0 },
  { cx: 280, cy: 455, r: 4,   opacity: 0.42, wander: "b", duration: 9,  delay: 4.4 },
  // DINING
  { cx: 430, cy: 455, r: 4.5, opacity: 0.5,  wander: "a", duration: 8.5, delay: 4.1 },
  { cx: 570, cy: 460, r: 4,   opacity: 0.42, wander: "c", duration: 9.5, delay: 4.5 },
  // STUDIO
  { cx: 745, cy: 455, r: 4.5, opacity: 0.5,  wander: "b", duration: 8,  delay: 4.2 },
  { cx: 870, cy: 455, r: 4,   opacity: 0.42, wander: "a", duration: 10, delay: 4.6 },
];

// Patio (central courtyard) — open space with corner plants + a dashed garden border.
// The popup card lives inside this rectangle.
const PATIO = {
  x: 340,
  y: 180,
  w: 320,
  h: 260,
  // Corner plants framing the courtyard
  plants: [
    { x: 360, y: 200, w: 40, h: 40, appearAt: 2.95 },
    { x: 600, y: 200, w: 40, h: 40, appearAt: 3.02 },
    { x: 360, y: 400, w: 40, h: 40, appearAt: 3.09 },
    { x: 600, y: 400, w: 40, h: 40, appearAt: 3.16 },
  ],
  labelDelay: 2.5,
};

export function HomeBlueprintBackground({
  accent,
  accentSoft,
  paper,
}: HomeBlueprintBackgroundProps) {
  const { t } = useLocale();
  const gridId = useMemo(
    () => `bp-grid-${Math.random().toString(36).slice(2, 8)}`,
    []
  );

  return (
    <div className="bp-root pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes bp-draw {
          from { stroke-dashoffset: var(--bp-len, 200); }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes bp-appear {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: var(--bp-op, 1); transform: translateY(0); }
        }
        @keyframes bp-pop {
          0%   { opacity: 0; transform: scale(0.6); }
          60%  { opacity: 1; transform: scale(1.04); }
          100% { opacity: var(--bp-op, 1); transform: scale(1); }
        }
        @keyframes bp-pulse {
          0%, 100% { opacity: var(--bp-op, 0.5); }
          50%      { opacity: calc(var(--bp-op, 0.5) * 1.6); }
        }
        @keyframes bp-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .bp-wall {
          stroke-dasharray: var(--bp-len, 200);
          stroke-dashoffset: var(--bp-len, 200);
          animation: bp-draw 0.75s cubic-bezier(0.2, 0.9, 0.2, 1) var(--bp-d, 0s) forwards;
        }
        .bp-door {
          stroke-dasharray: 70;
          stroke-dashoffset: 70;
          animation: bp-draw 0.55s ease-out var(--bp-d, 0s) forwards;
        }
        .bp-label {
          opacity: 0;
          transform-origin: center;
          transform-box: fill-box;
          animation: bp-appear 0.7s ease-out var(--bp-d, 0s) forwards;
        }
        .bp-cabinet {
          opacity: 0;
          transform-origin: center;
          transform-box: fill-box;
          animation: bp-pop 0.55s cubic-bezier(0.3, 1.3, 0.5, 1) var(--bp-d, 0s) forwards;
        }
        .bp-dot {
          opacity: 0;
          animation: bp-fade-in 0.4s linear var(--bp-d, 0s) forwards,
                     bp-pulse 3.2s ease-in-out var(--bp-d, 0s) infinite;
          --bp-op: 0.6;
        }
        .bp-grid-fade {
          animation: bp-fade-in 1s ease-out 0s forwards;
          opacity: 0;
        }
        .bp-tick {
          stroke-dasharray: 10;
          stroke-dashoffset: 10;
          animation: bp-draw 0.4s ease-out var(--bp-d, 0s) forwards;
        }
        @keyframes bp-wander-a {
          0%, 100% { transform: translate(0, 0); }
          33%      { transform: translate(20px, -12px); }
          66%      { transform: translate(-14px, 14px); }
        }
        @keyframes bp-wander-b {
          0%, 100% { transform: translate(0, 0); }
          25%      { transform: translate(-18px, -8px); }
          50%      { transform: translate(14px, 6px); }
          75%      { transform: translate(-6px, 18px); }
        }
        @keyframes bp-wander-c {
          0%, 100% { transform: translate(0, 0); }
          40%      { transform: translate(16px, 10px); }
          80%      { transform: translate(-20px, 4px); }
        }
        .bp-agent {
          opacity: 0;
          transform-origin: center;
          transform-box: fill-box;
          animation: bp-fade-in 0.6s ease-out var(--bp-d, 0s) forwards,
                     var(--bp-wander, bp-wander-a) var(--bp-dur, 14s) ease-in-out var(--bp-d, 0s) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .bp-wall, .bp-door, .bp-tick { stroke-dashoffset: 0; animation: none; }
          .bp-label, .bp-cabinet, .bp-dot { opacity: var(--bp-op, 1); transform: none; animation: none; }
          .bp-agent { opacity: 1; transform: none; animation: none; }
          .bp-grid-fade { opacity: 1; animation: none; }
        }
      `}</style>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        style={{ color: accent }}
      >
        <defs>
          <pattern
            id={gridId}
            x={0}
            y={0}
            width={24}
            height={24}
            patternUnits="userSpaceOnUse"
          >
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke={accent} strokeWidth={0.4} opacity={0.35} />
          </pattern>
          <radialGradient id={`${gridId}-mask`} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="white" stopOpacity={1} />
            <stop offset="70%" stopColor="white" stopOpacity={0.65} />
            <stop offset="100%" stopColor="white" stopOpacity={0.1} />
          </radialGradient>
          <mask id={`${gridId}-vignette`}>
            <rect width="100%" height="100%" fill={`url(#${gridId}-mask)`} />
          </mask>
        </defs>

        {/* Grid paper across the full frame */}
        <g mask={`url(#${gridId}-vignette)`} className="bp-grid-fade">
          <rect x={0} y={0} width={VB_W} height={VB_H} fill={`url(#${gridId})`} />
        </g>

        {/* Corner brackets (blueprint-style callouts) */}
        <g stroke={accent} strokeWidth={1.25} fill="none" opacity={0.55}>
          <path
            d="M 40 72 L 40 40 L 72 40"
            className="bp-tick"
            style={{ ["--bp-d" as string]: "0.05s" } as React.CSSProperties}
          />
          <path
            d="M 960 40 L 960 72"
            className="bp-tick"
            style={{ ["--bp-d" as string]: "0.1s" } as React.CSSProperties}
          />
          <path
            d="M 928 40 L 960 40"
            className="bp-tick"
            style={{ ["--bp-d" as string]: "0.12s" } as React.CSSProperties}
          />
          <path
            d="M 40 548 L 40 580 L 72 580"
            className="bp-tick"
            style={{ ["--bp-d" as string]: "0.14s" } as React.CSSProperties}
          />
          <path
            d="M 928 580 L 960 580 L 960 548"
            className="bp-tick"
            style={{ ["--bp-d" as string]: "0.16s" } as React.CSSProperties}
          />
        </g>

        {/* Outer + interior walls */}
        <g stroke={accent} strokeWidth={3.5} fill="none" strokeLinecap="round" opacity={0.95}>
          {WALLS.map((w, i) => (
            <path
              key={`wall-${i}`}
              d={w.d}
              className="bp-wall"
              style={
                {
                  ["--bp-len" as string]: w.len,
                  ["--bp-d" as string]: `${w.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </g>

        {/* Door arcs */}
        <g stroke={accent} strokeWidth={1.2} fill="none" opacity={0.65} strokeLinecap="round">
          {DOORS.map((door, i) => (
            <path
              key={`door-${i}`}
              d={door.d}
              className="bp-door"
              style={{ ["--bp-d" as string]: `${door.delay}s` } as React.CSSProperties}
            />
          ))}
        </g>

        {/* Measurement ticks along the top edge */}
        <g stroke={accent} strokeWidth={0.8} opacity={0.35}>
          {Array.from({ length: 9 }, (_, i) => {
            const x = 60 + i * 110;
            return (
              <line
                key={`tick-${i}`}
                x1={x}
                y1={32}
                x2={x}
                y2={46}
                className="bp-tick"
                style={{ ["--bp-d" as string]: `${0.2 + i * 0.04}s` } as React.CSSProperties}
              />
            );
          })}
        </g>

        {/* Cabinets + details (per room) */}
        <g>
          {ROOMS.flatMap((room) =>
            room.cabinets.map((c, idx) => (
              <g
                key={`cab-${room.id}-${idx}`}
                className="bp-cabinet"
                style={
                  {
                    ["--bp-d" as string]: `${c.appearAt}s`,
                    ["--bp-op" as string]: 0.78,
                  } as React.CSSProperties
                }
              >
                {c.kind === "plant" ? (
                  <>
                    <circle
                      cx={c.x + c.w / 2}
                      cy={c.y + c.h / 2 - 4}
                      r={Math.min(c.w, c.h) / 2 - 6}
                      fill="none"
                      stroke={accent}
                      strokeWidth={1.3}
                    />
                    <path
                      d={`M ${c.x + c.w / 2} ${c.y + c.h / 2 + 2} L ${c.x + c.w / 2} ${c.y + c.h - 2}`}
                      stroke={accent}
                      strokeWidth={1.1}
                    />
                  </>
                ) : c.kind === "rug" ? (
                  <>
                    <rect
                      x={c.x}
                      y={c.y}
                      width={c.w}
                      height={c.h}
                      rx={6}
                      fill={accentSoft}
                      opacity={0.35}
                      stroke={accent}
                      strokeWidth={0.8}
                      strokeDasharray="3 4"
                    />
                  </>
                ) : c.kind === "sofa" ? (
                  <>
                    <rect
                      x={c.x}
                      y={c.y}
                      width={c.w}
                      height={c.h}
                      rx={10}
                      fill="none"
                      stroke={accent}
                      strokeWidth={1.4}
                    />
                    <rect
                      x={c.x + 8}
                      y={c.y + 10}
                      width={c.w - 16}
                      height={c.h - 20}
                      rx={6}
                      fill={accentSoft}
                      opacity={0.3}
                    />
                  </>
                ) : (
                  <>
                    <rect
                      x={c.x}
                      y={c.y}
                      width={c.w}
                      height={c.h}
                      fill="none"
                      stroke={accent}
                      strokeWidth={1.35}
                    />
                    <rect
                      x={c.x}
                      y={c.y}
                      width={c.w}
                      height={c.h}
                      fill={accentSoft}
                      opacity={0.18}
                    />
                    {Array.from({ length: c.shelves }, (_, i) => {
                      const y = c.y + ((i + 1) * c.h) / (c.shelves + 1);
                      return (
                        <line
                          key={`shelf-${i}`}
                          x1={c.x + 4}
                          y1={y}
                          x2={c.x + c.w - 4}
                          y2={y}
                          stroke={accent}
                          strokeWidth={0.8}
                          opacity={0.7}
                        />
                      );
                    })}
                  </>
                )}
              </g>
            ))
          )}
        </g>

        {/* Patio — dashed garden border + corner plants framing the courtyard */}
        <g>
          <rect
            x={PATIO.x + 18}
            y={PATIO.y + 18}
            width={PATIO.w - 36}
            height={PATIO.h - 36}
            rx={10}
            fill={accentSoft}
            opacity={0.18}
            stroke={accent}
            strokeWidth={0.9}
            strokeDasharray="4 5"
            className="bp-cabinet"
            style={
              {
                ["--bp-d" as string]: "2.85s",
                ["--bp-op" as string]: 0.7,
              } as React.CSSProperties
            }
          />
          {PATIO.plants.map((p, i) => (
            <g
              key={`patio-plant-${i}`}
              className="bp-cabinet"
              style={
                {
                  ["--bp-d" as string]: `${p.appearAt}s`,
                  ["--bp-op" as string]: 0.85,
                } as React.CSSProperties
              }
            >
              <circle
                cx={p.x + p.w / 2}
                cy={p.y + p.h / 2 - 4}
                r={p.w / 2 - 4}
                fill={accentSoft}
                opacity={0.4}
                stroke={accent}
                strokeWidth={1.3}
              />
              <path
                d={`M ${p.x + p.w / 2} ${p.y + p.h / 2 + 2} L ${p.x + p.w / 2} ${p.y + p.h - 2}`}
                stroke={accent}
                strokeWidth={1.1}
              />
            </g>
          ))}
          {/* Patio label intentionally omitted — the courtyard stays empty so
              the popup sits in clean space. */}
        </g>

        {/* Agents — small filled circles wandering inside each room. */}
        <g>
          {AGENTS.map((a, i) => (
            <circle
              key={`agent-${i}`}
              cx={a.cx}
              cy={a.cy}
              r={a.r}
              fill={accent}
              opacity={a.opacity}
              className="bp-agent"
              style={
                {
                  ["--bp-d" as string]: `${a.delay}s`,
                  ["--bp-wander" as string]: `bp-wander-${a.wander}`,
                  ["--bp-dur" as string]: `${a.duration}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </g>

        {/* Small decorative dots scattered in each room — kept clear of the patio */}
        <g fill={accent}>
          {[
            { cx: 160, cy: 100, delay: 3.4 },
            { cx: 280, cy: 80, delay: 3.55 },
            { cx: 480, cy: 100, delay: 3.45 },
            { cx: 560, cy: 90, delay: 3.6 },
            { cx: 760, cy: 100, delay: 3.5 },
            { cx: 870, cy: 95, delay: 3.65 },
            { cx: 200, cy: 270, delay: 3.7 },
            { cx: 870, cy: 290, delay: 3.78 },
            { cx: 220, cy: 510, delay: 3.85 },
            { cx: 420, cy: 510, delay: 3.9 },
            { cx: 700, cy: 510, delay: 3.95 },
            { cx: 860, cy: 510, delay: 4.0 },
          ].map((d, i) => (
            <circle
              key={`dot-${i}`}
              cx={d.cx}
              cy={d.cy}
              r={2}
              className="bp-dot"
              style={{ ["--bp-d" as string]: `${d.delay}s` } as React.CSSProperties}
            />
          ))}
        </g>

        {/* Room labels */}
        <g fontFamily="'JetBrains Mono', ui-monospace, monospace" fill={accent}>
          {ROOMS.map((room) => (
            <g
              key={`label-${room.id}`}
              className="bp-label"
              style={
                {
                  ["--bp-d" as string]: `${room.appearAt}s`,
                  ["--bp-op" as string]: 1,
                } as React.CSSProperties
              }
            >
              <text
                x={room.cx}
                y={room.cy}
                textAnchor="middle"
                fontSize={17}
                letterSpacing={4}
                fontWeight={700}
                style={{ textTransform: "uppercase" }}
              >
                {t(`onboarding:blueprint.rooms.${room.id}`)}
              </text>
              <line
                x1={room.cx - 32}
                y1={room.cy + 8}
                x2={room.cx + 32}
                y2={room.cy + 8}
                stroke={accent}
                strokeWidth={1.2}
                opacity={0.8}
              />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
