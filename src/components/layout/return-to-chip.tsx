"use client";

import { ChevronRight } from "lucide-react";
import { useAppStore } from "@/stores/app-store";

/**
 * Small "Back to task" / "Back to agent" chip rendered inside the viewer toolbar
 * when the user navigated here from a task/agent/cabinet context. Pops the
 * previous section from the app-store returnTo stack. Renders nothing when
 * there's no return context.
 */
export function ReturnToChip() {
  const returnTo = useAppStore((s) => s.returnTo);
  const popReturnTo = useAppStore((s) => s.popReturnTo);
  if (!returnTo) return null;

  const parentLabel = (() => {
    switch (returnTo.type) {
      case "task":
        return "Task";
      case "tasks":
        return "Tasks";
      case "agent":
        return "Agent";
      case "agents":
        return "Agents";
      case "cabinet":
        return "Cabinet";
      case "home":
        return "Home";
      case "settings":
        return "Settings";
      case "registry":
        return "Registry";
      default:
        return "Back";
    }
  })();

  return (
    <button
      type="button"
      onClick={popReturnTo}
      className="inline-flex shrink-0 items-center gap-0.5 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors"
      title={`Back to ${parentLabel}`}
    >
      <span className="hover:underline underline-offset-2">{parentLabel}</span>
      <ChevronRight className="size-3.5 opacity-40" />
    </button>
  );
}
