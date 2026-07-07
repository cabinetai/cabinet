"use client";

import { useEffect, useState } from "react";
import { FolderSymlink, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CONNECT_KNOWLEDGE_TILES,
  providerLogo,
  type ConnectKnowledgeTile,
} from "@/lib/knowledge-sources/providers";
import type { KnowledgeProviderId } from "@/lib/knowledge-sources/store";

interface DetectedAccount {
  provider: KnowledgeProviderId;
  account: string;
  root: string;
}

/**
 * Connect Knowledge picker — a tile grid of knowledge sources styled like the
 * Integrations Hub "Files & Storage" row. Picking an enabled tile hands off to
 * the matching flow (Local folder → symlink dialog, Google Drive → folder
 * picker); "Soon" tiles are disabled placeholders so the grid reads as a
 * roadmap. See docs/CONNECT_KNOWLEDGE_PRD.md §6/§10.
 */
export function ConnectKnowledgeDialog({
  open,
  onOpenChange,
  onLocal,
  onCloud,
  onNotion,
  onAppleNotes,
  onGithub,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Local folder → the symlink dialog. */
  onLocal: () => void;
  /** A desktop-sync provider → the cloud folder picker. */
  onCloud: (provider: KnowledgeProviderId) => void;
  /** Notion → the import-vs-sync chooser (handled by the caller). */
  onNotion: () => void;
  /** Apple Notes → the macOS-only import dialog (handled by the caller). */
  onAppleNotes: () => void;
  /** GitHub → the remote repository clone & link dialog. */
  onGithub: () => void;
}) {
  const setSection = useAppStore((s) => s.setSection);

  // Apple Notes only exists on macOS — hide the tile elsewhere.
  const isMac =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent);
  const tiles = isMac
    ? CONNECT_KNOWLEDGE_TILES
    : CONNECT_KNOWLEDGE_TILES.filter((t) => t.key !== "apple-notes");

  // Auto-scan: surface the desktop-sync accounts actually installed on this
  // machine, so the user can jump straight to the one they have.
  const [accounts, setAccounts] = useState<DetectedAccount[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/knowledge-sources/scan", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setAccounts(Array.isArray(d.accounts) ? d.accounts : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handlePick = (tile: ConnectKnowledgeTile) => {
    if (tile.kind === "soon") return;
    if (tile.kind === "hub") {
      // Notion can also be imported as files (one-time export) — offer that
      // alongside the live MCP sync, via its own chooser. Confluence and any
      // other hub tiles connect as MCP in the Integrations Hub directly.
      if (tile.key === "notion") {
        onNotion();
        onOpenChange(false);
        return;
      }
      if (tile.key === "apple-notes") {
        onAppleNotes();
        onOpenChange(false);
        return;
      }
      setSection({ type: "integrations", slug: tile.key });
      onOpenChange(false);
      return;
    }
    if (tile.kind === "local") {
      onLocal();
    } else if (tile.kind === "github") {
      onGithub();
      onOpenChange(false);
    } else if (tile.kind === "cloud" && tile.provider) {
      onCloud(tile.provider);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* sm:max-w-3xl overrides the base sm:max-w-sm cap; px-12/py-8 give the
          roomy padding the grid needs so the tiles aren't cramped. */}
      <DialogContent className="sm:max-w-3xl px-12 py-8">
        <DialogHeader>
          <DialogTitle>Connect Knowledge</DialogTitle>
          <DialogDescription>
            Mount a folder or cloud source into this room. Its contents appear in
            the tree and are available to agents as context.
          </DialogDescription>
        </DialogHeader>

        {accounts.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
              Detected on this Mac
            </div>
            <div className="flex flex-wrap gap-2">
              {accounts.map((a) => {
                const logo = providerLogo(a.provider);
                return (
                  <button
                    key={`${a.provider}:${a.account}`}
                    type="button"
                    onClick={() => onCloud(a.provider)}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] transition-colors hover:bg-foreground/[0.04]"
                  >
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt="" className="h-4 w-4 shrink-0" />
                    ) : (
                      <Cloud className="h-4 w-4 shrink-0 text-sky-400" />
                    )}
                    <span className="max-w-[180px] truncate">{a.account}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-5 gap-4 py-2">
          {tiles.map((tile) => {
            const enabled = tile.kind !== "soon";
            return (
              <button
                key={tile.key}
                type="button"
                disabled={!enabled}
                onClick={() => handlePick(tile)}
                className={cn(
                  "group flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-colors",
                  enabled
                    ? "hover:bg-foreground/[0.04] cursor-pointer"
                    : "cursor-default",
                )}
              >
                <div
                  className={cn(
                    "flex h-16 w-16 items-center justify-center rounded-2xl bg-card shadow-sm ring-1 ring-border/50 transition-transform",
                    enabled
                      ? "group-hover:-translate-y-0.5 group-hover:shadow-md"
                      : "opacity-50 grayscale-[0.25]",
                  )}
                >
                  {tile.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tile.logo} alt="" className="h-8 w-8 object-contain" />
                  ) : tile.kind === "local" ? (
                    <FolderSymlink className="h-7 w-7 text-foreground/70" />
                  ) : (
                    <Cloud className="h-7 w-7 text-sky-400" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[12px] font-medium leading-tight",
                    enabled ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {tile.label}
                </span>
                {tile.kind === "local" && (
                  <span className="-mt-1.5 text-[10px] font-normal text-muted-foreground/70">
                    (symlink)
                  </span>
                )}
                {tile.kind === "hub" && tile.key !== "apple-notes" && (
                  <span className="-mt-1.5 text-[10px] font-normal text-muted-foreground/70">
                    in Hub
                  </span>
                )}
                {!enabled && (
                  <span className="rounded-full bg-foreground/[0.04] px-2 py-0.5 text-[10px] font-medium text-muted-foreground/80">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
