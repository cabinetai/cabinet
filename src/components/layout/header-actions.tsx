"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemePicker } from "@/components/layout/theme-picker";

/**
 * Global header actions shared across all file-type toolbars: Search and
 * Theme picker. The AI Editor drawer is opened from the primary half of the
 * split "New" button (see NewTaskButton) on KB pages, or globally via the
 * ⌘⌥A hotkey — it no longer has a standalone toolbar toggle.
 */
export function HeaderActions() {
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

      {/* Theme picker */}
      <ThemePicker />
    </>
  );
}
