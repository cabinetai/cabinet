"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Archive, X, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTreeStore } from "@/stores/tree-store";
import { useAppStore } from "@/stores/app-store";
import { AgentPicker } from "@/components/agents/agent-picker";
import { useAgentPicker } from "@/hooks/use-agent-picker";
import { useLocale } from "@/i18n/use-locale";

interface NewCabinetDialogProps {
  /** When provided, the dialog is controlled externally (context menu use case). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Parent path for the new cabinet (empty = root). */
  parentPath?: string;
  /** Pre-filled name. */
  defaultName?: string;
}

function NewCabinetOverlay({
  open,
  onOpenChange,
  parentPath = "",
  defaultName = "",
}: NewCabinetDialogProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, locale } = useLocale();
  const [name, setName] = useState(defaultName);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadTree = useTreeStore((s) => s.loadTree);
  const selectPage = useTreeStore((s) => s.selectPage);
  const setSection = useAppStore((s) => s.setSection);
  const picker = useAgentPicker();

  // Reset state when opening (or when the prefill changes while open):
  // adjust state during render instead of in an effect
  // (react-hooks/set-state-in-effect) — the pattern from
  // react.dev/learn/you-might-not-need-an-effect.
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevDefaultName, setPrevDefaultName] = useState(defaultName);
  if (open !== prevOpen || defaultName !== prevDefaultName) {
    setPrevOpen(open);
    setPrevDefaultName(defaultName);
    if (open) {
      setName(defaultName);
      setCreating(false);
      setError(null);
    }
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !creating) onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, creating, onOpenChange]);

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/cabinets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          parentPath,
          selectedAgents: picker.selectedSlugs,
          locale,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("dialogs:newCabinet.createFailed"));
        setCreating(false);
        return;
      }

      const data = await res.json();
      await loadTree();
      selectPage(data.path);
      setSection({
        type: "cabinet",
        cabinetPath: data.path,
      });
      onOpenChange(false);
    } catch {
      setError(t("dialogs:newCabinet.createFailed"));
      setCreating(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget && !creating) onOpenChange(false);
      }}
    >
      <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col bg-card rounded-2xl border border-border shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between px-8 pt-8 pb-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{t("dialogs:newCabinet.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("dialogs:newCabinet.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                // Carry the current cabinet so the import lands inside it (a
                // child), not at the data-dir root as a sibling room.
                setSection({
                  type: "registry",
                  cabinetPath: parentPath || undefined,
                });
              }}
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              {t("dialogs:newCabinet.importFromRegistry")}
            </button>
            <button
              onClick={() => !creating && onOpenChange(false)}
              disabled={creating}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
          {/* Cabinet name — fixed */}
          <div className="shrink-0 space-y-1.5 px-8 pb-4">
            <label className="text-sm font-medium text-foreground">{t("dialogs:newCabinet.nameLabel")}</label>
            <Input
              placeholder={t("dialogs:newCabinet.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="text-base h-11"
              disabled={creating}
            />
          </div>

          {/* Agent picker label — fixed so the count stays visible while scrolling */}
          <div className="flex shrink-0 items-center justify-between px-8 pb-2">
            <label className="text-sm font-medium text-foreground">{t("dialogs:newCabinet.selectAgents")}</label>
            <span className="text-xs text-muted-foreground">
              {t("dialogs:newCabinet.selectedCount", { count: picker.agents.filter((a) => a.checked).length })}
            </span>
          </div>

          {/* Agent picker — the only region that scrolls, and only on short windows */}
          <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-4">
            <AgentPicker
              agents={picker.agents}
              libraryTemplates={picker.templates}
              onToggle={picker.toggleAgent}
              loading={picker.loading}
              layout="grid"
            />
          </div>

          {/* Footer — fixed */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-8 py-4">
            {error && (
              <p className="me-auto text-sm text-destructive">{error}</p>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating ? t("dialogs:newCabinet.creating") : t("dialogs:newCabinet.createCabinet")}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export function NewCabinetDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  parentPath = "",
  defaultName = "",
}: NewCabinetDialogProps) {
  const { t } = useLocale();
  const controlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlled ? controlledOpen! : internalOpen;
  const setOpen = controlled ? controlledOnOpenChange! : setInternalOpen;

  // Uncontrolled mode: render with trigger button
  if (!controlled) {
    return (
      <>
        <button
          onClick={() => setInternalOpen(true)}
          title={t("dialogs:newCabinet.trigger")}
          className="flex min-w-0 items-center gap-1.5 w-full text-xs px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          <Archive className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{t("dialogs:newCabinet.trigger")}</span>
        </button>
        {open && (
          <NewCabinetOverlay
            open={open}
            onOpenChange={setOpen}
            parentPath={parentPath}
            defaultName={defaultName}
          />
        )}
      </>
    );
  }

  // Controlled mode
  if (!open) return null;
  return (
    <NewCabinetOverlay
      open={open}
      onOpenChange={setOpen}
      parentPath={parentPath}
      defaultName={defaultName}
    />
  );
}
