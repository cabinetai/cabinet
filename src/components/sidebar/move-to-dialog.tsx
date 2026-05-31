"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Folder, Home } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTreeStore } from "@/stores/tree-store";
import type { TreeNode as TreeNodeType } from "@/types";
import { cn } from "@/lib/utils";

interface MoveToDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: TreeNodeType | null;
}

interface Target {
  path: string;
  title: string;
  depth: number;
  isCabinet: boolean;
}

function flattenTargets(
  nodes: TreeNodeType[],
  source: TreeNodeType | null,
  depth = 0,
  out: Target[] = []
): Target[] {
  for (const node of nodes) {
    if (node.type !== "directory" && node.type !== "cabinet") continue;
    if (source && node.path === source.path) continue;
    if (source && node.path.startsWith(source.path + "/")) continue;
    out.push({
      path: node.path,
      title: node.frontmatter?.title || node.name,
      depth,
      isCabinet: node.type === "cabinet",
    });
    if (node.children) {
      flattenTargets(node.children, source, depth + 1, out);
    }
  }
  return out;
}

export function MoveToDialog({ open, onOpenChange, source }: MoveToDialogProps) {
  const nodes = useTreeStore((s) => s.nodes);
  const movePage = useTreeStore((s) => s.movePage);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const sourceParent = source
    ? source.path.split("/").slice(0, -1).join("/")
    : "";

  const allTargets = useMemo<Target[]>(() => {
    if (!source) return [];
    const list = flattenTargets(nodes, source);
    // Add root option
    return [{ path: "", title: "Root", depth: 0, isCabinet: false }, ...list];
  }, [nodes, source]);

  const filtered = useMemo<Target[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTargets;
    return allTargets.filter((t) => {
      const hay = `${t.title} ${t.path}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allTargets, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = async (target: Target) => {
    if (!source) return;
    if (target.path === sourceParent) {
      onOpenChange(false);
      return;
    }
    await movePage(source.path, target.path);
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[selectedIndex];
      if (target) handleSelect(target);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        <div className="border-b border-border p-3">
          <Input
            autoFocus
            placeholder={
              source
                ? `Move "${source.frontmatter?.title || source.name}" to…`
                : "Move to…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 shadow-none focus-visible:ring-0 px-0"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching folders
            </div>
          ) : (
            filtered.map((t, i) => {
              const Icon = t.path === ""
                ? Home
                : t.isCabinet
                  ? Archive
                  : Folder;
              const isCurrent = t.path === sourceParent;
              return (
                <button
                  key={t.path || "__root__"}
                  onClick={() => handleSelect(t)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  disabled={isCurrent}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
                    selectedIndex === i && "bg-accent text-accent-foreground",
                    isCurrent && "opacity-50 cursor-not-allowed"
                  )}
                  style={{ paddingLeft: `${t.depth * 14 + 8}px` }}
                >
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      t.isCabinet ? "text-amber-400" : "text-muted-foreground"
                    )}
                  />
                  <span className="truncate">{t.title}</span>
                  {isCurrent && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      current
                    </span>
                  )}
                  {t.path && !isCurrent && (
                    <span className="ml-auto truncate text-[10px] text-muted-foreground/60">
                      {t.path}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          ↑↓ navigate · ↵ select · esc close
        </div>
      </DialogContent>
    </Dialog>
  );
}
