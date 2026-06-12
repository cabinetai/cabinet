"use client";

import { useEffect } from "react";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { artifactPathToTreePath } from "@/lib/ui/page-type-icons";

/**
 * Keeps the sidebar + open editor in sync with files that agent tasks create or
 * change — without the user having to refresh.
 *
 * Tasks publish the files they touch as `artifactPaths` on the conversation SSE
 * stream (incrementally as turns finalize, and authoritatively on the terminal
 * `task.updated`). We accumulate those, then on a short debounce:
 *   - refresh the file tree so new/renamed files appear,
 *   - mark changed paths in the sidebar (tint + dot, cleared when opened),
 *   - reload the open page if it changed and has no unsaved edits; if it has
 *     unsaved edits, offer a non-destructive "Reload" toast instead of
 *     clobbering them.
 *
 * Mount once (in the app shell). Rides the same global event stream the recent-
 * tasks list uses, so it costs one extra SSE subscription.
 */
export function useTaskFileSync(): void {
  useEffect(() => {
    const es = new EventSource("/api/agents/conversations/events");

    let pending = new Set<string>();
    let flushTimer: number | null = null;
    // Don't re-toast the same dirty page on every debounce tick during a run.
    let notifiedDirtyPath: string | null = null;

    const flush = () => {
      flushTimer = null;
      const treePaths = [...pending];
      pending = new Set();
      if (treePaths.length === 0) return;

      const editor = useEditorStore.getState();
      const openPath = editor.currentPath;

      // Highlight everything except the page the user is already looking at.
      useTreeStore.getState().markChanged(treePaths.filter((p) => p !== openPath));
      void useTreeStore.getState().loadTree();

      if (openPath && treePaths.includes(openPath)) {
        if (!editor.isDirty) {
          void editor.loadPage(openPath); // safe: no unsaved edits
          notifiedDirtyPath = null;
        } else if (notifiedDirtyPath !== openPath && typeof window !== "undefined") {
          notifiedDirtyPath = openPath;
          window.dispatchEvent(
            new CustomEvent("cabinet:toast", {
              detail: {
                kind: "info",
                message: "A task changed this page. Reload to see the update?",
                actionLabel: "Reload",
                onAction: () => void useEditorStore.getState().loadPage(openPath),
              },
            }),
          );
        }
      }
    };

    const schedule = (rawPaths: string[]) => {
      for (const raw of rawPaths) {
        const tp = artifactPathToTreePath(raw);
        if (tp) pending.add(tp);
      }
      if (flushTimer === null) flushTimer = window.setTimeout(flush, 250);
    };

    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as {
          type?: string;
          payload?: { artifactPaths?: unknown; artifacts?: unknown };
        };
        if (!event || event.type === "ping") return;
        const p = event.payload ?? {};
        const raw = [
          ...(Array.isArray(p.artifactPaths) ? p.artifactPaths : []),
          ...(Array.isArray(p.artifacts) ? p.artifacts : []),
        ].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
        if (raw.length > 0) schedule(raw);
      } catch {
        // ignore malformed events
      }
    };

    return () => {
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      es.close();
    };
  }, []);
}
