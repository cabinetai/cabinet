"use client";

import { Search } from "lucide-react";
import { ToolbarButton } from "@/components/layout/toolbar-button";

/**
 * Global header actions shared across all file-type toolbars. Just the search
 * affordance now (⌘K in the tooltip). The AI Editor drawer opens from the split
 * "New" button (see NewTaskButton) on KB pages or via ⌘⌥A; the theme picker
 * lives on the home header + Settings → Appearance.
 */
export function HeaderActions() {
  return (
    <ToolbarButton
      icon={Search}
      label="Search"
      title="Search (⌘K)"
      iconOnly
      onClick={() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true })
        );
      }}
    />
  );
}
