"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAppStore } from "@/stores/app-store";
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
 * Pick-an-agent-from-the-library dialog used by V2's `+ New Agent` button.
 * Self-contained (no panel coupling) so it can mount anywhere. Once a
 * template is added, navigates to the new agent's detail page so the user
 * lands inside the agent's profile, ready to edit.
 */
export function NewAgentDialog({
  open,
  onOpenChange,
  cabinetPath,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cabinetPath: string;
  onAdded: () => void | Promise<void>;
}) {
  const { t } = useLocale();
  const setSection = useAppStore((s) => s.setSection);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingSlug, setAddingSlug] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
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

  async function add(template: AgentTemplate) {
    setAddingSlug(template.slug);
    setError(null);
    try {
      const res = await fetch(`/api/agents/library/${template.slug}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cabinetPath }),
      });
      // 409 = already exists — just navigate to it.
      if (!res.ok && res.status !== 409) {
        setError(t("agents:dialog.errorAddAgent"));
        return;
      }
      await onAdded();
      onOpenChange(false);
      setSection({
        type: "agent",
        slug: template.slug,
        cabinetPath,
      });
    } finally {
      setAddingSlug(null);
    }
  }

  const filtered = templates.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.role || "").toLowerCase().includes(q) ||
      (t.department || "").toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("agents:dialog.addAgentTitle")}</DialogTitle>
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

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </p>
          ) : null}

          <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border/60">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading the library…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-muted-foreground">
                {templates.length === 0
                  ? "No templates available."
                  : "No matches."}
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {filtered.map((t) => (
                  <li key={t.slug}>
                    <button
                      type="button"
                      onClick={() => void add(t)}
                      disabled={addingSlug !== null}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40 disabled:opacity-60"
                    >
                      <span className="text-lg leading-none">
                        {t.emoji || "🤖"}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[12.5px] font-semibold text-foreground">
                          {t.name}
                        </span>
                        {t.role ? (
                          <span className="truncate text-[11px] text-muted-foreground">
                            {t.role}
                          </span>
                        ) : null}
                      </div>
                      {addingSlug === t.slug ? (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <Plus className="size-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
