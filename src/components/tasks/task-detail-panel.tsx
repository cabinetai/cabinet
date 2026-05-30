"use client";

import { ArrowUpRight, Bell, BellOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { TaskConversationPage } from "@/components/tasks/conversation/task-conversation-page";
import { TaskComposeBody } from "@/components/tasks/task-compose-body";
import { SideDrawer } from "@/components/ui/side-drawer";
import { useSideDrawer } from "@/hooks/use-side-drawer";
import { Button } from "@/components/ui/button";
import { setConversationMuted } from "@/components/tasks/board/board-actions";
import { useLocale } from "@/i18n/use-locale";

/**
 * The single task side-drawer, opened from the task rail, the sidebar, and the
 * kanban board alike (all dispatch `setTaskPanelConversation`). It is a thin
 * frame: the embedded `TaskConversationPage` (compact variant) owns the whole
 * header — title, status, runtime, Stop/Done/Compact/menu — and this panel only
 * injects its own frame controls (Mute · Enlarge · Close) via `chromeActions`.
 * "Enlarge" navigates to the full `/tasks/[id]` page rather than an in-place
 * fullscreen overlay, so there are exactly two surfaces: this drawer and the
 * full page.
 */
export function TaskDetailPanel() {
  const { t } = useLocale();
  const conversation = useAppStore((s) => s.taskPanelConversation);
  const section = useAppStore((s) => s.section);
  const pushSection = useAppStore((s) => s.pushSection);
  const taskPanelOpen = useAppStore((s) => s.taskPanelOpen);
  const taskPanelMode = useAppStore((s) => s.taskPanelMode);
  const composeContext = useAppStore((s) => s.taskPanelComposeContext);
  const closeTaskPanel = useAppStore((s) => s.closeTaskPanel);
  const drawer = useSideDrawer({
    isOpen: taskPanelOpen,
    storageKey: "cabinet-task-panel-width",
  });

  // Mute is a per-conversation setting; the store snapshot can be stale, so
  // track it locally and flip optimistically on toggle.
  const [muted, setMuted] = useState(!!conversation?.muted);
  const [muting, setMuting] = useState(false);
  const conversationId = conversation?.id ?? null;
  useEffect(() => {
    setMuted(!!conversation?.muted);
  }, [conversationId, conversation?.muted]);

  if (!drawer.shouldRender) return null;

  const isCompose = taskPanelMode === "compose" || !conversation;

  const openFullPage = () => {
    if (!conversation) return;
    closeTaskPanel();
    // pushSection records `returnTo`, so the full page shows a Back chip into
    // wherever the drawer was opened from (board, tasks list, …).
    pushSection(
      {
        type: "task",
        taskId: conversation.id,
        cabinetPath: conversation.cabinetPath,
      },
      section
    );
  };

  async function toggleMuted() {
    if (!conversation || muting) return;
    const next = !muted;
    setMuting(true);
    setMuted(next); // optimistic
    try {
      await setConversationMuted(conversation.id, next, conversation.cabinetPath);
    } catch (err) {
      console.error("[task-panel] mute toggle failed", err);
      setMuted(!next); // revert
    } finally {
      setMuting(false);
    }
  }

  // Frame controls owned by the drawer (not the conversation page) so they're
  // reachable in every conversation-page state — including the terminal/loading
  // early-returns and on desktop where the drawer has no scrim to dismiss it.
  const frameControls = conversation ? (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
        disabled={muting}
        onClick={toggleMuted}
        title={muted ? t("taskDetail:unmuteTask") : t("taskDetail:muteTask")}
        aria-label={muted ? t("taskDetail:unmuteTask") : t("taskDetail:muteTask")}
      >
        {muted ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
        onClick={openFullPage}
        title={t("tinyExtras:openFullTaskViewer")}
      >
        <ArrowUpRight className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0"
        onClick={closeTaskPanel}
        title={t("taskDetail:close")}
      >
        <X className="size-4" />
      </Button>
    </>
  ) : null;

  const content =
    isCompose || !conversation ? (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            New task
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            onClick={closeTaskPanel}
            title={t("taskDetail:close")}
          >
            <X className="size-4" />
          </Button>
        </div>
        <TaskComposeBody context={composeContext} />
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-end gap-1 px-2 py-1.5">
          {frameControls}
        </div>
        <TaskConversationPage
          taskId={conversation.id}
          cabinetPath={conversation.cabinetPath}
          variant="compact"
          returnContext={{
            type: "task",
            taskId: conversation.id,
            cabinetPath: conversation.cabinetPath,
          }}
        />
      </div>
    );

  return (
    <SideDrawer drawer={drawer} onScrimClick={closeTaskPanel}>
      {content}
    </SideDrawer>
  );
}
