"use client";

import { useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { showSuccess } from "@/lib/ui/toast";
import {
  type IntegrationItem,
  CATEGORY_META,
  groupByCategory,
} from "@/lib/integrations/preview-catalog";
import {
  LogoTile,
  DimWhenComingSoon,
  StatusBadge,
} from "@/components/integrations/hub/integration-visuals";

/**
 * Layout: "Premium logo wall / brand gallery".
 *
 * Evokes a marketing "Connect to everything" section — large logo tiles laid
 * out in airy, flex-wrapped rows under generous category headers. Each tile
 * lifts on hover and casts a soft glow in the integration's own brand colour
 * (an eased shadow fade, not a hard border). Coming-soon items are dimmed via
 * DimWhenComingSoon, disabled (not clickable), and carry a "Soon" badge.
 */
export function LayoutGallery({
  items,
  onOpen,
  connectedIds,
}: {
  items: IntegrationItem[];
  onOpen: (id: string) => void;
  /** Ids (incl. suite ids) that are currently connected. */
  connectedIds: Set<string>;
}) {
  const groups = groupByCategory(items);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {items.length === 0 ? (
          <div className="flex min-h-[24vh] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No integrations match your search.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {groups.map((group) => (
              <section key={group.category}>
                {/* Category header */}
                <div className="mb-5 flex items-baseline gap-2.5">
                  <h2 className="text-[13px] font-semibold text-foreground">
                    {CATEGORY_META[group.category].label}
                  </h2>
                  <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border">
                    {group.items.length}
                  </span>
                </div>

                {/* Logo wall */}
                <div className="flex flex-wrap gap-5">
                  {group.items.map((item) => (
                    <GalleryTile
                      key={item.id}
                      item={item}
                      onOpen={onOpen}
                      connectedIds={connectedIds}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <RequestSection />
      </div>
    </div>
  );
}

// A gentle back-and-forth wobble that loops while the tile is hovered.
const GIGGLE_FRAMES = [
  { transform: "rotate(0deg)" },
  { transform: "rotate(-6deg)" },
  { transform: "rotate(6deg)" },
  { transform: "rotate(0deg)" },
];

function GalleryTile({
  item,
  onOpen,
  connectedIds,
}: {
  item: IntegrationItem;
  onOpen: (id: string) => void;
  connectedIds: Set<string>;
}) {
  const connected =
    connectedIds.has(item.id) ||
    (!!item.coveredBy && connectedIds.has(item.coveredBy));
  const tileRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);

  // Drive the giggle in JS (Web Animations API) so it loops smoothly while the
  // tile is hovered/focused and doesn't depend on a global stylesheet.
  const startGiggle = () => {
    const el = tileRef.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animRef.current?.cancel();
    animRef.current = el.animate(GIGGLE_FRAMES, {
      duration: 600,
      easing: "ease-in-out",
      iterations: Infinity,
    });
  };
  const stopGiggle = () => {
    animRef.current?.cancel();
    animRef.current = null;
  };

  const soon = !item.implemented;

  return (
    <button
      type="button"
      disabled={soon}
      onClick={soon ? undefined : () => onOpen(item.id)}
      onMouseEnter={soon ? undefined : startGiggle}
      onMouseLeave={soon ? undefined : stopGiggle}
      onFocus={soon ? undefined : startGiggle}
      onBlur={soon ? undefined : stopGiggle}
      title={soon ? `${item.name} (coming soon)` : item.name}
      aria-label={soon ? `${item.name} (coming soon)` : item.name}
      className={cn(
        "group flex w-[112px] flex-col items-center gap-2.5",
        "rounded-2xl p-2 text-center focus:outline-none",
        soon ? "cursor-default" : "cursor-pointer",
      )}
    >
      {/* Visual stack — coming-soon tiles are dimmed and inert. */}
      <DimWhenComingSoon
        implemented={item.implemented}
        className="flex w-full flex-col items-center gap-2.5"
      >
        {/* Tile giggles on hover; soft brand glow eases in behind it */}
        <div className="relative">
          {!soon && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
              style={{
                boxShadow: `0 10px 28px -6px ${item.brand}66, 0 4px 10px -3px ${item.brand}40`,
              }}
            />
          )}
          {/* Wrapper is what we rotate, so the glow stays put behind it. */}
          <div ref={tileRef} className="relative">
            <LogoTile item={item} size={84} />
          </div>
        </div>

        {/* Name */}
        <span className="max-w-[96px] truncate text-[12px] font-medium text-foreground">
          {item.name}
        </span>
      </DimWhenComingSoon>

      {/* Coming-soon always reads "Soon" — even with a live connection from an
          earlier build — so gated tiles never advertise a state you can't open.
          "Connected" is reserved for launched integrations. */}
      {soon ? (
        <StatusBadge implemented={false} />
      ) : connected ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="h-2.5 w-2.5" /> Connected
        </span>
      ) : null}
    </button>
  );
}

/** "Don't see your integration?" — capture requests right from the gallery. */
function RequestSection() {
  const [value, setValue] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    showSuccess(`Thanks — we’ll look into “${v}”.`);
    setValue("");
  };
  return (
    <section className="mt-12 rounded-2xl bg-foreground/[0.025] px-6 py-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-foreground/[0.06]">
        <Sparkles className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mt-3 text-[14px] font-semibold text-foreground">
        Don’t see your integration?
      </h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Tell us what you need — we prioritize what people ask for most.
      </p>
      <form onSubmit={submit} className="mx-auto mt-4 flex max-w-md items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Airtable, QuickBooks, HubSpot…"
          className="h-9 flex-1 rounded-lg bg-foreground/[0.05] px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:bg-foreground/[0.08]"
        />
        <Button type="submit" disabled={!value.trim()}>
          Request
        </Button>
      </form>
    </section>
  );
}
