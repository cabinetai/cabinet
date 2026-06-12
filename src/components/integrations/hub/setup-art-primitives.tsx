"use client";

import type { ReactNode } from "react";
import { Check, CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared primitives for the integration setup-art "mini-mockups". These are the
 * pieces every pattern/connector renderer composes from — a fake app window, a
 * brand-tinted button, a checklist row, etc. — built purely from theme tokens +
 * the connector's `brand` color so the art is correct in every theme with no
 * screenshots. Connector-specific pieces (chat bubbles, OAuth scope pills, menu
 * rows) stay local to their own art files; only the genuinely shared shapes
 * live here. See `generic-setup-art.tsx` for the dispatcher that uses them.
 */

/** A faux third-party app window with a brand-dotted title bar. */
export function MockWindow({
  title,
  brand,
  children,
}: {
  title: string;
  brand: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card text-[11px] shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-2.5 py-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: `${brand}66` }} />
        <span className="h-2 w-2 rounded-full bg-foreground/15" />
        <span className="h-2 w-2 rounded-full bg-foreground/15" />
        <span className="ml-1.5 truncate text-[10px] font-medium text-muted-foreground">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/** A one-line "do this, then…" note under the mockup, with a brand arrow. */
export function Hint({ brand, children }: { brand: string; children: ReactNode }) {
  return (
    <div className="mt-2.5 flex items-start gap-1.5 text-[10.5px] leading-snug text-muted-foreground">
      <CornerDownRight className="mt-px h-3 w-3 shrink-0" style={{ color: brand }} />
      <span>{children}</span>
    </div>
  );
}

/** Rounded-square brand tile with an initial — a generic app/account avatar. */
export function Avatar({ brand, children }: { brand: string; children: ReactNode }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold uppercase text-white"
      style={{ background: brand }}
    >
      {children}
    </span>
  );
}

/** A checklist row. `on` (default true) toggles between a filled tick and an empty box. */
export function CheckRow({
  brand,
  on = true,
  children,
}: {
  brand: string;
  on?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[10.5px] text-foreground">
      <span
        className={cn(
          "flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px]",
          !on && "border border-foreground/25",
        )}
        style={on ? { background: brand } : undefined}
      >
        {on && <Check className="h-2 w-2 text-white" />}
      </span>
      {children}
    </div>
  );
}

/** A small button — brand-filled when `brand` is set, neutral otherwise. */
export function BtnMock({
  brand,
  full,
  children,
}: {
  brand?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md px-2.5 py-1 text-[10px] font-semibold",
        full && "mt-2 w-full",
        brand ? "text-white" : "bg-foreground/[0.06] text-muted-foreground",
      )}
      style={brand ? { background: brand } : undefined}
    >
      {children}
    </span>
  );
}

/** A faux text input / mono value field. */
export function FieldMock({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 rounded-md bg-foreground/[0.06] px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </div>
  );
}

/** A key → mono-value row (IDs, config values). */
export function KvRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-foreground/[0.04] px-2 py-1">
      <span className="text-[10px] text-muted-foreground">{k}</span>
      <span className="font-mono text-[10px] text-foreground">{v}</span>
    </div>
  );
}

/** A labelled on/off switch row. */
export function ToggleRow({ label, on, brand }: { label: string; on?: boolean; brand: string }) {
  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5" style={{ background: `${brand}14` }}>
      <span className="text-[10.5px] text-foreground">{label}</span>
      <span
        className={cn("relative h-4 w-7 rounded-full", !on && "bg-foreground/15")}
        style={on ? { background: brand } : undefined}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm",
            on ? "right-0.5" : "left-0.5",
          )}
        />
      </span>
    </div>
  );
}
