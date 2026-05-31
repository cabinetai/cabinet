"use client";

import { NewRoutineDialog } from "@/components/agents/new-routine-dialog";
import { HeartbeatDialog } from "@/components/agents/heartbeat-dialog";

export interface JobDialogState {
  agentSlug: string;
  agentName: string;
  cabinetPath: string;
  agentRole?: string;
  draft: {
    id: string;
    name: string;
    schedule: string;
    prompt: string;
    enabled: boolean;
  };
}

export interface HeartbeatDialogState {
  agentSlug: string;
  agentName: string;
  cabinetPath: string;
  heartbeat: string;
  /** Whether the heartbeat itself is enabled (independent from agent.active). */
  enabled: boolean;
}

/**
 * Thin wrapper around the shared `NewRoutineDialog` so the tasks board
 * schedule view can open the consolidated editor without changing its
 * own API. `onStateChange` is accepted for source-compat but ignored —
 * the inner dialog owns its own draft state.
 */
export function ScheduleJobDialog({
  state,
  onClose,
  onRefresh,
}: {
  state: JobDialogState | null;
  /** Accepted for source-compat; not used (inner dialog owns the draft). */
  onStateChange?: (next: JobDialogState | null) => void;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
}) {
  if (!state) return null;
  return (
    <NewRoutineDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      agent={{
        slug: state.agentSlug,
        name: state.agentName,
        role: state.agentRole,
        cabinetPath: state.cabinetPath,
      }}
      existingJob={state.draft}
      onSaved={() => {
        onClose();
        void onRefresh();
      }}
      onDeleted={() => {
        onClose();
        void onRefresh();
      }}
    />
  );
}

/**
 * Thin wrapper around the shared `HeartbeatDialog` so tasks board schedule-view
 * callers keep compiling. `onStateChange` is accepted for source-compat.
 */
export function ScheduleHeartbeatDialog({
  state,
  onClose,
  onRefresh,
}: {
  state: HeartbeatDialogState | null;
  /** Accepted for source-compat; not used (inner dialog owns the draft). */
  onStateChange?: (next: HeartbeatDialogState | null) => void;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
}) {
  if (!state) return null;
  return (
    <HeartbeatDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      agent={{
        slug: state.agentSlug,
        name: state.agentName,
        cabinetPath: state.cabinetPath,
      }}
      initialHeartbeat={state.heartbeat}
      initialEnabled={state.enabled}
      onSaved={() => {
        onClose();
        void onRefresh();
      }}
    />
  );
}
