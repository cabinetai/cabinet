"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Global header actions shared across all file-type toolbars. Just the search
 * affordance now (⌘K in the tooltip, not inline). The AI Editor drawer opens
 * from the split "New" button (see NewTaskButton) on KB pages or via ⌘⌥A; the
 * theme picker lives on the home header + Settings → Appearance.
 */
export function HeaderActions() {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Search"
      title="Search (⌘K)"
      className="h-7 w-7 text-muted-foreground/60 hover:text-muted-foreground"
      onClick={() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true })
        );
      }}
    >
      <Search className="h-4 w-4" />
    </Button>
  );
}
