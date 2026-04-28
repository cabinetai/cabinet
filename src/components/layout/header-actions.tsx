"use client";

import { Sparkles, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAIPanelStore } from "@/stores/ai-panel-store";
import { ThemePicker } from "@/components/layout/theme-picker";
import { cn } from "@/lib/utils";

/**
 * Global header actions shared across all file-type toolbars:
 * Search, Terminal toggle, AI panel toggle, Theme picker.
 */
export function HeaderActions() {
  const { isOpen, toggle } = useAIPanelStore();

  return (
    <>
      {/* Search hint */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground hidden sm:flex"
        onClick={() => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true })
          );
        }}
      >
        <Search className="h-3.5 w-3.5" />
        <kbd className="pointer-events-none text-[10px] font-mono bg-muted px-1 py-0.5 rounded">
          ⌘K
        </kbd>
      </Button>

      {/* AI toggle */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={isOpen ? "Close AI panel" : "Open AI panel"}
        title={isOpen ? "Close AI panel" : "Open AI panel"}
        className={cn("h-7 w-7", isOpen && "text-primary")}
        onClick={toggle}
      >
        <Sparkles className="h-4 w-4" />
      </Button>

      {/* Theme picker */}
      <ThemePicker />
    </>
  );
}
