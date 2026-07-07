"use client";

/**
 * A horizontal ruler overlay shown only while the split divider is being
 * dragged. It spans both panes and renders a prominent marker at the exact
 * middle (50%) plus a live indicator at the current divider position. The
 * parent must be `position: relative`.
 */
export function SplitRuler({ leftPct, rtl = false }: { leftPct: number; rtl?: boolean }) {
  // `leftPct` is the source pane's fraction; in RTL that pane sits on the
  // right, so the physical x of the divider is mirrored.
  const physicalPct = rtl ? 100 - leftPct : leftPct;
  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      {/* Ruler baseline spanning both panes */}
      <div className="absolute inset-x-0 top-0 h-6 bg-primary/5 backdrop-blur-[1px]">
        <div className="absolute inset-x-0 bottom-0 h-px bg-primary/30" />
      </div>

      {/* Midpoint (50%) marker */}
      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2">
        <div className="absolute inset-y-0 w-px bg-primary/40" />
        <span className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
          50%
        </span>
      </div>

      {/* Live divider position */}
      <div
        className="absolute top-0 bottom-0"
        style={{ left: `${physicalPct}%`, transform: "translateX(-50%)" }}
      >
        <div className="absolute inset-y-0 w-px bg-primary" />
        <span className="absolute top-6 left-1/2 -translate-x-1/2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground tabular-nums">
          {Math.round(leftPct)}%
        </span>
      </div>
    </div>
  );
}
