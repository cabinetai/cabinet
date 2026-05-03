"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Archive, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTreeStore } from "@/stores/tree-store";
import { useAppStore } from "@/stores/app-store";
import { AgentPicker } from "@/components/agents/agent-picker";
import { useAgentPicker } from "@/hooks/use-agent-picker";

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
  const [name, setName] = useState(defaultName);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadTree = useTreeStore((s) => s.loadTree);
  const selectPage = useTreeStore((s) => s.selectPage);
  const setSection = useAppStore((s) => s.setSection);
  const picker = useAgentPicker();

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
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create space");
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
      setError("Failed to create space");
      setCreating(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget && !creating) onOpenChange(false);
      }}
    >
      <div className="relative w-full max-w-5xl mx-4 my-8 bg-card rounded-2xl border border-border shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-8 pt-8 pb-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Create New Space</h2>
            <p className="text-sm text-muted-foreground mt-1">
              A space is a governed workspace with its own agents, jobs, and knowledge.
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            <button
              onClick={() => !creating && onOpenChange(false)}
              disabled={creating}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleCreate} className="px-8 pb-8 space-y-6">
          {/* Space name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Space name</label>
            <Input
              placeholder="e.g. My Startup, Marketing Team, Research Lab..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="text-base h-11"
              disabled={creating}
            />
          </div>

          {/* Agent picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Select agents</label>
              <span className="text-xs text-muted-foreground">
                {picker.agents.filter((a) => a.checked).length} selected
              </span>
            </div>
            <AgentPicker
              agents={picker.agents}
              libraryTemplates={picker.templates}
              onToggle={picker.toggleAgent}
              loading={picker.loading}
              layout="grid"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating ? "Creating..." : "Create Space"}
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
          title="New Space"
          className="flex min-w-0 items-center gap-1.5 w-full text-xs px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          <Archive className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">New Space</span>
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
