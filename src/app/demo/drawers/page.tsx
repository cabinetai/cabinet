"use client";

/**
 * Demo: the unified task drawer (src/components/tasks/task-detail-panel.tsx).
 *
 * It's the real component (not a mock), so this always reflects production.
 * We drive it through the new app-store actions: open it in "compose"
 * (generic or editor/page-scoped) and load an existing conversation by id.
 * State is restored on unmount so visiting this page doesn't leak into the
 * rest of the app.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { useAppStore } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";

const DEFAULT_TASK_ID = "2026-05-15T15-23-30-013Z-3a52ce78-editor-manual";
const DEMO_PAGE_PATH = "data/demo/example-page";

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[12px] leading-relaxed">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="text-foreground/80">{value}</span>
    </div>
  );
}

export default function DrawersDemoPage() {
  const [taskId, setTaskId] = useState(DEFAULT_TASK_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTask = useCallback(async (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/agents/conversations/${encodeURIComponent(trimmed)}`
      );
      if (!res.ok) {
        throw new Error(`Conversation not found (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (!data?.meta) throw new Error("Response had no conversation meta");
      useAppStore.getState().setTaskPanelConversation(data.meta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load task");
    } finally {
      setLoading(false);
    }
  }, []);

  // Seed a page (so editor-scoped compose has a pinned page) and open the
  // drawer in compose mode on mount; restore globals on unmount.
  useEffect(() => {
    const prevPath = useEditorStore.getState().currentPath;
    useEditorStore.setState({ currentPath: DEMO_PAGE_PATH });
    useAppStore.getState().openTaskPanelCompose();

    return () => {
      useAppStore.getState().closeTaskPanel();
      useAppStore.getState().setTaskPanelConversation(null);
      useEditorStore.setState({ currentPath: prevPath });
    };
  }, []);

  const openGeneric = () => useAppStore.getState().openTaskPanelCompose();
  const openEditor = () =>
    useAppStore.getState().openTaskPanelCompose({
      source: "editor",
      pinnedPagePath: DEMO_PAGE_PATH,
      defaultAgentSlug: "editor",
    });
  const closeDrawer = () => useAppStore.getState().closeTaskPanel();

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border/70 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">
          Task drawer demo
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          The single unified drawer — compose a new task, or load an existing
          conversation. Best viewed on a wide desktop window.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={openGeneric}
            className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-[12px] font-medium transition-colors hover:bg-accent"
          >
            Compose (generic)
          </button>
          <button
            onClick={openEditor}
            className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-[12px] font-medium transition-colors hover:bg-accent"
          >
            Compose (editor / page)
          </button>
          <span className="mx-1 h-5 w-px bg-border" />
          <input
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            spellCheck={false}
            className="h-8 w-[420px] max-w-full rounded-md border border-border bg-card px-2 font-mono text-[12px] outline-none focus:ring-2 focus:ring-ring"
            placeholder="conversation / task id"
          />
          <button
            onClick={() => void loadTask(taskId)}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            Load conversation
          </button>
          <button
            onClick={closeDrawer}
            className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-[12px] font-medium transition-colors hover:bg-accent"
          >
            Close
          </button>
          {error && (
            <span className="text-[12px] text-destructive">{error}</span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-8 overflow-auto p-8">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="space-y-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              Task drawer
            </h2>
            <div className="space-y-0.5 rounded-lg bg-muted/40 p-3 ring-1 ring-border/50">
              <SpecRow label="Source" value="task-detail-panel.tsx" />
              <SpecRow label="Width" value="resizable 380–760, default 480" />
              <SpecRow label="Open/close" value="width push/release tween" />
              <SpecRow label="Modes" value="compose · conversation" />
              <SpecRow label="Chrome" value="header + fullscreen + X" />
            </div>
          </div>
          {/* The drawer docks to the inline-end of this flex row and animates
              its width, exactly as it does in the real app shell. */}
          <div className="flex h-[78vh] overflow-hidden rounded-xl border border-border bg-background shadow-sm">
            <div className="flex-1" />
            <TaskDetailPanel />
          </div>
        </section>
      </div>
    </div>
  );
}
