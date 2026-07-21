"use client";

import { AlertCircle, CheckCircle2, MoreHorizontal, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { CockpitAction, CockpitCard } from "@/lib/hermes/cockpit-types";
import {
  ACTION_LABELS,
  SECONDARY_ACTIONS,
  cardConsequence,
  formatRelativeTime,
  primaryAction,
  sourceLabel,
} from "./cockpit-model";

type LoadingState = { key: string; label: string } | null;

export function CockpitQueueRow({
  card,
  freshness,
  busy,
  compact = false,
  exiting = false,
  onOpen,
  onAction,
}: {
  card: CockpitCard;
  freshness: string | null;
  busy: LoadingState;
  compact?: boolean;
  exiting?: boolean;
  onOpen: (card: CockpitCard) => void;
  onAction: (action: CockpitAction, card: CockpitCard) => Promise<void>;
}) {
  const action = primaryAction(card);
  const pending = card.approval.state === "pending";
  const snoozed = Boolean(
    card.snoozedUntil &&
    new Date(card.snoozedUntil).getTime() > new Date(freshness ?? card.createdAt).getTime()
  );
  const secondary = pending ? (["reject", ...SECONDARY_ACTIONS] as CockpitAction[]) : SECONDARY_ACTIONS;

  return (
    <article
      className={cn(
        "group relative grid min-h-20 grid-cols-[4px_minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-card-edge bg-card shadow-sm transition-[transform,opacity,background-color] duration-200 motion-reduce:transition-none",
        compact ? "min-h-18" : "min-h-22",
        snoozed ? "opacity-60" : "hover:-translate-y-0.5 hover:bg-accent/35",
        exiting ? "cockpit-queue-exit pointer-events-none" : null,
        card.urgency === "critical" && !exiting ? "cockpit-critical-entrance" : null
      )}
      data-testid={`cockpit-queue-row-${card.id}`}
    >
      <span
        className={cn(
          "h-full w-1",
          card.urgency === "critical" ? "bg-destructive" : card.urgency === "high" ? "bg-warning" : "bg-command/45"
        )}
        aria-hidden="true"
      />
      <button
        type="button"
        className="min-w-0 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={() => onOpen(card)}
      >
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          <span>{sourceLabel(card.sourceType)}</span>
          <span aria-hidden="true">·</span>
          <span title={freshness ?? undefined}>{formatRelativeTime(freshness)}</span>
          {snoozed ? <span className="inline-flex items-center gap-1 normal-case tracking-normal"><RotateCcw className="size-3" />Snoozed</span> : null}
        </span>
        <span className="mt-1 block truncate text-sm font-semibold text-foreground">{card.title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{cardConsequence(card)}</span>
      </button>
      <div className="flex items-center gap-1.5 py-2.5 pe-2.5">
        {card.missingFacts?.length ? (
          <Badge variant="outline" title={`${card.missingFacts.length} missing fact${card.missingFacts.length === 1 ? "" : "s"}`}>
            <AlertCircle data-icon="inline-start" />
            {card.missingFacts.length}
          </Badge>
        ) : (
          <CheckCircle2 className="size-4 text-success" aria-label="Source facts complete" />
        )}
        <Button
          size="sm"
          className="bg-command text-white hover:bg-command/90"
          disabled={busy !== null}
          onClick={() => void onAction(action, card)}
          data-testid={`cockpit-primary-${card.id}`}
        >
          {ACTION_LABELS[action]}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${card.title}`} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>More actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onOpen(card)}>Open details</DropdownMenuItem>
              {secondary.map((item) => (
                <DropdownMenuItem
                  key={item}
                  variant={item === "reject" ? "destructive" : "default"}
                  onClick={() => void onAction(item, card)}
                >
                  {ACTION_LABELS[item]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
