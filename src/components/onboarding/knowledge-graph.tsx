"use client";

import { useState } from "react";
import { INTEGRATION_BY_ID } from "@/lib/integrations/preview-catalog";

// Two concentric orbit levels of recognizable knowledge sources. Ids are
// resolved against the real integrations catalog so logos + brand colors stay
// in sync; any id missing from the catalog is dropped and the ring re-spaces.
const LEVELS: { ids: string[]; radius: number; dur: number; reverse: boolean; size: number }[] = [
  {
    // Most popular knowledge bases — core doc / file stores
    ids: ["google-drive", "notion", "sharepoint", "confluence", "onedrive", "dropbox"],
    radius: 26,
    dur: 90,
    reverse: false,
    size: 44,
  },
  {
    // Everything else your work lives in — comms, dev, CRM, productivity
    ids: [
      "slack", "gmail", "github", "figma", "linear", "jira", "box",
      "airtable", "asana", "clickup", "zoom", "microsoft-teams", "salesforce",
    ],
    radius: 43,
    dur: 130,
    reverse: true,
    size: 40,
  },
];

const ACCENT = "#8B5E3C";
const PULSE_DUR = 2.8; // seconds for a dot to spiral into the hub

type Node = { id: string; name: string; logo: string; brand: string; x: number; y: number; path: string };

// Curved path from an app into the hub. The control point is the app's radius
// vector rotated ~55° and pulled inward, so every dot arcs the same way and the
// stream reads as a spiral converging on the center.
function spiralPath(x: number, y: number): string {
  const phi = (55 * Math.PI) / 180;
  const vx = x - 50;
  const vy = y - 50;
  const rx = vx * Math.cos(phi) - vy * Math.sin(phi);
  const ry = vx * Math.sin(phi) + vy * Math.cos(phi);
  const cx = 50 + rx * 0.5;
  const cy = 50 + ry * 0.5;
  return `M ${x.toFixed(2)} ${y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} 50 50`;
}

function buildNodes(ids: string[], radius: number): Node[] {
  return ids
    .map((id) => INTEGRATION_BY_ID[id])
    .filter(Boolean)
    .map((item, i, arr) => {
      const a = (-90 + (i * 360) / arr.length) * (Math.PI / 180);
      const x = 50 + radius * Math.cos(a);
      const y = 50 + radius * Math.sin(a);
      return { id: item.id, name: item.name, logo: item.logo, brand: item.brand, x, y, path: spiralPath(x, y) };
    });
}

const LEVEL_NODES = LEVELS.map((l) => buildNodes(l.ids, l.radius));
// Two explicit keyframes (CW / CCW) instead of animation-direction:reverse, so a
// ring and its counter-spin cancel to exactly zero and logos never tilt.
const spinFor = (l: (typeof LEVELS)[number]) =>
  `${l.reverse ? "kb-spin-rev" : "kb-spin"} ${l.dur}s linear infinite`;

/** Radial "everything flows into Cabinet" graph — orbiting logos, a living
 *  connector web, and dots spiralling into a heartbeat hub. */
export function KnowledgeGraph() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[440px]">
      <style>{`
        @keyframes kb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes kb-spin-rev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes kb-breathe { 0%, 100% { opacity: 0.05; } 50% { opacity: 0.16; } }
        @keyframes kb-beat {
          0%, 100% { transform: translate(-50%, -50%) scale(0.94); }
          50%      { transform: translate(-50%, -50%) scale(1.08); }
        }
        @keyframes kb-pop {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes kb-hub {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .kb-spin-el { animation: none !important; }
          .kb-line { animation: none !important; opacity: 0.1 !important; }
          .kb-hub-el { animation: none !important;
            transform: translate(-50%, -50%) scale(1) !important; }
          .kb-chip { animation: none !important; opacity: 1 !important;
            transform: translate(-50%, -50%) scale(1) !important; }
        }
      `}</style>

      {/* ── Background layer: connector web + spiralling dots ── */}
      {LEVELS.map((level, li) => (
        <OrbitWeb key={`web-${li}`} nodes={LEVEL_NODES[li]} spin={spinFor(level)} baseDelay={0.3 + li * 0.25} />
      ))}

      {/* ── Foreground layer: app icons (above the web) ── */}
      {LEVELS.map((level, li) => (
        <OrbitChips key={`chips-${li}`} nodes={LEVEL_NODES[li]} level={level} baseDelay={0.3 + li * 0.25} />
      ))}

      {/* Cabinet hub — pops in, then beats like a heartbeat */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/cabinet-3d.png"
        alt="Cabinet"
        width={104}
        height={104}
        className="kb-hub-el absolute left-1/2 top-1/2 z-20 object-contain drop-shadow-lg"
        style={{ animation: "kb-hub 0.6s ease-out 0.15s both, kb-beat 4.5s ease-in-out 0.9s infinite" }}
      />
    </div>
  );
}

// Rotating connector web + the dots that spiral inward, one by one. Kept in its
// own rotating layer (identical spin to the icons) so it stays behind them.
function OrbitWeb({ nodes, spin, baseDelay }: { nodes: Node[]; spin: string; baseDelay: number }) {
  const n = nodes.length;
  return (
    <div className="kb-spin-el absolute inset-0" style={{ animation: spin }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {nodes.map((node, i) => (
          <path
            key={node.id}
            d={node.path}
            fill="none"
            stroke={ACCENT}
            strokeWidth={0.3}
            strokeLinecap="round"
            className="kb-line"
            style={{ opacity: 0.1, animation: "kb-breathe 4s ease-in-out infinite", animationDelay: `${baseDelay + i * 0.22}s` }}
          />
        ))}
        {nodes.map((node, i) => (
          <circle key={`p-${node.id}`} r={0.85} fill={ACCENT}>
            {/* Even time-stagger across the loop => a steady one-by-one spiral stream */}
            <animateMotion dur={`${PULSE_DUR}s`} begin={`${(i / n) * PULSE_DUR}s`} repeatCount="indefinite" path={node.path} />
            <animate
              attributeName="opacity"
              dur={`${PULSE_DUR}s`}
              begin={`${(i / n) * PULSE_DUR}s`}
              repeatCount="indefinite"
              values="0;0.8;0.8;0"
              keyTimes="0;0.15;0.9;1"
            />
          </circle>
        ))}
      </svg>
    </div>
  );
}

function OrbitChips({
  nodes,
  level,
  baseDelay,
}: {
  nodes: Node[];
  level: (typeof LEVELS)[number];
  baseDelay: number;
}) {
  // Counter-spin: the exact opposite keyframe, same duration, so it cancels the
  // parent ring's rotation and the logo stays upright.
  const counterSpin = `${level.reverse ? "kb-spin" : "kb-spin-rev"} ${level.dur}s linear infinite`;
  return (
    <div className="kb-spin-el absolute inset-0 z-10" style={{ animation: spinFor(level) }}>
      {nodes.map((node, i) => (
        <AppChip key={node.id} node={node} size={level.size} counterSpin={counterSpin} delay={baseDelay + i * 0.06} />
      ))}
    </div>
  );
}

function AppChip({
  node,
  size,
  counterSpin,
  delay,
}: {
  node: Node;
  size: number;
  counterSpin: string;
  delay: number;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="kb-chip absolute flex items-center justify-center rounded-xl border border-black/5 bg-white shadow-sm"
      style={{
        left: `${node.x}%`,
        top: `${node.y}%`,
        width: size,
        height: size,
        animation: "kb-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
        animationDelay: `${delay}s`,
      }}
    >
      {/* Counter-rotates the parent orbit so the logo stays upright */}
      <div
        className="kb-spin-el flex h-full w-full items-center justify-center"
        style={{ animation: counterSpin }}
        title={node.name}
      >
        {failed ? (
          <span
            className="flex h-full w-full items-center justify-center rounded-xl text-sm font-semibold text-white"
            style={{ background: node.brand }}
          >
            {node.name.charAt(0)}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={node.logo}
            alt=""
            width={size * 0.58}
            height={size * 0.58}
            className="object-contain"
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  );
}
