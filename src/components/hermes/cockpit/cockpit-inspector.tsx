"use client";

import { ChevronDown, CircleCheck, Clock3, FileSearch, MessageSquareText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CockpitAction, CockpitCard, DailyBusinessCockpit } from "@/lib/hermes/cockpit-types";
import {
  ACTION_LABELS,
  associatedRun,
  formatExactTime,
  formatRelativeTime,
  primaryAction,
  sourceLabel,
} from "./cockpit-model";

function governedResultText(result: string): string {
  try {
    const parsed = JSON.parse(result) as Record<string, unknown>;
    return typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : result;
  } catch {
    return result;
  }
}

type LoadingState = { key: string; label: string } | null;

function AuditSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger render={<Button variant="ghost" className="w-full justify-between" />}>
        {title}
        <ChevronDown data-icon="inline-end" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 pb-3 text-xs text-muted-foreground">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CockpitInspector({
  card,
  cockpit,
  busy,
  onClose,
  onAction,
}: {
  card: CockpitCard | null;
  cockpit: DailyBusinessCockpit;
  busy: LoadingState;
  onClose: () => void;
  onAction: (action: CockpitAction, card: CockpitCard) => Promise<void>;
}) {
  const run = card ? associatedRun(card, cockpit.runs) : undefined;
  const action = card ? primaryAction(card) : "investigate";

  return (
    <Sheet open={card !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-[480px]"
        data-testid="cockpit-inspector"
      >
        {card ? (
          <>
            <SheetHeader className="border-b border-border pe-12">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={card.urgency === "critical" ? "destructive" : "outline"}>{card.urgency}</Badge>
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{sourceLabel(card.sourceType)}</span>
                <span className="text-xs text-muted-foreground">{formatRelativeTime(card.createdAt)}</span>
              </div>
              <SheetTitle className="mt-2 text-xl leading-tight">{card.title}</SheetTitle>
              <SheetDescription>{card.summary}</SheetDescription>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-5 p-4 pb-28">
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Why it matters</h3>
                  <p className="text-sm leading-relaxed">{card.whyItMatters}</p>
                </section>

                <section className="rounded-xl bg-command/8 p-4 ring-1 ring-command/15">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-command">Recommended move</h3>
                  <p className="mt-2 text-sm font-medium leading-relaxed">{card.recommendedNextStep}</p>
                </section>

                {card.missingFacts?.length ? (
                  <section className="rounded-xl bg-warning/8 p-4 ring-1 ring-warning/20">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-warning">Missing facts</h3>
                    <ul className="mt-2 flex list-disc flex-col gap-1.5 ps-4 text-sm">
                      {card.missingFacts.map((fact) => <li key={fact}>{fact}</li>)}
                    </ul>
                  </section>
                ) : null}

                {(card.relatedItemCount ?? 0) > 1 || card.relatedItemDates?.length ? (
                  <section className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Related sources · {card.relatedItemCount ?? card.relatedItemDates?.length ?? 1}
                    </h3>
                    {card.relatedItemDates?.length ? (
                      <div className="flex flex-col gap-1 text-sm">
                        {card.relatedItemDates.map((date) => (
                          <span key={date}><Clock3 className="me-2 inline size-3.5 text-muted-foreground" />{formatRelativeTime(date)} · {formatExactTime(date)}</span>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {card.contextNotes?.length ? (
                  <section className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Context</h3>
                    <ul className="flex list-disc flex-col gap-1.5 ps-4 text-sm text-muted-foreground">
                      {card.contextNotes.map((note) => <li key={note}>{note}</li>)}
                    </ul>
                  </section>
                ) : null}

                {run ? (
                  <section className="rounded-xl bg-success/8 p-4 ring-1 ring-success/15" data-testid="cockpit-action-result">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CircleCheck className="size-4 text-success" />
                      Hermes {run.status.replaceAll("_", " ")}
                    </div>
                    {run.result ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{governedResultText(run.result)}</p> : null}
                    {run.error ? <p className="mt-2 text-sm text-destructive">{run.error}</p> : null}
                  </section>
                ) : null}

                <Separator />
                <div className="flex flex-col gap-1">
                  <AuditSection title={`Evidence (${card.evidence.length})`}>
                    {card.evidence.length ? (
                      <ul className="flex flex-col gap-2">
                        {card.evidence.map((item, index) => (
                          <li key={`${item.reference}-${index}`}>
                            <span className="font-medium text-foreground">{item.label}</span>
                            <span className="mt-0.5 block break-all">{item.reference}</span>
                            {item.occurredAt ? <span className="mt-0.5 block">{formatExactTime(item.occurredAt)}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : <p>No evidence attached.</p>}
                  </AuditSection>
                  <AuditSection title="Full source references">
                    <p className="break-all">{card.sourceId}</p>
                  </AuditSection>
                  <AuditSection title="Ranking rationale">
                    <p>{card.rankingRationale || "No ranking rationale was supplied."}</p>
                  </AuditSection>
                  <AuditSection title={`Comments (${card.comments.length})`}>
                    {card.comments.length ? (
                      <ul className="flex flex-col gap-3">
                        {card.comments.map((comment) => (
                          <li key={comment.id}>
                            <p className="text-foreground">{comment.body}</p>
                            <p className="mt-1">{comment.actor} · {formatExactTime(comment.createdAt)}</p>
                          </li>
                        ))}
                      </ul>
                    ) : <p>No comments.</p>}
                  </AuditSection>
                  <AuditSection title="Approval history">
                    <p>Current state: {card.approval.state.replaceAll("_", " ")}</p>
                    {card.approval.runId ? <p className="mt-1 break-all">Run: {card.approval.runId}</p> : null}
                    {card.approval.requestId ? <p className="mt-1 break-all">Request: {card.approval.requestId}</p> : null}
                  </AuditSection>
                  <AuditSection title="Technical metadata">
                    <div className="flex flex-col gap-1">
                      <p>Card: {card.id}</p>
                      <p>Created: {formatExactTime(card.createdAt)}</p>
                      <p>Source type: {card.sourceType}</p>
                      <p>Source of truth remains Hermes.</p>
                    </div>
                  </AuditSection>
                </div>
              </div>
            </ScrollArea>

            <SheetFooter className="absolute inset-x-0 bottom-0 border-t border-border bg-popover/95 backdrop-blur-sm">
              <Button size="lg" className="bg-command text-white hover:bg-command/90" disabled={busy !== null} onClick={() => void onAction(action, card)}>
                {action === "investigate" ? <FileSearch data-icon="inline-start" /> : <CircleCheck data-icon="inline-start" />}
                {ACTION_LABELS[action]}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void onAction("comment", card)}>
                <MessageSquareText data-icon="inline-start" />
                Add context
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
