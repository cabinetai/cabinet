"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, PenLine, Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

interface AgentTemplate {
  slug: string;
  name: string;
  role?: string;
  emoji?: string;
  department?: string;
  description?: string;
}

/**
 * Pick-agents-from-the-library dialog used by V2's `+ New Agent` button.
 * Multi-select: tick several specialists across departments, then add them
 * all at once. Mirrors the onboarding "Pick your agents" picker in style.
 */
export function NewAgentDialog({
  open,
  onOpenChange,
  cabinetPath,
  existingSlugs,
  onAdded,
  onCreateFromScratch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cabinetPath: string;
  existingSlugs?: Set<string>;
  onAdded: () => void | Promise<void>;
  /** Switch to the build-from-scratch flow. The parent owns that dialog. */
  onCreateFromScratch?: () => void;
}) {
  const { t } = useLocale();
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const added = existingSlugs ?? new Set<string>();

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQuery("");
    let cancel = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch("/api/agents/library");
        if (!res.ok) {
          setError(t("agents:dialog.errorLoadLibrary"));
          return;
        }
        const data = await res.json();
        if (cancel) return;
        setTemplates((data.templates || []) as AgentTemplate[]);
      } catch {
        if (!cancel) setError("Couldn't load the agent library.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open]);

  function toggle(slug: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function addSelected() {
    if (selected.size === 0) return;
    setAdding(true);
    setError(null);
    const failed: string[] = [];
    try {
      for (const slug of selected) {
        const template = templates.find((tpl) => tpl.slug === slug);
        if (!template) continue;
        try {
          const res = await fetch(`/api/agents/library/${slug}/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cabinetPath }),
          });
          // 409 = already on the team; treat as success (idempotent).
          if (!res.ok && res.status !== 409) failed.push(template.name);
        } catch {
          failed.push(template.name);
        }
      }
      await onAdded();
      if (failed.length > 0) {
        setError(`Couldn't add: ${failed.join(", ")}`);
      } else {
        onOpenChange(false);
        setSelected(new Set());
      }
    } finally {
      setAdding(false);
    }
  }

  const filtered = templates.filter((tpl) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      tpl.name.toLowerCase().includes(q) ||
      (tpl.role || "").toLowerCase().includes(q) ||
      (tpl.department || "").toLowerCase().includes(q)
    );
  });

  const grouped = (() => {
    const map = new Map<string, AgentTemplate[]>();
    for (const tpl of filtered) {
      const dept = tpl.department || "general";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(tpl);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([dept, items]) =>
          [dept, items.sort((a, b) => a.name.localeCompare(b.name))] as const
      );
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("agents:dialog.addAgentTitle")}
            {selected.size > 0 ? (
              <span className="text-xs font-medium text-primary">
                ({selected.size} selected)
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {t("agents:dialog.addAgentDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("agents:dialog.searchLibraryPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-full rounded-md border border-border/70 bg-background pl-8 pr-3 text-[12.5px] outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          </div>

          {onCreateFromScratch ? (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onCreateFromScratch();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <PenLine className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-foreground">
                  {t("agents:dialog.createFromScratchTitle")}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {t("agents:dialog.createFromScratchDescription")}
                </span>
              </span>
            </button>
          ) : null}

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </p>
          ) : null}

          <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading the library…
              </div>
            ) : grouped.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-muted-foreground">
                {templates.length === 0 ? "No templates available." : "No matches."}
              </div>
            ) : (
              grouped.map(([dept, items]) => (
                <div key={dept} className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {dept.charAt(0).toUpperCase() + dept.slice(1)}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((tpl) => {
                      const isAdded = added.has(tpl.slug);
                      const isSelected = selected.has(tpl.slug);
                      return (
                        <button
                          key={tpl.slug}
                          type="button"
                          disabled={isAdded}
                          onClick={() => toggle(tpl.slug)}
                          title={tpl.role || tpl.description || tpl.name}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                            isAdded
                              ? "cursor-default border-border bg-muted/40 opacity-60"
                              : isSelected
                                ? "border-primary bg-primary/10"
                                : "border-border bg-card hover:bg-muted/40"
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded border",
                              isSelected || isAdded
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/40"
                            )}
                          >
                            {isSelected || isAdded ? (
                              <Check className="size-3" />
                            ) : null}
                          </span>
                          <span className="text-base leading-none">
                            {tpl.emoji || "🤖"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-semibold text-foreground">
                              {tpl.name}
                            </span>
                            {tpl.role ? (
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {tpl.role}
                              </span>
                            ) : null}
                          </span>
                          {isAdded ? (
                            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Added
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1"
              onClick={addSelected}
              disabled={selected.size === 0 || adding}
            >
              {adding ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              {adding
                ? "Adding…"
                : selected.size > 0
                  ? `Add ${selected.size} agent${selected.size === 1 ? "" : "s"}`
                  : "Add agents"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
