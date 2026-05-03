"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OptaleOperationalSpineBinding } from "@/lib/optale/operational-spine";

type InspectorValue = string | number | boolean | null | undefined;

interface InspectorField {
  label: string;
  value: InspectorValue;
}

interface InspectorEvidence {
  label: string;
  value: string | number | boolean;
}

export interface OptaleCommandInspectorPanelProps {
  title: string;
  subtitle?: string;
  badge?: { label: string; tone: string };
  href?: string;
  fields: InspectorField[];
  evidence: InspectorEvidence[];
  spine?: OptaleOperationalSpineBinding;
}

function inspectorValue(value: InspectorValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copyValue = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={copyValue}
      title={copied ? "Copied" : `Copy ${label}`}
      aria-label={copied ? "Copied" : `Copy ${label}`}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:text-foreground",
        copied
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-background",
      )}
    >
      {copied ? (
        <CheckCircle2 className="size-3.5" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

export function OptaleCommandInspectorPanel({
  title,
  subtitle,
  badge,
  href,
  fields,
  evidence,
  spine,
}: OptaleCommandInspectorPanelProps) {
  const visibleFields = fields.filter((field) => inspectorValue(field.value));
  const spineRefs = spine ? Object.values(spine.refs) : [];

  return (
    <aside className="rounded-lg border border-border bg-card p-4 shadow-sm xl:sticky xl:top-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {badge ? (
          <span
            className={cn(
              "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
              badge.tone,
            )}
          >
            {badge.label}
          </span>
        ) : null}
      </div>

      {href && href !== "#" ? (
        <div className="mt-3 flex items-center gap-1.5">
          <a
            href={href}
            className="inline-flex rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Open source
          </a>
          <CopyButton value={href} label="source link" />
        </div>
      ) : null}

      {visibleFields.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {visibleFields.map((field) => (
            <div
              key={field.label}
              className="rounded-md border border-border/70 bg-background px-2 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-medium text-muted-foreground">
                  {field.label}
                </div>
                <CopyButton
                  value={inspectorValue(field.value)}
                  label={field.label}
                />
              </div>
              <div className="mt-0.5 break-words text-xs text-foreground">
                {inspectorValue(field.value)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-2 text-[11px] font-medium text-muted-foreground">
          Evidence
        </div>
        {evidence.length === 0 ? (
          <div className="rounded-md border border-border/70 bg-background px-2 py-2 text-xs text-muted-foreground">
            No evidence attached.
          </div>
        ) : (
          <div className="grid gap-1.5">
            {evidence.map((item, index) => (
              <div
                key={`${item.label}:${index}`}
                className="rounded-md border border-border/70 bg-background px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-medium text-muted-foreground">
                    {item.label}
                  </div>
                  <CopyButton
                    value={inspectorValue(item.value)}
                    label={item.label}
                  />
                </div>
                <div className="mt-0.5 break-words text-xs text-foreground">
                  {inspectorValue(item.value)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {spineRefs.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-medium text-muted-foreground">
            Spine Refs
          </div>
          <div className="grid gap-1.5">
            {spineRefs.map((ref) => (
              <div
                key={ref.capability}
                className="rounded-md border border-border/70 bg-background px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {ref.capability.replaceAll("_", " ")}
                  </span>
                  <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {ref.status}
                  </span>
                </div>
                <div className="mt-1 flex items-start gap-2">
                  <div className="min-w-0 flex-1 break-all text-[11px] text-foreground">
                    {ref.ref}
                  </div>
                  <CopyButton value={ref.ref} label={`${ref.capability} ref`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
