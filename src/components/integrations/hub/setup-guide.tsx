"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, Info } from "lucide-react";
import type { CatalogSetupStep } from "@/lib/agents/mcp-catalog";
import { cn } from "@/lib/utils";

/**
 * Numbered, vertical setup guide for an integration. Renders the catalog's
 * `setupSteps` (single source of the copy).
 *
 * Beyond title/body, a step may carry: an `action` (the one button to click), a
 * `callout` (a caveat that must not be skimmed past), an `image` (a cropped shot
 * of the real third-party control), and a `fallback` (a collapsed escape hatch).
 * All optional — a `{title, body}` step renders exactly as it always has, which
 * is what keeps the other integrations untouched.
 *
 * `art` is the older stylized-mockup path, still used by Discord/Telegram/Drive.
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
                {/* Was text-muted-foreground: crucial sentences read as filler. */}
                <p className="mt-1 text-[13px] leading-relaxed text-foreground/80">{step.body}</p>

                {step.action && (
                  <a
                    href={step.action.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
                    style={{ background: brand }}
                  >
                    {step.action.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}

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

                {step.callout && <Callout tone={step.callout.tone} body={step.callout.body} />}

                {step.image && <StepImage {...step.image} />}

                {step.fallback && <Fallback {...step.fallback} />}

                {stepArt && <div className="mt-3 max-w-sm">{stepArt}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Callout({ tone, body }: { tone: "warning" | "info"; body: string }) {
  const warn = tone === "warning";
  const Icon = warn ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "mt-2.5 flex gap-2 rounded-md border border-l-[3px] px-2.5 py-2",
        warn
          ? "border-amber-300 border-l-amber-500 bg-amber-50 dark:border-amber-500/40 dark:border-l-amber-500 dark:bg-amber-500/10"
          : "border-border border-l-muted-foreground/50 bg-muted/40",
      )}
    >
      <Icon
        className={cn(
          "mt-px h-3.5 w-3.5 shrink-0",
          warn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        )}
      />
      <p
        className={cn(
          "text-[12.5px] leading-relaxed",
          warn ? "text-amber-900 dark:text-amber-100" : "text-foreground/80",
        )}
      >
        {body}
      </p>
    </div>
  );
}

/**
 * A real screenshot of the third-party UI. The captures are light-mode only, so
 * the *frame* carries the theme — that way one asset reads correctly in both
 * themes without dual assets or muddy CSS filters.
 */
function StepImage({
  src,
  alt,
  caption,
  frameLabel,
}: {
  src: string;
  alt: string;
  caption?: string;
  frameLabel?: string;
}) {
  return (
    <figure className="mt-3 max-w-sm overflow-hidden rounded-lg border border-border bg-background">
      <figcaption className="border-b border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
        {frameLabel ?? "What you'll see"}
      </figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block w-full" loading="lazy" />
      {caption && (
        <p className="border-t border-border px-2.5 py-1.5 text-[11.5px] leading-relaxed text-foreground/70">
          {caption}
        </p>
      )}
    </figure>
  );
}

function Fallback({ summary, body, copy }: { summary: string; body: string; copy?: string }) {
  return (
    <details className="mt-2.5 rounded-md border border-border bg-muted/30 px-2.5 py-2">
      <summary className="cursor-pointer text-[12.5px] text-foreground/80 hover:text-foreground">
        {summary}
      </summary>
      <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/80">{body}</p>
      {copy && (
        <>
          <pre className="mt-2 max-h-56 overflow-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
            {copy}
          </pre>
          <div className="mt-2">
            <CopyChip value={copy} />
          </div>
        </>
      )}
    </details>
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
