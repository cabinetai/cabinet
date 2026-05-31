/**
 * Centralized drop-target id prefixes. Both lane columns and card rows
 * register droppables under one shared DndContext; these prefixes let the
 * drag-end handler tell them apart.
 */
export const LANE_DROP_PREFIX = "lane:";
export const CARD_DROP_PREFIX = "card:";

import type { LaneKey } from "./lane-rules";

export function laneDropId(lane: LaneKey): string {
  return `${LANE_DROP_PREFIX}${lane}`;
}
export function cardDropId(taskId: string): string {
  return `${CARD_DROP_PREFIX}${taskId}`;
}
