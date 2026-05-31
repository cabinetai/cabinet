"use client";

import { useCallback } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { TaskMeta } from "@/types/tasks";
import type { LaneKey } from "./lane-rules";
import {
  archiveConversation,
  restartConversation,
  restoreConversation,
  setConversationBoardOrder,
  stopConversation,
} from "./board-actions";
import type { PendingUndo } from "./undo-toast";
import type { PendingConfirm } from "./confirm-popover";
import { CARD_DROP_PREFIX, LANE_DROP_PREFIX } from "./dnd-keys";
import { shorten } from "./kanban-view";

interface Args {
  byLane: Record<LaneKey, TaskMeta[]>;
  /**
   * Multi-selection set (task ids). When the dragged card is a member of
   * this set and the set has more than one member, the drop action fans
   * out to every selected card. Otherwise, only the dragged card moves.
   */
  selection: Set<string>;
  clearSelection: () => void;
  onUndoQueued: (undo: PendingUndo) => void;
  onConfirmRequested: (confirm: PendingConfirm) => void;
  onRefresh: () => Promise<void>;
}

/**
 * Fallback boardOrder derivation when a neighbor has no explicit order.
 * Uses its current position in the lane * 1000 so fresh tasks get
 * reasonable spacing without renumbering everyone.
 */
function indexFloor(lane: TaskMeta[], taskId: string): number | undefined {
  const i = lane.findIndex((t) => t.id === taskId);
  return i < 0 ? undefined : (i + 1) * 1000;
}

/**
 * Compute a boardOrder value for a card dropped between `prev` and `next`.
 * Fractional indexing: pick the midpoint. If both neighbors are missing,
 * fall back to the card's visual index * 1000 so stable ordering still works.
 */
function computeBoardOrder(
  prevOrder: number | undefined,
  nextOrder: number | undefined,
  fallbackIdx: number
): number {
  if (prevOrder != null && nextOrder != null) return (prevOrder + nextOrder) / 2;
  if (prevOrder != null) return prevOrder + 1000;
  if (nextOrder != null) return nextOrder / 2;
  return (fallbackIdx + 1) * 1000;
}

export function useDragHandler({
  byLane,
  selection,
  clearSelection,
  onUndoQueued,
  onConfirmRequested,
  onRefresh,
}: Args) {
  return useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id).replace(CARD_DROP_PREFIX, "");
      const overId = String(over.id);

      // Find source lane by scanning byLane.
      let sourceLane: LaneKey | null = null;
      for (const lane of Object.keys(byLane) as LaneKey[]) {
        if (byLane[lane].some((t) => t.id === activeId)) {
          sourceLane = lane;
          break;
        }
      }
      if (!sourceLane) return;

      const task = byLane[sourceLane].find((t) => t.id === activeId);
      if (!task) return;
      const cabinetPath = task.cabinetPath;

      // Resolve bulk set: when the dragged card is a member of the multi-
      // selection and the set has >1 items, every selected TaskMeta (across
      // lanes) is the subject of the drop. Otherwise we act on the single
      // dragged card.
      const isBulk = selection.has(activeId) && selection.size > 1;
      const bulkTasks: TaskMeta[] = isBulk
        ? (Object.values(byLane).flat() as TaskMeta[]).filter((t) => selection.has(t.id))
        : [task];

      // ── Resolve target lane from lane or card drop id ───────────────
      let targetLane: LaneKey | null = null;
      if (overId.startsWith(LANE_DROP_PREFIX)) {
        targetLane = overId.slice(LANE_DROP_PREFIX.length) as LaneKey;
      } else if (overId.startsWith(CARD_DROP_PREFIX)) {
        const overTaskId = overId.slice(CARD_DROP_PREFIX.length);
        for (const lane of Object.keys(byLane) as LaneKey[]) {
          if (byLane[lane].some((t) => t.id === overTaskId)) {
            targetLane = lane;
            break;
          }
        }
      }
      if (!targetLane) return;

      // ── Destructive: Running → anywhere else (Phase 3) ──────────────
      // Only running cards in the bulk set count as destructive; the rest
      // are filtered out so a mixed selection doesn't get rescoped away.
      if (sourceLane === "running" && targetLane !== "running") {
        const archiveAfter = targetLane === "archive";
        const runningTargets = bulkTasks.filter((t) => t.status === "running");
        if (runningTargets.length === 0) return;
        const ids = runningTargets.map((t) => ({ id: t.id, cabinetPath: t.cabinetPath }));
        onConfirmRequested({
          id: `stop:${activeId}`,
          title:
            runningTargets.length === 1
              ? "Stop running conversation?"
              : `Stop ${runningTargets.length} running conversations?`,
          body: archiveAfter
            ? runningTargets.length === 1
              ? `Cancels the active turn and archives "${shorten(runningTargets[0].title)}".`
              : `Cancels the active turns and archives ${runningTargets.length} conversations.`
            : runningTargets.length === 1
              ? `Cancels the active turn for "${shorten(runningTargets[0].title)}".`
              : `Cancels the active turns for ${runningTargets.length} conversations.`,
          confirmLabel: archiveAfter ? "Stop & archive" : "Stop run",
          destructive: true,
          onConfirm: async () => {
            try {
              await Promise.all(ids.map((t) => stopConversation(t.id, t.cabinetPath)));
              if (archiveAfter) {
                await Promise.all(ids.map((t) => archiveConversation(t.id, t.cabinetPath)));
              }
              if (isBulk) clearSelection();
              await onRefresh();
              onUndoQueued({
                id: `stop:${activeId}`,
                message:
                  runningTargets.length === 1
                    ? archiveAfter
                      ? `Stopped & archived "${shorten(runningTargets[0].title)}"`
                      : `Stopped "${shorten(runningTargets[0].title)}"`
                    : archiveAfter
                      ? `Stopped & archived ${runningTargets.length} tasks`
                      : `Stopped ${runningTargets.length} tasks`,
                undo: async () => {
                  if (archiveAfter) {
                    await Promise.all(ids.map((t) => restoreConversation(t.id, t.cabinetPath)));
                  }
                  await Promise.all(ids.map((t) => restartConversation(t.id, t.cabinetPath)));
                  await onRefresh();
                },
              });
            } catch (err) {
              console.error("[board] stop failed", err);
            }
          },
        });
        return;
      }

      // ── Destructive: Archive → Running (Phase 3) ────────────────────
      if (sourceLane === "archive" && targetLane === "running") {
        const archivedTargets = bulkTasks.filter((t) => !!t.archivedAt || t.status === "archived");
        if (archivedTargets.length === 0) return;
        const ids = archivedTargets.map((t) => ({ id: t.id, cabinetPath: t.cabinetPath }));
        onConfirmRequested({
          id: `restart:${activeId}`,
          title:
            archivedTargets.length === 1 ? "Restart conversation?" : `Restart ${archivedTargets.length} conversations?`,
          body:
            archivedTargets.length === 1
              ? `Spawns a fresh run from the original prompt of "${shorten(archivedTargets[0].title)}". The archived run stays in history.`
              : `Spawns fresh runs from ${archivedTargets.length} original prompts. Archived runs stay in history.`,
          confirmLabel: "Restart",
          destructive: false,
          onConfirm: async () => {
            try {
              await Promise.all(ids.map((t) => restoreConversation(t.id, t.cabinetPath)));
              await Promise.all(ids.map((t) => restartConversation(t.id, t.cabinetPath)));
              if (isBulk) clearSelection();
              await onRefresh();
            } catch (err) {
              console.error("[board] restart failed", err);
            }
          },
        });
        return;
      }

      // ── Non-destructive: Archive (any non-archive → archive) ───────
      if (sourceLane !== "archive" && targetLane === "archive") {
        // Archive only members not already archived.
        const targets = bulkTasks.filter((t) => !t.archivedAt && t.status !== "archived");
        if (targets.length === 0) return;
        const ids = targets.map((t) => ({ id: t.id, cabinetPath: t.cabinetPath }));
        try {
          await Promise.all(ids.map((t) => archiveConversation(t.id, t.cabinetPath)));
          if (isBulk) clearSelection();
          await onRefresh();
          onUndoQueued({
            id: `archive:${activeId}`,
            message:
              targets.length === 1
                ? `Archived "${shorten(targets[0].title)}"`
                : `Archived ${targets.length} tasks`,
            undo: async () => {
              await Promise.all(ids.map((t) => restoreConversation(t.id, t.cabinetPath)));
              await onRefresh();
            },
          });
        } catch (err) {
          console.error("[board] archive failed", err);
        }
        return;
      }

      // ── Non-destructive: Restore (archive → non-running) ──────────
      if (sourceLane === "archive" && targetLane !== "archive") {
        const targets = bulkTasks.filter((t) => !!t.archivedAt || t.status === "archived");
        if (targets.length === 0) return;
        const ids = targets.map((t) => ({ id: t.id, cabinetPath: t.cabinetPath }));
        try {
          await Promise.all(ids.map((t) => restoreConversation(t.id, t.cabinetPath)));
          if (isBulk) clearSelection();
          await onRefresh();
          onUndoQueued({
            id: `restore:${activeId}`,
            message:
              targets.length === 1
                ? `Restored "${shorten(targets[0].title)}"`
                : `Restored ${targets.length} tasks`,
            undo: async () => {
              await Promise.all(ids.map((t) => archiveConversation(t.id, t.cabinetPath)));
              await onRefresh();
            },
          });
        } catch (err) {
          console.error("[board] restore failed", err);
        }
        return;
      }

      // ── Same-lane reorder (persist boardOrder) ─────────────────────
      // Single-card only — bulk reordering of arbitrary members doesn't
      // have a well-defined semantic, so if the user is in a multi-select
      // we skip the reorder branch entirely (they can drop their single
      // card to reorder only after clearing the selection).
      if (isBulk) return;
      // @dnd-kit's SortableContext rearranges visually; we need to write
      // the new index to ConversationMeta.boardOrder so the server of
      // truth matches. Compute a fractional midpoint between neighbors
      // (or first/last + nudge) to avoid renumbering everyone.
      if (sourceLane === targetLane && overId.startsWith(CARD_DROP_PREFIX)) {
        const overTaskId = overId.slice(CARD_DROP_PREFIX.length);
        if (overTaskId === activeId) return;
        const lane = byLane[sourceLane];
        const overIdx = lane.findIndex((t) => t.id === overTaskId);
        const activeIdx = lane.findIndex((t) => t.id === activeId);
        if (overIdx < 0 || activeIdx < 0) return;

        // Build the post-move order as @dnd-kit would render it.
        const reordered = [...lane];
        const [moved] = reordered.splice(activeIdx, 1);
        reordered.splice(overIdx, 0, moved);
        const newIdx = reordered.findIndex((t) => t.id === activeId);
        const prev = newIdx > 0 ? reordered[newIdx - 1] : null;
        const next = newIdx < reordered.length - 1 ? reordered[newIdx + 1] : null;
        const prevOrder = prev?.boardOrder ?? (prev ? indexFloor(reordered, prev.id) : undefined);
        const nextOrder = next?.boardOrder ?? (next ? indexFloor(reordered, next.id) : undefined);
        const newOrder = computeBoardOrder(prevOrder, nextOrder, newIdx);

        try {
          await setConversationBoardOrder(activeId, newOrder, cabinetPath);
          await onRefresh();
        } catch (err) {
          console.error("[board] reorder failed", err);
        }
        return;
      }

      // Other cross-lane drops with no defined action: ignore.
    },
    [byLane, selection, clearSelection, onUndoQueued, onConfirmRequested, onRefresh]
  );
}
