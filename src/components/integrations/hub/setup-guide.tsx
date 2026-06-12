"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { CatalogSetupStep } from "@/lib/agents/mcp-catalog";

/**
 * Numbered, vertical setup guide for an integration. Renders the catalog's
 * `setupSteps` (single source of the copy) and, when an `art` renderer is
 * supplied, a per-step "mini-mockup" beneath each step — a stylized rendition
 * of the third-party UI the user is looking at, built from theme tokens so it
 * stays accurate and needs no screenshot assets. See `discord-setup-art.tsx`.
 */
export function SetupGuide({
  steps,
  brand,
  art,
}: {
  steps: CatalogSetupStep[];
  brand: string;
  /** Optional bespoke visual for step `index` (0-based). */
  art?: (index: number) => ReactNode;
}) {
  if (!steps?.length) return null;

  return (
    <section className="mt-9">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        Set up in {steps.length} {steps.length === 1 ? "step" : "steps"}
      </h2>
      <ol className="mt-4 space-y-5">
        {steps.map((step, i) => {
          const stepArt = art?.(i);
          return (
            <li key={step.title} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                  style={{ background: `${brand}1f`, color: brand }}
                >
                  {i + 1}
                </span>
                {i < steps.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <h3 className="text-[14px] font-medium text-foreground">{step.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>

                {(step.copy || step.href) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {step.copy && <CopyChip value={step.copy} />}
                    {step.href && (
                      <a
                        href={step.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground transition-colors hover:bg-accent"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}

                {stepArt && <div className="mt-3 max-w-sm">{stepArt}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CopyChip({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground transition-colors hover:bg-accent"
    >
      {done ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}
